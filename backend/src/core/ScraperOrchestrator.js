import { ScraperState } from './ScraperState.js';
import { ListingExtractor } from '../extractors/ListingExtractor.js';
import { ProfileExtractor } from '../extractors/ProfileExtractor.js';
import { PageNavigator } from '../navigation/PageNavigator.js';
import { TaskQueue } from '../queue/TaskQueue.js';
import { RateLimiter } from '../queue/RateLimiter.js';
import { SequentialStrategy } from '../scrapers/strategies/SequentialStrategy.js';
import { ParallelStrategy } from '../scrapers/strategies/ParallelStrategy.js';
import { humanizedWait, simulateHumanBehavior, getAdaptiveDelay } from '../utils/antiDetection.js';

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

    // Create components
    this.listingExtractor = new ListingExtractor();
    this.profileExtractor = new ProfileExtractor();
    this.navigator = new PageNavigator();
    this.taskQueue = new TaskQueue();
    this.rateLimiter = new RateLimiter({
      maxRequestsPerMinute: options.maxRequestsPerMinute || 30,
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
    this.modePresets = {
      conservative: { minConcurrency: 2, maxConcurrency: 4, rpmMultiplier: 1.15, profileDelayMultiplier: 1.1 },
      balanced: { minConcurrency: 3, maxConcurrency: 8, rpmMultiplier: 1.4, profileDelayMultiplier: 1 },
      fast: { minConcurrency: 4, maxConcurrency: 12, rpmMultiplier: 1.75, profileDelayMultiplier: 0.9 }
    };
    this.metrics = {
      samples: [],
      startTime: null,
      currentProfilesPerMin: 0,
      avgProfileLatencyMs: null,
      lastAdjustment: 0,
      currentConcurrency: options.defaultConcurrency || 3,
      currentProfileDelay: 2500,
      rpmLimit: this.rateLimiter.maxRequestsPerMinute
    };
    this.isExternallyPaused = false;
    this.stopReason = null;
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
      delay = 2000,
      scrapeFullProfiles = true,
      profileDelay = 2500,
      enableParallel = true,
      concurrency = 3
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
      const navResult = await this.navigator.goToSearch(page, searchUrl, 1);

      if (!navResult.success) {
        throw new Error(`Failed to navigate to search: ${navResult.error}`);
      }

      this.lastRequestTime = navResult.requestTime;

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
          const pageResumes = await this.listingExtractor.extract(page, { searchQuery });

          if (pageResumes.length === 0) {
            console.log('⚠️ No resumes found on this page. Finishing...');
            break;
          }

          const resumesWithSession = pageResumes.map(resume => ({
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

          console.log(`✓ Collected ${pageResumes.length} resumes from this page`);
          console.log(`📈 Total collected so far: ${this.state.progress.resumesScraped}`);

          this.updateAndEmitProgress();
          const updatedProgress = this.state.getProgress();

          const newUniqueCount = (updatedProgress.resumesScraped || 0) - previousUniqueCount;
          consecutiveStalledPages = newUniqueCount > 0 ? 0 : consecutiveStalledPages + 1;

          if (totalResults > 0 && pageResumes.length > 0 && !hasPageLimit) {
            const estimatedTotalPages = Math.ceil(totalResults / pageResumes.length);
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

          if (scrapeFullProfiles && pageResumes.length > 0) {
            if (!(await this.handleControlSignals())) {
              console.log('ℹ️ Interrompendo scraping de perfis por sinal externo.');
              break;
            }

            const profileUrls = pageResumes
              .filter(r => r.profile_url)
              .map(r => r.profile_url);

            if (profileUrls.length > 0) {
              this.state.setProfilesTotal(this.state.progress.profilesTotal + profileUrls.length);

              // Choose strategy based on settings
              const dynamicConcurrency = Math.max(1, this.metrics.currentConcurrency || concurrency || 3);
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
                if (sequentialWorkerPage) {
                  await sequentialWorkerPage.close().catch(() => {});
                } else if (!shouldUseParallel) {
                  // Fallback to ensure search page is restored when using main page for profiles
                  await this.navigator.goToSearch(page, searchUrl, currentPage).catch(() => {});
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

          const nextResult = await this.navigator.goToNextPage(page);
          if (!nextResult.success) {
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

    const targetProfilesPerMin = parsePositiveInt(adaptive.targetProfilesPerMin, 200);
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

    let derivedConcurrency = requestedConcurrency || concurrencyFromTarget || modeSettings.minConcurrency || 3;
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

    this.state.setMetrics({
      profilesPerMinute: throughput,
      avgProfileLatencyMs: averageLatency,
      concurrency: this.metrics.currentConcurrency,
      rpmLimit: limiterStats.maxRequestsPerMinute,
      rateLimiter: limiterStats,
      etaMs: this.estimateEta(profilesScraped),
      targetProfilesPerMinute: this.performanceGoal?.targetProfilesPerMin || null,
      targetProfiles: this.performanceGoal?.targetProfiles || null,
      mode: this.performanceGoal?.mode || null
    });
  }

  updateAndEmitProgress(options = {}) {
    const { skipSample = false } = options;
    if (!skipSample) {
      this.recordThroughputSample();
    }
    this.updateStateMetrics();
    this.emit('progress', this.state.getProgress());
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
    const concurrency = Math.max(1, context.concurrency || this.metrics.currentConcurrency || 1);
    const profileDelay = Math.max(300, context.profileDelay || this.metrics.currentProfileDelay || 2500);

    // Create scrape and save functions
    const scrapeFunction = async (workerPage, url) => {
      const canContinue = await this.handleControlSignals();
      if (!canContinue) {
        return { success: false, error: 'stop_requested' };
      }

      // Check rate limiter
      await this.rateLimiter.waitForSlot();

      const result = await this.profileExtractor.extract(workerPage, { profileUrl: url });

      if (result.success) {
        this.rateLimiter.recordRequest();
        this.lastRequestTime = result.requestTime || 0;
      } else {
        this.rateLimiter.recordError(result.error);
        this.errorCount++;
      }

      return result;
    };

    const saveFunction = async (url, data, query) => {
      await this.profileRepo.saveFullProfile(url, data, query);
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
    } else {
      strategy = new SequentialStrategy({ profileDelay });
      strategy.setProfileDelay(profileDelay);
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
