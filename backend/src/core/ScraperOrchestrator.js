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

    const {
      maxPages,
      delay = 2000,
      scrapeFullProfiles = true,
      profileDelay = 2500,
      enableParallel = true,
      concurrency = 3
    } = options;

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

          const updatedProgress = this.state.getProgress();
          this.emit('progress', updatedProgress);

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

          if (consecutiveStalledPages >= maxStalledPages) {
            console.log('ℹ️ No new resumes detected in consecutive pages. Stopping to avoid loops.');
            break;
          }

          // Scrape full profiles if enabled
          if (scrapeFullProfiles && pageResumes.length > 0) {
            const profileUrls = pageResumes
              .filter(r => r.profile_url)
              .map(r => r.profile_url);

            if (profileUrls.length > 0) {
              this.state.setProfilesTotal(this.state.progress.profilesTotal + profileUrls.length);

              // Choose strategy based on settings
              const shouldUseParallel = enableParallel && profileUrls.length >= 3;
              const profileContext = {
                page,
                concurrency,
                profileDelay,
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

      // Complete the session
      this.state.complete();
      this.emit('done', {
        total: this.state.progress.resumesScraped,
        profilesScraped: this.state.progress.profilesScraped,
        duration: this.state.getProgress().duration,
        searchQuery: this.searchQuery
      });

      console.log(`\n✅ Scraping completed! Total: ${this.state.progress.resumesScraped} resumes`);

      return {
        success: true,
        total: this.state.progress.resumesScraped,
        profilesScraped: this.state.progress.profilesScraped,
        sessionId
      };

    } catch (error) {
      this.state.fail(error);
      this.emit('error', { message: error.message, searchQuery: this.searchQuery });
      console.error('❌ Error during orchestration:', error);
      throw error;
    }
  }

  /**
   * Scrape full profiles using appropriate strategy
   */
  async scrapeProfiles(profileUrls, useParallel, context) {
    const { page, concurrency, profileDelay, searchQuery } = context;

    // Create scrape and save functions
    const scrapeFunction = async (workerPage, url) => {
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
        this.emit('progress', this.state.getProgress());
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
      strategyContext.browser = this.auth.browser;
      strategyContext.pageSetup = async (workerPage) => {
        await this.auth.preparePage(workerPage);
        await this.auth.applySessionTo(workerPage);
      };
    } else {
      strategy = new SequentialStrategy({ profileDelay });
    }

    const results = await strategy.process(
      profileUrls,
      scrapeFunction,
      saveFunction,
      strategyContext
    );

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
