/**
 * Base Strategy for profile scraping
 * Defines the interface that all strategies must implement
 */
export class BaseStrategy {
  constructor(options = {}) {
    this.options = options;
    this.stats = {
      processed: 0,
      succeeded: 0,
      failed: 0
    };
  }

  /**
   * Process a batch of profile URLs
   * Must be implemented by subclasses
   * @param {Array<string>} profileUrls - URLs to scrape
   * @param {Function} scrapeFunction - Function to scrape each profile
   * @param {Function} saveFunction - Function to save scraped data
   * @param {Object} context - Additional context
   * @returns {Promise<Object>} Results {processed, succeeded, failed}
   */
  async process(profileUrls, scrapeFunction, saveFunction, context = {}) {
    throw new Error('process() must be implemented by subclass');
  }

  /**
   * Get strategy statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      processed: 0,
      succeeded: 0,
      failed: 0
    };
  }
}
