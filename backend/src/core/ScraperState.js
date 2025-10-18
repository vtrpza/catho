/**
 * Manages the state of a scraping session
 */
export class ScraperState {
  constructor(sessionId, searchQuery, options = {}) {
    this.sessionId = sessionId;
    this.searchQuery = searchQuery;
    this.options = options;

    this.progress = {
      status: 'idle', // idle, running, paused, completed, failed, stopped
      currentPage: 0,
      totalPages: options.maxPages || 0,
      resumesScraped: 0,
      profilesScraped: 0,
      profilesTotal: 0,
      filteredCount: null,
      startTime: null,
      endTime: null,
      searchQuery: this.searchQuery
    };

    this.errors = [];
    this.resumeUrls = new Set();
    this.processedUrls = new Set();
    this.metrics = {
      profilesPerMinute: 0,
      avgProfileLatencyMs: null,
      concurrency: null,
      rpmLimit: null,
      etaMs: null,
      targetProfilesPerMinute: null,
      targetProfiles: null,
      mode: null
    };
  }

  /**
   * Start the session
   */
  start() {
    this.progress.status = 'running';
    this.progress.startTime = Date.now();
  }

  /**
   * Complete the session
   */
  complete() {
    this.progress.status = 'completed';
    this.progress.endTime = Date.now();
  }

  /**
   * Fail the session
   */
  fail(error) {
    this.progress.status = 'failed';
    this.progress.endTime = Date.now();
    this.addError(error);
  }

  /**
   * Mark as stopped (manual interruption)
   */
  stop(reason = 'stopped') {
    this.progress.status = 'stopped';
    this.progress.stopReason = reason;
    this.progress.endTime = Date.now();
  }

  /**
   * Pause the session
   */
  pause() {
    this.progress.status = 'paused';
  }

  /**
   * Resume the session
   */
  resume() {
    this.progress.status = 'running';
  }

  /**
   * Update current page
   */
  setCurrentPage(page) {
    this.progress.currentPage = page;
  }

  /**
   * Set total pages
   */
  setTotalPages(total) {
    if (typeof total !== 'number' || Number.isNaN(total)) {
      return;
    }

    if (!Number.isFinite(total) || total < 0) {
      this.progress.totalPages = 0;
      return;
    }

    this.progress.totalPages = total;
  }

  /**
   * Set filtered count
   */
  setFilteredCount(count) {
    this.progress.filteredCount = count;
  }

  /**
   * Add a resume URL
   */
  addResumeUrl(url) {
    this.resumeUrls.add(url);
    this.progress.resumesScraped = this.resumeUrls.size;
  }

  /**
   * Mark a profile as scraped
   */
  markProfileScraped(url) {
    this.processedUrls.add(url);
    this.progress.profilesScraped = this.processedUrls.size;
  }

  /**
   * Set total profiles to scrape
   */
  setProfilesTotal(total) {
    this.progress.profilesTotal = total;
  }

  /**
   * Add an error
   */
  addError(error, context = {}) {
    this.errors.push({
      message: error.message || error,
      context,
      timestamp: Date.now()
    });

    // Keep only last 50 errors
    if (this.errors.length > 50) {
      this.errors.shift();
    }
  }

  /**
   * Update metrics for progress consumers
   */
  setMetrics(partial = {}) {
    if (!partial || typeof partial !== 'object') {
      return;
    }
    this.metrics = {
      ...this.metrics,
      ...partial
    };
  }

  /**
   * Get current progress
   */
  getProgress() {
    const duration = this.progress.endTime
      ? this.progress.endTime - this.progress.startTime
      : this.progress.startTime
        ? Date.now() - this.progress.startTime
        : 0;

    return {
      ...this.progress,
      sessionId: this.sessionId,
      duration,
      errorCount: this.errors.length,
      completionRate: this.progress.profilesTotal > 0
        ? (this.progress.profilesScraped / this.progress.profilesTotal) * 100
        : 0,
      metrics: {
        ...this.metrics,
        elapsedMs: duration
      }
    };
  }

  /**
   * Get session summary
   */
  getSummary() {
    return {
      sessionId: this.sessionId,
      searchQuery: this.searchQuery,
      progress: this.getProgress(),
      resumesCollected: this.resumeUrls.size,
      profilesScraped: this.processedUrls.size,
      errorCount: this.errors.length,
      recentErrors: this.errors.slice(-5)
    };
  }

  /**
   * Check if URL was already processed
   */
  isProcessed(url) {
    return this.processedUrls.has(url);
  }

  /**
   * Get all resume URLs
   */
  getResumeUrls() {
    return Array.from(this.resumeUrls);
  }

  /**
   * Get unprocessed resume URLs
   */
  getUnprocessedUrls() {
    return Array.from(this.resumeUrls).filter(url => !this.processedUrls.has(url));
  }
}
