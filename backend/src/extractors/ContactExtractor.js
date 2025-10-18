import { BaseExtractor } from './BaseExtractor.js';
import { randomDelay } from '../utils/antiDetection.js';
import {
  buildContactOptions,
  hasVisibleContact,
  clickContactButton,
  collectContactValues
} from '../utils/contactHelpers.js';

/**
 * Extracts contact information (email and phone) by clicking reveal buttons
 */
export class ContactExtractor extends BaseExtractor {
  /**
   * Extract contact info from profile page
   * @param {Page} page - Puppeteer page
   * @param {Object} context - Additional context
   * @returns {Promise<Object>} Contact info {email, phone}
   */
  async extract(page, context = {}) {
    const contactInfo = {
      email: null,
      phone: null
    };

    try {
      // Extract phone first, then email with small delay
      const phone = await this.extractPhone(page).catch(e => {
        console.log(`  ⚠️ Phone extraction error: ${e.message}`);
        return null;
      });

      // Small delay between extractions to avoid race conditions
      await new Promise(resolve => setTimeout(resolve, 500));

      const email = await this.extractEmail(page).catch(e => {
        console.log(`  ⚠️ Email extraction error: ${e.message}`);
        return null;
      });

      contactInfo.phone = phone;
      contactInfo.email = email;

      return contactInfo;

    } catch (error) {
      this.addError(error, context);
      console.log(`  ⚠️ Error extracting contact: ${error.message}`);
      return contactInfo;
    }
  }

  /**
   * Extract phone number
   */
  async extractPhone(page) {
    try {
      const options = this.phoneOptions || { ...buildContactOptions('phone'), kind: 'phone' };
      this.phoneOptions = options;

      // Check if contact already visible
      const alreadyVisible = await page.evaluate(hasVisibleContact, options).catch(() => false);

      if (!alreadyVisible) {
        console.log('  📞 Looking for "Ver telefone" button...');
        const clicked = await page.evaluate(clickContactButton, options).catch(() => false);

        if (!clicked) {
          console.log('  ⚠️ "Ver telefone" button not found');
          return null;
        }

        // Wait after click for page to update (API call + DOM update)
        await page.waitForTimeout(1500);
      }

      // Poll for contact to appear with proper timeout
      let waitHandle = null;
      try {
        waitHandle = await page.waitForFunction(
          hasVisibleContact,
          {
            timeout: 6000,
            polling: 200  // Check every 200ms
          },
          options
        );
      } catch {
        console.log('  ⚠️ Phone information did not become visible in time');
        return null;
      } finally {
        if (waitHandle && typeof waitHandle.dispose === 'function') {
          await waitHandle.dispose();
        }
      }

      // Extract the phone number
      const phone = await page.evaluate(collectContactValues, options).catch(() => null);
      if (phone) {
        const first = phone.split(',')[0].trim();
        console.log(`  ✅ Phone found: ${first}`);
        return first;
      }

      return null;
    } catch (error) {
      console.log(`  ⚠️ Error extracting phone: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract email address
   */
  async extractEmail(page) {
    try {
      const options = this.emailOptions || { ...buildContactOptions('email'), kind: 'email' };
      this.emailOptions = options;

      // Check if contact already visible
      const alreadyVisible = await page.evaluate(hasVisibleContact, options).catch(() => false);

      if (!alreadyVisible) {
        console.log('  📧 Looking for "Ver email" button...');
        const clicked = await page.evaluate(clickContactButton, options).catch(() => false);

        if (!clicked) {
          console.log(`  ⚠️ "Ver email" button not found`);
          return null;
        }

        // Wait after click for page to update (API call + DOM update)
        await page.waitForTimeout(1500);
      }

      // Poll for contact to appear with proper timeout
      let waitHandle = null;
      try {
        waitHandle = await page.waitForFunction(
          hasVisibleContact,
          {
            timeout: 6000,
            polling: 200  // Check every 200ms
          },
          options
        );
      } catch {
        console.log('  ⚠️ Email information did not become visible in time');
        return null;
      } finally {
        if (waitHandle && typeof waitHandle.dispose === 'function') {
          await waitHandle.dispose();
        }
      }

      // Extract the email
      const email = await page.evaluate(collectContactValues, options).catch(() => null);
      if (email) {
        const first = email.split(',')[0].trim();
        console.log(`  ✅ Email found: ${first}`);
        return first;
      }

      return null;
    } catch (error) {
      console.log(`  ⚠️ Error extracting email: ${error.message}`);
      return null;
    }
  }

  /**
   * Validate contact info
   */
  validate(contactInfo) {
    return contactInfo && (contactInfo.email || contactInfo.phone);
  }
}
