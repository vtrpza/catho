import { BaseStrategy } from './BaseStrategy.js';
import { BatchProcessor } from '../../utils/batchProcessor.js';

/**
 * Parallel Strategy - Processes profiles in parallel using multiple workers
 * Best for large batches when rate limiting allows
 */
export class ParallelStrategy extends BaseStrategy {
  constructor(options = {}) {
    super(options);
    this.concurrency = options.concurrency || 3;
    this.profileDelay = options.profileDelay || 2500;
    this.maxBatchSize = options.maxBatchSize || 50;
  }

  /**
   * Process profile URLs in parallel
   */
  async process(profileUrls, scrapeFunction, saveFunction, context = {}) {
    if (!profileUrls || profileUrls.length === 0) {
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    console.log(`\n🚀 Starting PARALLEL scraping of ${profileUrls.length} profiles (${this.concurrency} workers)...`);

    this.resetStats();
    const { browser, searchQuery, pageSetup } = context;

    const batchProcessor = new BatchProcessor(browser, {
      concurrency: this.concurrency,
      maxBatchSize: this.maxBatchSize,
      profileDelay: this.profileDelay,
      pageSetup
    });

    // Create wrapper for scrape function to track progress
    const wrappedScrapeFunction = async (workerPage, url) => {
      const result = await scrapeFunction(workerPage, url);

      // Emit profile event if callback provided
      if (result.success && context.onProfile) {
        context.onProfile({
          url,
          profile: result.data,
          processed: this.stats.processed + 1,
          total: profileUrls.length
        });
      }

      return result;
    };

    // Create wrapper for save function
    const wrappedSaveFunction = async (url, data) => {
      await saveFunction(url, data, searchQuery);
    };

    const results = await batchProcessor.processBatch(
      profileUrls,
      wrappedScrapeFunction,
      wrappedSaveFunction
    );

    this.stats = {
      processed: results.processed,
      succeeded: results.succeeded,
      failed: results.failed
    };

    console.log(`  ✅ Parallel scraping completed: ${results.succeeded}/${results.processed} successes`);

    return this.getStats();
  }
}
