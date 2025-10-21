import { ScraperState } from './ScraperState.js';
import { ListingExtractor } from '../extractors/ListingExtractor.js';
import { ProfileExtractor } from '../extractors/ProfileExtractor.js';
import { PageNavigator } from '../navigation/PageNavigator.js';
import { TaskQueue } from '../queue/TaskQueue.js';
import { RateLimiter } from '../queue/RateLimiter.js';
import { SequentialStrategy } from '../scrapers/strategies/SequentialStrategy.js';
import { ParallelStrategy } from '../scrapers/strategies/ParallelStrategy.js';
import { humanizedWait, simulateHumanBehavior, getAdaptiveDelay } from '../utils/antiDetection.js';
import {
  SCRAPER_CONCURRENCY,
  SCRAPER_MAX_REQUESTS_PER_MINUTE,
  SCRAPER_PROFILE_DELAY_MS,
  SCRAPER_PAGE_DELAY_MS,
  SCRAPER_SESSION_REFRESH_INTERVAL_MS
} from '../config/scraperConfig.js';

/**
 * Orchestrates the entire scraping workflow
 * Coordinates extractors, navigation, strategies, and persistence
 */
export class ScraperOrchestrator {
  constructor(auth, repositories, options = {}) {
    this.auth = auth;
    this.resumeRepo = repositories.resumeRepo;
    this.profileRepo = repositories.profileRepo;
    this.options = options;
    this.defaults = {
      concurrency: options.defaultConcurrency ?? SCRAPER_CONCURRENCY,
      profileDelay: options.defaultProfileDelay ?? SCRAPER_PROFILE_DELAY_MS,
      pageDelay: options.defaultPageDelay ?? SCRAPER_PAGE_DELAY_MS,
      maxRequestsPerMinute: options.maxRequestsPerMinute ?? SCRAPER_MAX_REQUESTS_PER_MINUTE
    };

    // Create components
    this.listingExtractor = new ListingExtractor();
    this.profileExtractor = new ProfileExtractor();
    this.navigator = new PageNavigator();
    this.taskQueue = new TaskQueue();
    this.rateLimiter = new RateLimiter({
      maxRequestsPerMinute: this.defaults.maxRequestsPerMinute,
      errorThreshold: options.errorThreshold || 5
    });

    // State
    this.state = null;
    this.errorCount = 0;
    this.lastRequestTime = 0;
    this.sessionId = null;
    this.searchQuery = null;

    // Event emitter (will be set by CathoScraper)
    this.emitter = null;

    // Adaptive tuning
    this.performanceGoal = {
      targetProfilesPerMin: null,
      targetProfiles: null,
      timeBudgetMinutes: null,
      mode: 'balanced'
    };
    const clampConcurrency = (value) => Math.max(1, Math.min(6, Math.round(value)));
    const baseConcurrency = clampConcurrency(this.defaults.concurrency);
    this.modePresets = {
      conservative: {
        minConcurrency: clampConcurrency(Math.max(1, baseConcurrency - 1)),
        maxConcurrency: clampConcurrency(baseConcurrency),
        rpmMultiplier: 0.85,
        profileDelayMultiplier: 1.2
      },
      balanced: {
        minConcurrency: baseConcurrency,
        maxConcurrency: clampConcurrency(baseConcurrency + 1),
        rpmMultiplier: 1,
        profileDelayMultiplier: 1
      },
      fast: {
        minConcurrency: clampConcurrency(baseConcurrency + 1),
        maxConcurrency: clampConcurrency(baseConcurrency + 2),
        rpmMultiplier: 1.15,
        profileDelayMultiplier: 0.85
      }
    };
    this.metrics = {
      samples: [],
      startTime: null,
      currentProfilesPerMin: 0,
      avgProfileLatencyMs: null,
      lastAdjustment: 0,
      currentConcurrency: this.defaults.concurrency,
      currentProfileDelay: this.defaults.profileDelay,
      rpmLimit: this.rateLimiter.maxRequestsPerMinute,
      phaseTimings: {
        lastListingMs: null,
        lastProfileNavMs: null,
        lastProfileExtractionMs: null,
        lastProfileSaveMs: null
      },
      lastProfileStatus: null,
      lastProfileError: null
    };
    this.isExternallyPaused = false;
    this.stopReason = null;
    this.reauthLock = null;
    this.authFailureCount = 0;
  }

  /**
   * Set event emitter
   */
  setEmitter(emitter) {
    this.emitter = emitter;
  }

  /**
   * Emit event if emitter is set
   */
  emit(event, data) {
    if (this.emitter) {
      const payload =
        data && typeof data === 'object' && !Array.isArray(data)
          ? { sessionId: this.sessionId, ...data }
          : { sessionId: this.sessionId, data };
      this.emitter.emit(event, payload);
    }
  }

  async navigateWithAuth(page, navigateFn, context = {}) {
    const maxAttempts = 2;
    let attempt = 0;

    if (!page) {
      return { success: false, error: 'no_page_available' };
    }

    while (attempt < maxAttempts) {
      try {
        await this.auth.ensureAuthenticated(page, { forceCheck: attempt > 0 });
      } catch (error) {
        console.warn('⚠️ Não foi possível validar a sessão antes da navegação:', error.message);
      }

      try {
        await this.auth.applySessionTo(page);
      } catch (error) {
        console.warn('⚠️ Não foi possível revalidar sessão da página:', error.message);
      }

      const result = await navigateFn();
      if (result?.success) {
        return result;
      }

      const loginRedirect = Boolean(result?.loginRedirect);
      const blocked = Boolean(result?.blocked);
      const reasonLabel = context.reason || (loginRedirect ? 'navigation_login_redirect' : 'navigation_blocked');

      if (loginRedirect || blocked || /login/i.test(String(result?.error || ''))) {
        const recovered = await this.handleAuthLoss({
          ...context,
          page,
          reason: reasonLabel,
          status: result?.status ?? null
        });
        if (!recovered) {
          return {
            success: false,
            error: result?.error || 'reauthentication_failed',
            loginRedirect: true,
            blocked: Boolean(result?.blocked),
            status: result?.status ?? null
          };
        }
        attempt++;
        continue;
      }

      return result;
    }

    return { success: false, error: 'login_redirect', loginRedirect: true };
  }

  async handleAuthLoss(context = {}) {
    const reason = context.reason || 'auth_issue';

    if (this.reauthLock) {
      const outcome = await this.reauthLock;
      if (outcome && context.page) {
        try {
          await this.auth.applySessionTo(context.page);
          context.page.__cathoSessionStamp = Date.now();
          context.page.__cathoAuthReady = true;
        } catch (error) {
          console.warn('⚠️ Falha ao reaplicar sessão após reautenticação compartilhada:', error.message);
        }
      }
      return outcome;
    }

    this.emit('control', {
      action: 'reauth-start',
      reason,
      sessionId: this.sessionId,
      timestamp: Date.now()
    });

    this.reauthLock = (async () => {
      const success = await this.auth.reauthenticate(reason);

      if (success) {
        try {
          const mainPage = this.auth.getPage();
          if (mainPage) {
            await this.auth.applySessionTo(mainPage);
            mainPage.__cathoSessionStamp = Date.now();
            mainPage.__cathoAuthReady = true;
          }
          if (context.page) {
            await this.auth.applySessionTo(context.page);
            context.page.__cathoSessionStamp = Date.now();
            context.page.__cathoAuthReady = true;
          }
        } catch (error) {
          console.warn('⚠️ Falha ao reaplicar sessão pós reautenticação:', error.message);
        }
        this.rateLimiter.reset();
        this.authFailureCount = 0;
        this.emit('control', {
          action: 'reauth-success',
          reason,
          sessionId: this.sessionId,
          timestamp: Date.now()
        });
        return true;
      }

      this.authFailureCount++;
      this.stopReason = this.stopReason || { reason: 'auth_failure' };
      this.emit('error', {
        message: 'Reauthentication failed',
        reason,
        sessionId: this.sessionId
      });
      this.emit('control', {
        action: 'reauth-failed',
        reason,
        sessionId: this.sessionId,
        timestamp: Date.now()
      });
      return false;
    })();

    try {
      return await this.reauthLock;
    } finally {
      this.reauthLock = null;
    }
  }

  /**
   * Main orchestration method
   */
  async orchestrate(sessionId, searchQuery, searchUrl, options) {
    // Initialize state
    this.sessionId = sessionId;
    this.searchQuery = searchQuery;
    this.state = new ScraperState(sessionId, searchQuery, options);
    this.state.start();
    this.stopReason = null;

    const {
      maxPages,
      delay = this.defaults.pageDelay,
      scrapeFullProfiles = true,
      profileDelay = this.defaults.profileDelay,
      enableParallel = true,
      concurrency = this.defaults.concurrency
    } = options;

    this.initializeAdaptiveSettings(options, {
      requestedConcurrency: concurrency,
      profileDelay
    });
    this.updateStateMetrics();

    try {
      const page = this.auth.getPage();

      // Navigate to search page
      this.emit('navigation', {
        action: 'navigating_to_search',
        url: searchUrl,
        searchQuery: this.searchQuery
      });
      const navResult = await this.navigateWithAuth(
        page,
        () => this.navigator.goToSearch(page, searchUrl, 1),
        { reason: 'search_navigation', url: searchUrl }
      );

      if (!navResult?.success) {
        throw new Error(`Failed to navigate to search: ${navResult?.error || 'navigation_failed'}`);
      }

      this.lastRequestTime = navResult.requestTime || 0;

      const filtersApplied = await this.navigator.applyFiltersIfNeeded(page, options);
      if (filtersApplied) {
        await humanizedWait(page, 1200, 0.25);
        await simulateHumanBehavior(page);
      }

      // Extract total results count
      const totalResults = await this.navigator.getTotalResults(page);
      if (totalResults > 0) {
        console.log(`📊 Total results found: ${totalResults}`);
        this.state.setFilteredCount(totalResults);
        this.emit('count', {
          total: totalResults,
          filtered: totalResults,
          searchQuery: this.searchQuery
        });
      }

      const hasPageLimit = typeof maxPages === 'number' && maxPages > 0;
      const effectivePageCap = hasPageLimit ? maxPages : Number.POSITIVE_INFINITY;
      let currentPage = 1;
      let consecutiveStalledPages = 0;
      const maxStalledPages = 2;

      this.state.setTotalPages(hasPageLimit ? maxPages : 0);

      while (currentPage <= effectivePageCap) {
        if (!(await this.handleControlSignals())) {
          console.log('ℹ️ Stopping due to external signal');
          break;
        }

        if (this.hasReachedGoal()) {
          console.log('ℹ️ Goal reached. Finalizing scraping workflow.');
          break;
        }

        this.state.setCurrentPage(currentPage);
        console.log(`\n📄 Processing page ${currentPage}${Number.isFinite(effectivePageCap) ? `/${effectivePageCap}` : ''}...`);

        const currentProgress = this.state.getProgress();

        this.emit('page', {
          currentPage,
          totalPages: hasPageLimit ? effectivePageCap : currentProgress.totalPages,
          progress: currentProgress,
          searchQuery: this.searchQuery
        });

        try {
          const progressBeforeExtraction = this.state.getProgress();
          const previousUniqueCount = progressBeforeExtraction.resumesScraped || 0;

          // Extract resumes from current page
          const listingStart = Date.now();
          const pageResumes = await this.listingExtractor.extract(page, { searchQuery });
          this.metrics.phaseTimings.lastListingMs = Date.now() - listingStart;
          const limitedResumes = pageResumes.slice(0, 21);

          if (limitedResumes.length === 0) {
            console.log('⚠️ No resumes found on this page. Finishing...');
            break;
          }

          const resumesWithSession = limitedResumes.map(resume => ({
            ...resume,
            session_id: this.sessionId
          }));

          // Save basic resume data
          await this.resumeRepo.batchInsert(resumesWithSession, this.sessionId);

          // Add resume URLs to state and task queue
          resumesWithSession.forEach(resume => {
            if (resume.profile_url) {
              this.state.addResumeUrl(resume.profile_url);
              this.taskQueue.addTasks([resume.profile_url]);

              // Emit resume event
              this.emit('resume', { resume, searchQuery: this.searchQuery });
            }
          });

          console.log(`✓ Collected ${resumesWithSession.length} resumes from this page`);
          console.log(`📈 Total collected so far: ${this.state.progress.resumesScraped}`);

          this.updateAndEmitProgress();
          const updatedProgress = this.state.getProgress();

          const newUniqueCount = (updatedProgress.resumesScraped || 0) - previousUniqueCount;
          consecutiveStalledPages = newUniqueCount > 0 ? 0 : consecutiveStalledPages + 1;

          if (totalResults > 0 && limitedResumes.length > 0 && !hasPageLimit) {
            const estimatedTotalPages = Math.ceil(totalResults / limitedResumes.length);
            if (estimatedTotalPages > 0) {
              this.state.setTotalPages(estimatedTotalPages);
            }
          }

          if (this.checkpointService && this.sessionId) {
            try {
              await this.checkpointService.updateCheckpoint(this.sessionId, {
                currentPage,
                profilesScraped: updatedProgress.resumesScraped || 0,
                errorCount: this.errorCount
              });
            } catch (checkpointError) {
              console.warn('⚠️ Failed to update checkpoint:', checkpointError.message);
            }
          }

          await this.adjustPerformanceIfNeeded();

          if (consecutiveStalledPages >= maxStalledPages) {
            console.log('ℹ️ No new resumes detected in consecutive pages. Stopping to avoid loops.');
            break;
          }

          // Scrape full profiles if enabled
          if (this.hasReachedGoal()) {
            console.log('ℹ️ Goal met after listing extraction. Ending session.');
            break;
          }

          if (scrapeFullProfiles && limitedResumes.length > 0) {
            if (!(await this.handleControlSignals())) {
              console.log('ℹ️ Interrompendo scraping de perfis por sinal externo.');
              break;
            }

            const profileUrls = limitedResumes
              .filter(r => r.profile_url)
              .map(r => r.profile_url);

            if (profileUrls.length > 0) {
              this.state.setProfilesTotal(this.state.progress.profilesTotal + profileUrls.length);

              // Choose strategy based on settings
              const dynamicConcurrency = Math.max(1, this.metrics.currentConcurrency || concurrency || 21);
              const dynamicProfileDelay = Math.max(300, Math.floor(this.metrics.currentProfileDelay || profileDelay || 2500));
              const shouldUseParallel = enableParallel && dynamicConcurrency > 1 && profileUrls.length >= 3;
              const profileContext = {
                page,
                concurrency: dynamicConcurrency,
                profileDelay: dynamicProfileDelay,
                searchQuery,
                browser: this.auth.browser
              };

              let sequentialWorkerPage = null;

              if (!shouldUseParallel && this.auth.browser) {
                try {
                  sequentialWorkerPage = await this.auth.browser.newPage();
                  await this.auth.preparePage(sequentialWorkerPage);
                  await this.auth.applySessionTo(sequentialWorkerPage);
                  sequentialWorkerPage.__cathoAuthReady = true;
                  sequentialWorkerPage.__cathoSessionStamp = Date.now();
                  profileContext.page = sequentialWorkerPage;
                } catch (workerError) {
                  console.warn('⚠️ Could not create dedicated profile page:', workerError.message);
                  if (sequentialWorkerPage) {
                    await sequentialWorkerPage.close().catch(() => {});
                    sequentialWorkerPage = null;
                  }
                  profileContext.page = page;
                }
              }

              try {
                await this.scrapeProfiles(profileUrls, shouldUseParallel, profileContext);
              } finally {
                // Clean up sequential worker page
                if (sequentialWorkerPage) {
                  await sequentialWorkerPage.close().catch(() => {});
                }

                // Clean up parallel workers from strategy (if any)
                if (shouldUseParallel && this.parallelStrategy && typeof this.parallelStrategy.cleanup === 'function') {
                  await this.parallelStrategy.cleanup().catch(() => {});
                }

                // Always return to search page after profile scraping
                try {
                  console.log('🔄 Retornando à página de busca...');
                  await this.navigateWithAuth(
                    page,
                    () => this.navigator.goToSearch(page, searchUrl, currentPage),
                    { reason: 'search_recovery', url: searchUrl }
                  );
                } catch (navError) {
                  console.warn(`⚠️ Falha ao retornar à página de busca: ${navError.message}`);
                }
              }
            }
          }

          if (currentPage >= effectivePageCap) {
            console.log('ℹ️ Page limit reached. Finishing...');
            break;
          }

          const hasNext = await this.navigator.hasNextPage(page);

          if (!hasNext) {
            console.log('ℹ️ No more pages available');
            break;
          }

          const adaptivePageDelay = getAdaptiveDelay(delay, this.errorCount, this.lastRequestTime);
          await humanizedWait(page, adaptivePageDelay, 0.35);
          await simulateHumanBehavior(page);

          const nextResult = await this.navigateWithAuth(
            page,
            () => this.navigator.goToNextPage(page),
            { reason: 'pagination', pageNumber: currentPage + 1 }
          );
          if (!nextResult?.success) {
            console.log('ℹ️ Could not navigate to next page');
            break;
          }

          currentPage++;

        } catch (error) {
          console.error(`❌ Error processing page ${currentPage}:`, error.message);
          this.errorCount++;
          this.emit('error', {
            message: error.message,
            page: currentPage,
            searchQuery: this.searchQuery
          });
          break;
        }
      }

      let finalStatus = 'completed';

      if (this.stopReason?.reason === 'stop_requested') {
        this.state.stop('user_stop');
        finalStatus = 'stopped';
      } else if (this.stopReason?.reason === 'time_budget_exceeded') {
        this.state.stop('time_budget_exceeded');
        finalStatus = 'time_budget_exceeded';
      } else if (this.stopReason?.reason === 'target_profiles_reached') {
        this.state.complete();
        finalStatus = 'target_reached';
      } else {
        this.state.complete();
      }

      const progressSnapshot = this.state.getProgress();

      this.emit('done', {
        total: progressSnapshot.resumesScraped,
        profilesScraped: progressSnapshot.profilesScraped,
        duration: progressSnapshot.duration,
        searchQuery: this.searchQuery,
        reason: this.stopReason?.reason || finalStatus
      });

      if (finalStatus === 'stopped') {
        console.log(`\n⏹️ Scraping stopped pelo usuário. Total parcial: ${progressSnapshot.resumesScraped}`);
      } else if (finalStatus === 'time_budget_exceeded') {
        console.log(`\n⏱️ Tempo limite atingido. Total coletado: ${progressSnapshot.resumesScraped}`);
      } else if (finalStatus === 'target_reached') {
        console.log(`\n🥳 Meta atingida! Total: ${progressSnapshot.resumesScraped}`);
      } else {
        console.log(`\n✅ Scraping completed! Total: ${progressSnapshot.resumesScraped} resumes`);
      }

      return {
        success: true,
        total: progressSnapshot.resumesScraped,
        profilesScraped: progressSnapshot.profilesScraped,
        sessionId,
        reason: this.stopReason?.reason || finalStatus
      };

    } catch (error) {
      this.state.fail(error);
      this.emit('error', { message: error.message, searchQuery: this.searchQuery });
      console.error('❌ Error during orchestration:', error);
      throw error;
    }
  }

  getControlSignals() {
    if (this.emitter && typeof this.emitter.getControlSignals === 'function') {
      return this.emitter.getControlSignals();
    }
    return { stopRequested: false, pauseRequested: false };
  }

  async handleControlSignals() {
    const signals = this.getControlSignals();

    if (signals.stopRequested) {
      if (!this.stopReason) {
        this.stopReason = { reason: 'stop_requested' };
      }
      return false;
    }

    if (signals.pauseRequested) {
      await this.waitWhilePaused();
      if (this.stopReason && this.stopReason.reason === 'stop_requested') {
        return false;
      }
    } else if (this.isExternallyPaused) {
      this.isExternallyPaused = false;
      this.state.resume();
      this.updateAndEmitProgress({ skipSample: true });
      this.emit('control', {
        action: 'resumed',
        sessionId: this.sessionId
      });
    }

    return true;
  }

  async waitWhilePaused() {
    if (!this.state || this.stopReason?.reason === 'stop_requested') {
      return;
    }

    if (!this.isExternallyPaused) {
      this.isExternallyPaused = true;
      this.state.pause();
      this.updateAndEmitProgress({ skipSample: true });
      this.emit('control', {
        action: 'paused',
        sessionId: this.sessionId
      });
    }

    while (this.isExternallyPaused) {
      await new Promise(resolve => setTimeout(resolve, 500));
      const signals = this.getControlSignals();
      if (signals.stopRequested) {
        this.stopReason = this.stopReason || { reason: 'stop_requested' };
        break;
      }
      if (!signals.pauseRequested) {
        this.isExternallyPaused = false;
        this.state.resume();
        this.updateAndEmitProgress({ skipSample: true });
        this.emit('control', {
          action: 'resumed',
          sessionId: this.sessionId
        });
        break;
      }
    }
  }

  hasReachedGoal() {
    if (!this.performanceGoal) {
      return false;
    }

    if (this.stopReason && this.stopReason.reason === 'stop_requested') {
      return true;
    }

    const profilesScraped = this.state?.progress?.profilesScraped || 0;
    const resumesScraped = this.state?.progress?.resumesScraped || 0;

    if (this.performanceGoal.targetProfiles && profilesScraped >= this.performanceGoal.targetProfiles) {
      if (!this.stopReason) {
        this.stopReason = { reason: 'target_profiles_reached' };
      }
      return true;
    }

    if (this.performanceGoal.timeBudgetMinutes) {
      const elapsed = Date.now() - (this.metrics.startTime || Date.now());
      if (elapsed >= this.performanceGoal.timeBudgetMinutes * 60000) {
        if (!this.stopReason) {
          this.stopReason = { reason: 'time_budget_exceeded' };
        }
        return true;
      }
    }

    // If no explicit target was provided but we collected enough resumes, stop when no more tasks
    if (
      !this.performanceGoal.targetProfiles &&
      this.performanceGoal.targetProfilesPerMin &&
      resumesScraped >= this.performanceGoal.targetProfilesPerMin * (this.performanceGoal.timeBudgetMinutes || 10)
    ) {
      return false; // heuristic only, do not stop automatically
    }

    return false;
  }

  initializeAdaptiveSettings(options = {}, defaults = {}) {
    const adaptive = options.adaptive || {};
    const advanced = options.advanced || {};

    const parsePositiveInt = (value, fallback = null) => {
      const parsed = parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
      return fallback;
    };

    const targetProfilesPerMin = parsePositiveInt(adaptive.targetProfilesPerMin, 21);
    const targetProfiles = parsePositiveInt(adaptive.targetProfiles);
    const timeBudgetMinutes = parsePositiveInt(adaptive.timeBudgetMinutes);

    const requestedConcurrency =
      parsePositiveInt(defaults.requestedConcurrency) ??
      parsePositiveInt(advanced.concurrency) ??
      parsePositiveInt(options.concurrency);

    const requestedProfileDelay =
      parsePositiveInt(defaults.profileDelay) ??
      parsePositiveInt(advanced.profileDelay) ??
      parsePositiveInt(options.profileDelay) ??
      2500;

    const normalizedMode = typeof adaptive.mode === 'string'
      ? adaptive.mode.toLowerCase()
      : 'balanced';
    const modeSettings = this.modePresets[normalizedMode] || this.modePresets.balanced;
    this.modeSettings = modeSettings;

    const initialProfileDelay = Math.max(
      500,
      Math.round(requestedProfileDelay * (modeSettings.profileDelayMultiplier || 1))
    );
    const latencySeconds = Math.max(initialProfileDelay / 1000, 0.5);
    const concurrencyFromTarget = Math.ceil((targetProfilesPerMin * latencySeconds) / 60);

    let derivedConcurrency = requestedConcurrency || concurrencyFromTarget || modeSettings.minConcurrency || 21;
    derivedConcurrency = this.clampConcurrency(derivedConcurrency, modeSettings);

    this.performanceGoal = {
      targetProfilesPerMin,
      targetProfiles,
      timeBudgetMinutes,
      mode: normalizedMode
    };

    const rpmLimit = Math.ceil(targetProfilesPerMin * (modeSettings.rpmMultiplier || 1.4));

    this.metrics = {
      ...this.metrics,
      samples: [],
      startTime: Date.now(),
      currentProfilesPerMin: 0,
      avgProfileLatencyMs: initialProfileDelay,
      lastAdjustment: Date.now(),
      currentConcurrency: derivedConcurrency,
      currentProfileDelay: initialProfileDelay,
      rpmLimit
    };

    this.rateLimiter.setMaxRequestsPerMinute(rpmLimit);

    if (this.state) {
      this.state.setMetrics({
        profilesPerMinute: 0,
        avgProfileLatencyMs: initialProfileDelay,
        concurrency: derivedConcurrency,
        rpmLimit,
        etaMs: null,
        targetProfilesPerMinute: targetProfilesPerMin,
        targetProfiles,
        mode: normalizedMode
      });
    }
  }

  clampConcurrency(value, presets = {}) {
    if (!Number.isFinite(value)) {
      return presets.minConcurrency || 1;
    }

    const min = presets.minConcurrency || 1;
    const max = presets.maxConcurrency || Math.max(min, 8);
    return Math.min(max, Math.max(min, Math.round(value)));
  }

  recordThroughputSample() {
    if (!this.state || !this.metrics) {
      return;
    }

    const now = Date.now();
    const progress = this.state.progress || {};
    const profilesScraped = progress.profilesScraped || 0;
    const resumesScraped = progress.resumesScraped || 0;
    const measurementCount = profilesScraped > 0 ? profilesScraped : resumesScraped;

    if (!Array.isArray(this.metrics.samples)) {
      this.metrics.samples = [];
    }

    this.metrics.samples.push({ timestamp: now, count: measurementCount });

    const windowMs = 60000;
    this.metrics.samples = this.metrics.samples.filter(sample => now - sample.timestamp <= windowMs);

    if (this.metrics.samples.length >= 2) {
      const first = this.metrics.samples[0];
      const last = this.metrics.samples[this.metrics.samples.length - 1];
      const deltaCount = last.count - first.count;
      const deltaMinutes = (last.timestamp - first.timestamp) / 60000;
      this.metrics.currentProfilesPerMin = deltaMinutes > 0 ? deltaCount / deltaMinutes : this.metrics.currentProfilesPerMin;
    } else if (measurementCount > 0) {
      const elapsedMinutes = (now - this.metrics.startTime) / 60000;
      if (elapsedMinutes > 0) {
        this.metrics.currentProfilesPerMin = measurementCount / elapsedMinutes;
      }
    }

    if (measurementCount > 0) {
      const elapsedMs = now - this.metrics.startTime;
      if (elapsedMs > 0) {
        this.metrics.avgProfileLatencyMs = elapsedMs / measurementCount;
      }
    }
  }

  estimateEta(totalScraped) {
    if (!this.performanceGoal || !this.performanceGoal.targetProfiles) {
      return null;
    }

    const remaining = this.performanceGoal.targetProfiles - totalScraped;
    if (remaining <= 0) {
      return 0;
    }

    const throughput = this.metrics.currentProfilesPerMin || 0;
    if (throughput <= 0) {
      return null;
    }

    return Math.round((remaining / throughput) * 60000);
  }

  updateStateMetrics() {
    if (!this.state) {
      return;
    }

    const limiterStats = this.rateLimiter.getStats();
    const progress = this.state.progress || {};
    const profilesScraped = progress.profilesScraped || 0;

    const throughput = typeof this.metrics.currentProfilesPerMin === 'number'
      ? Number(this.metrics.currentProfilesPerMin.toFixed(1))
      : 0;

    const averageLatency = this.metrics.avgProfileLatencyMs
      ? Math.round(this.metrics.avgProfileLatencyMs)
      : null;

    const rpmUtilization = limiterStats.maxRequestsPerMinute > 0
      ? Number((limiterStats.requestsLastMinute / limiterStats.maxRequestsPerMinute).toFixed(2))
      : 0;

    const phaseTimings = {
      ...this.metrics.phaseTimings
    };

    this.state.setMetrics({
      profilesPerMinute: throughput,
      avgProfileLatencyMs: averageLatency,
      concurrency: this.metrics.currentConcurrency,
      rpmLimit: limiterStats.maxRequestsPerMinute,
      rpmUtilization,
      rateLimiter: limiterStats,
      etaMs: this.estimateEta(profilesScraped),
      targetProfilesPerMinute: this.performanceGoal?.targetProfilesPerMin || null,
      targetProfiles: this.performanceGoal?.targetProfiles || null,
      mode: this.performanceGoal?.mode || null,
      phaseTimings,
      lastProfileStatus: this.metrics.lastProfileStatus ?? null,
      lastProfileError: this.metrics.lastProfileError
    });
  }

  updateAndEmitProgress(options = {}) {
    const { skipSample = false } = options;
    if (!skipSample) {
      this.recordThroughputSample();
    }
    this.updateStateMetrics();
    const snapshot = this.state.getProgress();
    this.emit('progress', snapshot);
    this.emit('metrics', {
      searchQuery: this.searchQuery,
      timestamp: Date.now(),
      metrics: snapshot.metrics
    });
  }

  async adjustPerformanceIfNeeded() {
    if (!this.performanceGoal || !this.performanceGoal.targetProfilesPerMin) {
      return;
    }

    const now = Date.now();
    if (now - (this.metrics.lastAdjustment || 0) < 15000) {
      return;
    }

    const target = this.performanceGoal.targetProfilesPerMin;
    const current = this.metrics.currentProfilesPerMin || 0;
    const presets = this.modeSettings || this.modePresets.balanced;

    const profilesScraped = this.state?.progress?.profilesScraped || 0;
    const attempts = profilesScraped + this.errorCount;
    const errorRate = attempts > 0 ? this.errorCount / attempts : 0;

    let newConcurrency = this.metrics.currentConcurrency || presets.minConcurrency || 1;
    const increaseThreshold = target * 0.9;
    const decreaseThreshold = target * 1.25;

    const maxConcurrency = presets.maxConcurrency || newConcurrency + 1;
    const minConcurrency = presets.minConcurrency || 1;

    if (current < increaseThreshold && errorRate < 0.05) {
      newConcurrency = Math.min(maxConcurrency, newConcurrency + 1);
    } else if ((errorRate > 0.1 || current > decreaseThreshold) && newConcurrency > minConcurrency) {
      newConcurrency = Math.max(minConcurrency, newConcurrency - 1);
    }

    let metricsChanged = false;

    if (newConcurrency !== this.metrics.currentConcurrency) {
      this.metrics.currentConcurrency = newConcurrency;
      metricsChanged = true;
      this.emit('control', {
        action: 'concurrency-adjusted',
        value: newConcurrency,
        sessionId: this.sessionId
      });
    }

    if (errorRate > 0.12) {
      this.metrics.currentProfileDelay = Math.min(this.metrics.currentProfileDelay * 1.2, 8000);
      metricsChanged = true;
    } else if (current < target && this.metrics.currentProfileDelay > 800) {
      this.metrics.currentProfileDelay = Math.max(this.metrics.currentProfileDelay * 0.9, 700);
      metricsChanged = true;
    }

    const desiredRpm = Math.ceil(target * (presets.rpmMultiplier || 1.4));
    if (desiredRpm !== this.metrics.rpmLimit) {
      this.metrics.rpmLimit = desiredRpm;
      this.rateLimiter.setMaxRequestsPerMinute(desiredRpm);
      metricsChanged = true;
      this.emit('control', {
        action: 'rpm-adjusted',
        value: desiredRpm,
        sessionId: this.sessionId
      });
    }

    this.metrics.lastAdjustment = now;

    if (metricsChanged) {
      this.updateStateMetrics();
    }
  }

  /**
   * Scrape full profiles using appropriate strategy
   */
  async scrapeProfiles(profileUrls, useParallel, context) {
    const { page, searchQuery } = context;
    const concurrency = Math.max(1, context.concurrency || this.metrics.currentConcurrency || 21);
    const profileDelay = Math.max(300, context.profileDelay || this.metrics.currentProfileDelay || 2500);

    // Create scrape and save functions
    const scrapeFunction = async (workerPage, url) => {
      const targetPage = workerPage || page;
      if (!targetPage) {
        return { success: false, error: 'no_available_page' };
      }
      let attempt = 0;
      let lastResult = null;

      const recordFailure = async (failureResult) => {
        try {
          await this.resumeRepo.updateScrapeAttempt(url, false, failureResult?.error || 'unknown_error');
        } catch (repoError) {
          console.warn('⚠️ Falha ao registrar tentativa de scrape:', repoError.message);
        }
      };

      while (attempt < 2) {
        const canContinue = await this.handleControlSignals();
        if (!canContinue) {
          const failure = { success: false, error: 'stop_requested' };
          await recordFailure(failure);
          return failure;
        }

        try {
          const now = Date.now();
          const needsRefresh =
            !targetPage.__cathoSessionStamp ||
            now - targetPage.__cathoSessionStamp > SCRAPER_SESSION_REFRESH_INTERVAL_MS;
          if (needsRefresh || attempt > 0) {
            await this.auth.applySessionTo(targetPage);
            targetPage.__cathoSessionStamp = Date.now();
            targetPage.__cathoAuthReady = true;
          }
          await this.auth.ensureAuthenticated(targetPage, { forceCheck: attempt > 0 });
        } catch (sessionError) {
          console.warn('⚠️ Falha ao preparar sessão do worker:', sessionError.message);
        }

        await this.rateLimiter.waitForSlot();

        let result;
        try {
          result = await this.profileExtractor.extract(targetPage, { profileUrl: url });
          if (result.success && !this.profileExtractor.validate({ data: result.data })) {
            result = {
              success: false,
              error: 'invalid_profile_data',
              loginRedirect: result.loginRedirect,
              blocked: result.blocked,
              status: result.status,
              requestTime: result.requestTime,
              extractionTime: result.extractionTime
            };
          }
        } catch (scrapeError) {
          result = {
            success: false,
            error: scrapeError.message,
            loginRedirect: false,
            blocked: false
          };
        }

        const responseMeta = {
          status: result.status ?? null,
          loginRedirect: Boolean(result.loginRedirect),
          blocked: Boolean(result.blocked)
        };

        if (result.success) {
          this.rateLimiter.recordRequest(responseMeta);
          this.lastRequestTime = result.requestTime || 0;
        } else {
          this.rateLimiter.recordError(result.error, responseMeta);
          this.errorCount++;
        }

        if (typeof result.requestTime === 'number') {
          this.metrics.phaseTimings.lastProfileNavMs = result.requestTime;
        }
        if (typeof result.extractionTime === 'number') {
          this.metrics.phaseTimings.lastProfileExtractionMs = result.extractionTime;
        }
        this.metrics.lastProfileStatus = responseMeta.status ?? null;
        this.metrics.lastProfileError = result.success ? null : result.error || null;

        if (result.success) {
          return result;
        }

        if ((result.loginRedirect || result.blocked) && attempt === 0) {
          lastResult = result;
          const recovered = await this.handleAuthLoss({
            reason: result.loginRedirect ? 'profile_login_redirect' : 'profile_blocked',
            page: targetPage,
            url
          });
          if (!recovered) {
            const failure = { ...result, success: false };
            await recordFailure(failure);
            return failure;
          }
          attempt += 1;
          continue;
        }

        await recordFailure(result);
        return result;
      }

      const fallbackFailure = lastResult || { success: false, error: 'retry_exhausted', loginRedirect: false, blocked: false };
      await recordFailure(fallbackFailure);
      return fallbackFailure;
    };

    const saveFunction = async (url, data, query) => {
      const saveStart = Date.now();
      await this.profileRepo.saveFullProfile(url, data, query);
      this.metrics.phaseTimings.lastProfileSaveMs = Date.now() - saveStart;
      this.state.markProfileScraped(url);
      await this.resumeRepo.updateScrapeAttempt(url, true);
      this.updateAndEmitProgress();
      await this.adjustPerformanceIfNeeded();
    };

    // Callbacks for progress tracking
    const strategyContext = {
      ...context,
      onProfile: (data) => {
        const payload = {
          ...data,
          searchQuery: this.searchQuery
        };
        this.emit('profile', payload);
        this.updateAndEmitProgress();
      },
      onError: (data) => {
        const payload = {
          ...data,
          searchQuery: this.searchQuery
        };
        this.emit('error', payload);
      }
    };

    // Choose and execute strategy
    let strategy;
    if (useParallel) {
      strategy = new ParallelStrategy({ concurrency, profileDelay });
      strategy.setConcurrency(concurrency);
      strategy.setProfileDelay(profileDelay);
      strategyContext.browser = this.auth.browser;
      strategyContext.pageSetup = async (workerPage) => {
        await this.auth.preparePage(workerPage);
        await this.auth.applySessionTo(workerPage);
      };
      // Store reference for cleanup
      this.parallelStrategy = strategy;
    } else {
      strategy = new SequentialStrategy({ profileDelay });
      strategy.setProfileDelay(profileDelay);
      this.parallelStrategy = null;
    }

    const results = await strategy.process(
      profileUrls,
      scrapeFunction,
      saveFunction,
      strategyContext
    );

    this.updateAndEmitProgress();

    return results;
  }

  /**
   * Get current state
   */
  getState() {
    return this.state ? this.state.getProgress() : null;
  }

  /**
   * Get orchestrator statistics
   */
  getStats() {
    return {
      state: this.state ? this.state.getSummary() : null,
      queue: this.taskQueue.getStats(),
      rateLimiter: this.rateLimiter.getStats(),
      errorCount: this.errorCount
    };
  }
}
