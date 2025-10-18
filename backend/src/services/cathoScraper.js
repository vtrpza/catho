import { BaseScraper } from '../core/BaseScraper.js';
import { CathoAuth } from './cathoAuth.js';
import { getDatabase } from '../config/database.js';
import { CathoQueryBuilder } from '../utils/queryBuilder.js';
import { getCheckpointService } from './checkpointService.js';
import { ScraperOrchestrator } from '../core/ScraperOrchestrator.js';
import { ResumeRepository } from '../persistence/ResumeRepository.js';
import { ProfileRepository } from '../persistence/ProfileRepository.js';
import { ListingExtractor } from '../extractors/ListingExtractor.js';
import { ProfileExtractor } from '../extractors/ProfileExtractor.js';

/**
 * Catho Scraper - Refactored with Clean Architecture
 * Now extends BaseScraper for event emission support
 */
export class CathoScraper extends BaseScraper {
  constructor(email, password) {
    super(); // Initialize BaseScraper with EventEmitter

    this.auth = new CathoAuth(email, password);
    this.resumes = [];

    // Progress tracking (for backward compatibility)
    this.progress = {
      total: 0,
      scraped: 0,
      currentPage: 0,
      status: 'idle'
    };

    // Checkpoint management
    this.sessionId = null;
    this.checkpointService = null;

    // Repositories
    this.resumeRepo = null;
    this.profileRepo = null;

    // Orchestrator
    this.orchestrator = null;

    // Adaptive control
    this.performanceGoal = {
      targetProfilesPerMin: null,
      targetProfiles: null,
      timeBudgetMinutes: null,
      mode: 'balanced'
    };
    this.controlSignals = {
      stopRequested: false,
      pauseRequested: false
    };
  }

  /**
   * Initialize repositories and orchestrator
   */
  async initialize() {
    const db = getDatabase();

    // Initialize repositories
    this.resumeRepo = new ResumeRepository(db);
    this.profileRepo = new ProfileRepository(db);

    // Initialize orchestrator
    this.orchestrator = new ScraperOrchestrator(this.auth, {
      resumeRepo: this.resumeRepo,
      profileRepo: this.profileRepo
    }, {
      maxRequestsPerMinute: 30,
      errorThreshold: 5
    });

    // Set emitter for orchestrator
    this.orchestrator.setEmitter(this);

    // Initialize checkpoint service
    this.checkpointService = await getCheckpointService();
  }

  /**
   * Main scrape method - Refactored to use orchestrator
   */
  async scrape(searchQuery, options = {}) {
    try {
      await this.start(); // Start base scraper
      this.progress.status = 'running';
      this.progress.scraped = 0;
      this.resumes = [];

      // Reset control state
      this.controlSignals = {
        stopRequested: false,
        pauseRequested: false
      };

      // Extract adaptive configuration
      const { adaptive = {}, advanced = {} } = options;
      this.performanceGoal = {
        targetProfilesPerMin: adaptive?.targetProfilesPerMin ?? null,
        targetProfiles: adaptive?.targetProfiles ?? null,
        timeBudgetMinutes: adaptive?.timeBudgetMinutes ?? null,
        mode: adaptive?.mode || 'balanced'
      };
      this.advancedSettings = {
        ...advanced
      };

      // Initialize components
      await this.initialize();

      // Handle checkpoint resume
      if (options.resumeSession) {
        const checkpoint = await this.checkpointService.getCheckpoint(options.resumeSession);
        if (checkpoint && this.checkpointService.canResume(checkpoint)) {
          this.sessionId = checkpoint.session_id;
          console.log(`📥 Resuming session: ${this.sessionId}`);
          await this.checkpointService.resumeCheckpoint(this.sessionId);
        }
      }

      // Create new checkpoint if needed
      if (!this.sessionId) {
        this.sessionId = this.checkpointService.generateSessionId(searchQuery);
        await this.checkpointService.createCheckpoint(this.sessionId, searchQuery, options);
      }

      this.emit('session', {
        status: 'running',
        query: searchQuery,
        options,
        resumed: Boolean(options.resumeSession),
        sessionId: this.sessionId
      });

      // Build search URL with filters
      const queryBuilder = new CathoQueryBuilder(searchQuery);

      // Apply filters
      if (options.salaryRanges && options.salaryRanges.length > 0) {
        queryBuilder.setSalaryRanges(options.salaryRanges);
      }
      if (options.ageRanges && options.ageRanges.length > 0) {
        queryBuilder.setAgeRanges(options.ageRanges);
      }
      if (options.gender) {
        queryBuilder.setGender(options.gender);
      }
      if (options.professionalAreas && options.professionalAreas.length > 0) {
        queryBuilder.setProfessionalAreas(options.professionalAreas);
      }
      if (options.hierarchicalLevels && options.hierarchicalLevels.length > 0) {
        queryBuilder.setHierarchicalLevels(options.hierarchicalLevels);
      }
      if (options.lastUpdated) {
        queryBuilder.setLastUpdated(options.lastUpdated);
      }
      if (options.candidateSituation) {
        queryBuilder.setCandidateSituation(options.candidateSituation);
      }

      const searchUrl = queryBuilder.build();

      console.log(`\n🎯 Starting collection for: "${searchQuery}"`);
      console.log(`🔗 URL: ${searchUrl}`);

      // Emit filter-applied event
      this.emit('filter-applied', {
        query: searchQuery,
        url: searchUrl,
        filters: options
      });

      // Login and initialize browser
      await this.auth.init();
      await this.auth.login();

      // Forward orchestrator events to scraper events
      this.setupOrchestratorEvents();

      // Run orchestration
      const result = await this.orchestrator.orchestrate(
        this.sessionId,
        searchQuery,
        searchUrl,
        {
          ...options,
          adaptive: this.performanceGoal,
          advanced: this.advancedSettings
        }
      );

      // Update progress for backward compatibility
      this.progress.status = 'completed';
      this.progress.total = result.total;
      this.progress.scraped = result.total;
      this.resumes = []; // Resumes are now in database

      // Mark checkpoint as completed
      if (this.sessionId) {
        await this.checkpointService.completeCheckpoint(this.sessionId);
      }

      console.log(`\n✅ Collection completed! Total: ${result.total} resumes`);

      await this.stop(); // Stop base scraper

      return {
        success: true,
        total: result.total,
        profilesScraped: result.profilesScraped,
        sessionId: this.sessionId
      };

    } catch (error) {
      this.progress.status = 'error';
      console.error('❌ Error during scraping:', error);

      // Mark checkpoint as failed
      if (this.sessionId) {
        await this.checkpointService.failCheckpoint(this.sessionId, error.message);
      }

      this.addError(error);
      throw error;

    } finally {
      await this.auth.close();
    }
  }

  /**
   * Returns current adaptive goal configuration
   */
  getPerformanceGoal() {
    return { ...this.performanceGoal };
  }

  /**
   * Access current control signals (for orchestrator checks)
   */
  getControlSignals() {
    return { ...this.controlSignals };
  }

  /**
   * Request pause from external controller
   */
  async requestPause() {
    if (!this.isScraperRunning()) {
      return;
    }
    this.controlSignals.pauseRequested = true;
    this.emit('control', { action: 'pause-requested', timestamp: Date.now() });
    try {
      await this.pause();
    } catch (error) {
      console.warn('⚠️ Falha ao pausar scraper:', error.message);
    }
  }

  /**
   * Request resume from external controller
   */
  async requestResume() {
    if (!this.isPaused) {
      return;
    }
    this.controlSignals.pauseRequested = false;
    this.emit('control', { action: 'resume-requested', timestamp: Date.now() });
    try {
      await this.resume();
    } catch (error) {
      console.warn('⚠️ Falha ao retomar scraper:', error.message);
    }
  }

  /**
   * Request stop from external controller
   */
  async requestStop() {
    if (!this.isScraperRunning()) {
      return;
    }
    this.controlSignals.stopRequested = true;
    this.emit('control', { action: 'stop-requested', timestamp: Date.now() });
    try {
      await this.stop();
    } catch (error) {
      console.warn('⚠️ Falha ao encerrar scraper:', error.message);
    }
  }

  /**
   * Setup event forwarding from orchestrator
   */
  setupOrchestratorEvents() {
    // Update progress when orchestrator emits events
    this.on('progress', (data) => {
      if (data.resumesScraped) {
        this.progress.scraped = data.resumesScraped;
      }
      if (data.currentPage) {
        this.progress.currentPage = data.currentPage;
      }
    });

    this.on('done', (data) => {
      if (data.total) {
        this.progress.total = data.total;
      }
    });
  }

  /**
   * Count results without scraping (using ListingExtractor)
   */
  async countResults(searchQuery, filters = {}) {
    try {
      await this.auth.init();
      await this.auth.login();

      const queryBuilder = new CathoQueryBuilder(searchQuery);

      // Apply filters
      if (filters.salaryRanges) queryBuilder.setSalaryRanges(filters.salaryRanges);
      if (filters.ageRanges) queryBuilder.setAgeRanges(filters.ageRanges);
      if (filters.gender) queryBuilder.setGender(filters.gender);
      if (filters.professionalAreas) queryBuilder.setProfessionalAreas(filters.professionalAreas);
      if (filters.hierarchicalLevels) queryBuilder.setHierarchicalLevels(filters.hierarchicalLevels);
      if (filters.lastUpdated) queryBuilder.setLastUpdated(filters.lastUpdated);
      if (filters.candidateSituation) queryBuilder.setCandidateSituation(filters.candidateSituation);

      const searchUrl = queryBuilder.build();
      const page = this.auth.getPage();

      console.log(`\n🔍 Counting results for: "${searchQuery}"`);

      await page.goto(searchUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      try {
        await page.waitForSelector('.total-results, .results-count, [data-testid="results-count"]', { timeout: 7000 });
      } catch {
        await page.waitForSelector('article.sc-fvtFIe, article', { timeout: 7000 }).catch(() => {});
      }

      // Extract total count
      const total = await page.evaluate(() => {
        const totalElement = document.querySelector('.total-results, .results-count, [data-testid="results-count"]');
        if (totalElement) {
          const text = totalElement.textContent.replace(/\D/g, '');
          return parseInt(text) || 0;
        }
        return 0;
      });

      console.log(`📊 Total results: ${total}`);

      this.emit('count', { total, filtered: total, query: searchQuery });

      return {
        success: true,
        total,
        query: searchQuery
      };

    } catch (error) {
      console.error('❌ Error counting results:', error);
      this.emit('error', { message: error.message });
      throw error;
    } finally {
      await this.auth.close();
    }
  }

  /**
   * Get current progress
   */
  getProgress() {
    // Return orchestrator state if available, otherwise return legacy progress
    if (this.orchestrator && this.orchestrator.getState()) {
      const state = this.orchestrator.getState();
      return {
        status: state.status,
        scraped: state.resumesScraped,
        currentPage: state.currentPage,
        total: state.filteredCount || 0,
        profilesScraped: state.profilesScraped,
        profilesTotal: state.profilesTotal
      };
    }

    return this.progress;
  }

  /**
   * Check if scraper is running
   */
  isScraperRunning() {
    return this.getIsRunning();
  }

  /**
   * Retry failed profiles
   */
  async retryFailedProfiles(maxRetries = 3, limit = 50) {
    try {
      console.log('\n🔄 Starting retry of failed profiles...');

      await this.initialize();

      const failedProfiles = await this.resumeRepo.getFailedProfiles(maxRetries, limit);

      if (failedProfiles.length === 0) {
        console.log('✅ No profiles to retry');
        return { success: true, retried: 0, succeeded: 0, failed: 0 };
      }

      console.log(`📋 Found ${failedProfiles.length} profiles to retry`);

      // Initialize browser
      await this.auth.init();
      await this.auth.login();

      const profileExtractor = new ProfileExtractor();
      const page = this.auth.getPage();

      let succeeded = 0;
      let failed = 0;

      for (let i = 0; i < failedProfiles.length; i++) {
        const profile = failedProfiles[i];
        console.log(`\n📋 Retry ${i + 1}/${failedProfiles.length}: ${profile.name}`);

        try {
          const result = await profileExtractor.extract(page, { profileUrl: profile.profile_url });

          if (result.success) {
            await this.profileRepo.saveFullProfile(profile.profile_url, result.data, '');
            await this.resumeRepo.updateScrapeAttempt(profile.profile_url, true);
            succeeded++;
          } else {
            await this.resumeRepo.updateScrapeAttempt(profile.profile_url, false, result.error);
            failed++;
          }
        } catch (error) {
          await this.resumeRepo.updateScrapeAttempt(profile.profile_url, false, error.message);
          failed++;
        }

        // Delay between retries
        if (i < failedProfiles.length - 1) {
          await page.waitForTimeout(3000);
        }
      }

      console.log(`\n✅ Retry completed: ${succeeded} successes, ${failed} failures`);

      return {
        success: true,
        retried: failedProfiles.length,
        succeeded,
        failed
      };

    } catch (error) {
      console.error('❌ Error during retry:', error);
      return { success: false, error: error.message };
    } finally {
      await this.auth.close();
    }
  }
}
