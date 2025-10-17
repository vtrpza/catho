import { EventEmitter } from 'events';

/**
 * Base Scraper Class with Event Emission
 * All scrapers should extend this class
 */
export class BaseScraper extends EventEmitter {
  constructor() {
    super();
    this.isRunning = false;
    this.isPaused = false;
    this.stats = {
      startTime: null,
      endTime: null,
      itemsProcessed: 0,
      itemsSucceeded: 0,
      itemsFailed: 0,
      errorsEncountered: []
    };
  }

  /**
   * Start the scraper
   */
  async start() {
    if (this.isRunning) {
      throw new Error('Scraper is already running');
    }

    this.isRunning = true;
    this.isPaused = false;
    this.stats.startTime = Date.now();

    this.emit('started', { timestamp: this.stats.startTime });
  }

  /**
   * Stop the scraper
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.stats.endTime = Date.now();

    this.emit('stopped', {
      timestamp: this.stats.endTime,
      duration: this.stats.endTime - this.stats.startTime,
      stats: this.getStats()
    });
  }

  /**
   * Pause the scraper
   */
  pause() {
    if (!this.isRunning) {
      return;
    }

    this.isPaused = true;
    this.emit('paused', { timestamp: Date.now() });
  }

  /**
   * Resume the scraper
   */
  resume() {
    if (!this.isRunning || !this.isPaused) {
      return;
    }

    this.isPaused = false;
    this.emit('resumed', { timestamp: Date.now() });
  }

  /**
   * Check if scraper is running
   */
  getIsRunning() {
    return this.isRunning;
  }

  /**
   * Check if scraper is paused
   */
  getIsPaused() {
    return this.isPaused;
  }

  /**
   * Get scraper statistics
   */
  getStats() {
    const duration = this.stats.endTime
      ? this.stats.endTime - this.stats.startTime
      : Date.now() - this.stats.startTime;

    return {
      ...this.stats,
      duration,
      successRate: this.stats.itemsProcessed > 0
        ? (this.stats.itemsSucceeded / this.stats.itemsProcessed) * 100
        : 0,
      itemsPerSecond: duration > 0
        ? (this.stats.itemsProcessed / (duration / 1000)).toFixed(2)
        : 0
    };
  }

  /**
   * Increment processed items
   */
  incrementProcessed() {
    this.stats.itemsProcessed++;
  }

  /**
   * Increment succeeded items
   */
  incrementSucceeded() {
    this.stats.itemsSucceeded++;
  }

  /**
   * Increment failed items
   */
  incrementFailed() {
    this.stats.itemsFailed++;
  }

  /**
   * Add an error to the stats
   */
  addError(error, context = {}) {
    this.stats.errorsEncountered.push({
      message: error.message || error,
      stack: error.stack,
      context,
      timestamp: Date.now()
    });

    // Keep only last 100 errors to prevent memory issues
    if (this.stats.errorsEncountered.length > 100) {
      this.stats.errorsEncountered.shift();
    }

    this.emit('error', {
      message: error.message || error,
      context
    });
  }

  /**
   * Emit progress update
   */
  emitProgress(data) {
    this.emit('progress', {
      ...data,
      stats: this.getStats(),
      timestamp: Date.now()
    });
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      startTime: null,
      endTime: null,
      itemsProcessed: 0,
      itemsSucceeded: 0,
      itemsFailed: 0,
      errorsEncountered: []
    };
  }
}
