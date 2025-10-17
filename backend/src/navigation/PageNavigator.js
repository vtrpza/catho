import { humanizedWait, simulateHumanBehavior } from '../utils/antiDetection.js';

/**
 * Handles page navigation and pagination
 */
export class PageNavigator {
  constructor() {
    this.currentPage = 0;
    this.hasMore = true;
  }

  /**
   * Go to search results page
   */
  async goToSearch(page, searchUrl, pageNumber = 1) {
    try {
      const url = pageNumber > 1 ? `${searchUrl}&pagina=${pageNumber}` : searchUrl;

      console.log(`🔍 Navigating to: ${url}`);

      const startTime = Date.now();
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      const requestTime = Date.now() - startTime;

      // Wait for results to load
      await humanizedWait(page, 3000, 0.3);

      // Simulate human behavior
      await simulateHumanBehavior(page);

      this.currentPage = pageNumber;

      return { success: true, requestTime };
    } catch (error) {
      console.error(`❌ Error navigating to search page ${pageNumber}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if there's a next page
   */
  async hasNextPage(page) {
    try {
      const hasNext = await page.evaluate(() => {
        // Try different strategies to find next page button

        // 1. By rel="next" attribute
        let btn = document.querySelector('a[rel="next"]');
        if (btn && !btn.classList.contains('disabled')) return true;

        // 2. By pagination classes
        btn = document.querySelector('.pagination .next:not(.disabled)');
        if (btn) return true;

        // 3. By button text
        const buttons = Array.from(document.querySelectorAll('button, a'));
        btn = buttons.find(b => {
          const text = b.textContent.toLowerCase().trim();
          return (text.includes('próxim') || text.includes('next') || text === '>') &&
                 !b.disabled &&
                 !b.classList.contains('disabled') &&
                 b.getAttribute('aria-disabled') !== 'true';
        });

        return !!btn;
      });

      this.hasMore = hasNext;
      return hasNext;
    } catch (error) {
      console.error('❌ Error checking for next page:', error.message);
      this.hasMore = false;
      return false;
    }
  }

  /**
   * Go to next page
   */
  async goToNextPage(page) {
    try {
      const nextButton = await page.evaluateHandle(() => {
        // Try different strategies to find next page button

        // 1. By rel="next" attribute
        let btn = document.querySelector('a[rel="next"]');
        if (btn && !btn.classList.contains('disabled')) return btn;

        // 2. By pagination classes
        btn = document.querySelector('.pagination .next:not(.disabled)');
        if (btn) return btn;

        // 3. By button text
        const buttons = Array.from(document.querySelectorAll('button, a'));
        btn = buttons.find(b => {
          const text = b.textContent.toLowerCase().trim();
          return (text.includes('próxim') || text.includes('next') || text === '>') &&
                 !b.disabled &&
                 !b.classList.contains('disabled') &&
                 b.getAttribute('aria-disabled') !== 'true';
        });

        return btn || null;
      });

      const buttonExists = await page.evaluate(btn => btn !== null, nextButton);

      if (!buttonExists) {
        this.hasMore = false;
        return { success: false, reason: 'no_next_button' };
      }

      // Click next page button
      await Promise.all([
        nextButton.click(),
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
      ]);

      // Wait after navigation
      await page.waitForTimeout(1000);

      this.currentPage++;
      return { success: true };

    } catch (error) {
      console.error('❌ Error going to next page:', error.message);
      this.hasMore = false;
      return { success: false, error: error.message };
    }
  }

  /**
   * Extract total results count from page
   */
  async getTotalResults(page) {
    try {
      const total = await page.evaluate(() => {
        const totalElement = document.querySelector('.total-results, .results-count, [data-testid="results-count"]');
        if (totalElement) {
          const text = totalElement.textContent.replace(/\D/g, '');
          return parseInt(text) || 0;
        }
        return 0;
      });

      return total;
    } catch (error) {
      console.log('⚠️ Could not extract total results count');
      return 0;
    }
  }

  /**
   * Get current page number
   */
  getCurrentPage() {
    return this.currentPage;
  }

  /**
   * Check if has more pages
   */
  getHasMore() {
    return this.hasMore;
  }

  /**
   * Reset navigator state
   */
  reset() {
    this.currentPage = 0;
    this.hasMore = true;
  }
}
