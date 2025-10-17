import { BaseExtractor } from './BaseExtractor.js';
import { randomDelay } from '../utils/antiDetection.js';

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
      // Extract phone
      contactInfo.phone = await this.extractPhone(page);

      // Small delay between actions
      await page.waitForTimeout(randomDelay(1000, 1500));

      // Extract email
      contactInfo.email = await this.extractEmail(page);

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
      console.log('  📞 Looking for "Ver telefone" button...');

      const phoneButtonClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const phoneButton = buttons.find(btn => {
          const text = btn.textContent.toLowerCase();
          const hasIcon = btn.querySelector('svg[data-testid="SmartphoneIcon"]');
          return (text.includes('ver telefone') || text.includes('telefone')) && hasIcon;
        });

        if (phoneButton) {
          phoneButton.click();
          return true;
        }
        return false;
      });

      if (phoneButtonClicked) {
        console.log('  📞 "Ver telefone" button clicked, waiting for data...');

        // Wait for phone to appear
        await page.waitForTimeout(randomDelay(2000, 3000));

        // Extract phone after it loads
        const phone = await page.evaluate(() => {
          const pageText = document.body.textContent;

          // Brazilian phone patterns
          const phonePatterns = [
            /\(?\d{2}\)?\s*9?\d{4}[-\s]?\d{4}/g,
            /\d{11}/g,
            /\d{10}/g
          ];

          for (const pattern of phonePatterns) {
            const matches = pageText.match(pattern);
            if (matches && matches.length > 0) {
              for (const match of matches) {
                const cleaned = match.replace(/\D/g, '');
                if (cleaned.length === 10 || cleaned.length === 11) {
                  return match.trim();
                }
              }
            }
          }
          return null;
        });

        if (phone) {
          console.log(`  ✅ Phone found: ${phone}`);
          return phone;
        } else {
          console.log(`  ⚠️ Phone not found after clicking`);
        }
      } else {
        console.log(`  ⚠️ "Ver telefone" button not found`);
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
      console.log('  📧 Looking for "Ver email" button...');

      const emailButtonClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const emailButton = buttons.find(btn => {
          const text = btn.textContent.toLowerCase();
          const hasIcon = btn.querySelector('svg[data-testid="MailOutlineIcon"]');
          return (text.includes('ver email') || text.includes('ver e-mail') || text.includes('email')) && hasIcon;
        });

        if (emailButton) {
          emailButton.click();
          return true;
        }
        return false;
      });

      if (emailButtonClicked) {
        console.log('  📧 "Ver email" button clicked, waiting for data...');

        // Wait for email to appear
        await page.waitForTimeout(randomDelay(2000, 3000));

        // Extract email after it loads
        const email = await page.evaluate(() => {
          const pageText = document.body.textContent;
          const emailMatch = pageText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
          return emailMatch ? emailMatch[0] : null;
        });

        if (email) {
          console.log(`  ✅ Email found: ${email}`);
          return email;
        } else {
          console.log(`  ⚠️ Email not found after clicking`);
        }
      } else {
        console.log(`  ⚠️ "Ver email" button not found`);
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
