import { BaseStrategy } from './BaseStrategy.js';
import { humanizedWait, getAdaptiveDelay, simulateHumanBehavior } from '../../utils/antiDetection.js';

/**
 * Sequential Strategy - Processes profiles one by one
 * Best for small batches or when rate limiting is strict
 */
export class SequentialStrategy extends BaseStrategy {
  constructor(options = {}) {
    super(options);
    this.profileDelay = options.profileDelay || 2500;
    this.errorCount = 0;
    this.lastRequestTime = 0;
  }

  setProfileDelay(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return;
    }
    this.profileDelay = Math.max(250, Math.floor(value));
  }

  /**
   * Process profile URLs sequentially
   */
  async process(profileUrls, scrapeFunction, saveFunction, context = {}) {
    if (!profileUrls || profileUrls.length === 0) {
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    console.log(`\n🔍 Starting SEQUENTIAL scraping of ${profileUrls.length} profiles...`);

    this.resetStats();
    const { page, searchQuery } = context;

    for (let i = 0; i < profileUrls.length; i++) {
      const url = profileUrls[i];

      try {
        console.log(`  📋 Profile ${i + 1}/${profileUrls.length}: ${url.substring(0, 60)}...`);

        // Scrape profile
        const startTime = Date.now();
        const result = await scrapeFunction(page, url);
        this.lastRequestTime = Date.now() - startTime;

        this.stats.processed++;

        if (result.success) {
          // Save profile
          await saveFunction(url, result.data, searchQuery);
          this.stats.succeeded++;
          console.log(`  ✅ Profile saved successfully`);

          // Emit profile event if callback provided
          if (context.onProfile) {
            context.onProfile({
              url,
              profile: result.data,
              index: i + 1,
              total: profileUrls.length
            });
          }
        } else {
          this.stats.failed++;
          this.errorCount++;
          console.log(`  ⚠️ Error scraping profile: ${result.error}`);

          // Emit error event if callback provided
          if (context.onError) {
            context.onError({
              url,
              error: result.error,
              index: i + 1
            });
          }
        }

        // Delay between profiles (with adaptive adjustment)
        if (i < profileUrls.length - 1) {
          const adaptiveDelay = getAdaptiveDelay(this.profileDelay, this.errorCount, this.lastRequestTime);
          await humanizedWait(page, adaptiveDelay, 0.4);

          // Occasionally simulate human behavior
          if (Math.random() > 0.7) {
            await simulateHumanBehavior(page);
          }
        }

      } catch (error) {
        this.stats.processed++;
        this.stats.failed++;
        this.errorCount++;
        console.error(`  ❌ Error processing profile ${i + 1}:`, error.message);

        if (context.onError) {
          context.onError({
            url,
            error: error.message,
            index: i + 1
          });
        }

        continue;
      }
    }

    console.log(`  ✅ Sequential scraping completed: ${this.stats.succeeded}/${this.stats.processed} successes`);

    return this.getStats();
  }
}
