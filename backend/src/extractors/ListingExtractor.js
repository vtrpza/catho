import { BaseExtractor } from './BaseExtractor.js';

/**
 * Extracts resume listings from search results pages
 */
export class ListingExtractor extends BaseExtractor {
  /**
   * Extract resumes from the current page
   * @param {Page} page - Puppeteer page
   * @param {Object} context - Additional context (searchQuery, etc.)
   * @returns {Promise<Array>} Array of resume objects
   */
  async extract(page, context = {}) {
    try {
      // Wait for resume cards to load
      await page.waitForSelector('article.sc-fvtFIe, article', { timeout: 10000 });

      const resumes = await page.evaluate((searchQuery) => {
        const results = [];
        const cards = Array.from(document.querySelectorAll('article.sc-fvtFIe, article'));

        console.log(`Found ${cards.length} cards on page`);

        cards.forEach((card, index) => {
          try {
            // Extract name - inside h2 > a > b
            const nameElement = card.querySelector('h2 a b, h2 b, h2 a');
            const name = nameElement ? nameElement.textContent.trim() : 'Nome não disponível';

            // Extract location - p tag with specific class
            const locationElement = card.querySelector('p.sc-eZkCL, p[class*="eZkCL"]');
            const location = locationElement ? locationElement.textContent.trim() : '';

            // Extract job title - h3 inside experience div
            const jobTitleElement = card.querySelector('h3.sc-dCFHLb, h3[class*="dCFHLb"]');
            const jobTitle = jobTitleElement ? jobTitleElement.textContent.trim() : '';

            // Extract experience - text after "Experiência:"
            const experienceSection = card.querySelector('.sc-kdBSHD, [class*="kdBSHD"]');
            let experience = '';
            if (experienceSection) {
              const experienceText = experienceSection.textContent;
              const match = experienceText.match(/(\d+\s*(ano|anos|mês|meses|month|months).*?)(?=Idioma|$)/i);
              if (match) {
                experience = match[1].trim();
              }
            }

            // Extract profile link
            const profileLink = card.querySelector('h2 a')?.getAttribute('href') || '';
            const profileUrl = profileLink.startsWith('http')
              ? profileLink
              : `https://www.catho.com.br${profileLink}`;

            // Extract salary expectation
            const salaryElement = card.querySelector('p.sc-bypJrT, p[class*="bypJrT"], strong');
            const salary = salaryElement ? salaryElement.textContent.trim() : '';

            // Extract last updated date
            const updateElement = card.querySelector('span.sc-fxwrCY, span[class*="fxwrCY"]');
            const lastUpdated = updateElement ? updateElement.textContent.trim() : '';

            // Extract languages
            const languageElement = card.querySelector('p.sc-iHbSHJ, p[class*="iHbSHJ"]');
            const languages = languageElement
              ? languageElement.textContent.replace('Idioma(s):', '').trim()
              : '';

            // Create summary
            const summaryParts = [
              experience ? `Experiência: ${experience}` : '',
              salary ? `Pretensão: ${salary}` : '',
              languages ? `Idiomas: ${languages}` : '',
              lastUpdated ? `Atualizado: ${lastUpdated}` : ''
            ].filter(Boolean);

            const summary = summaryParts.join(' | ').substring(0, 500);

            results.push({
              name,
              job_title: jobTitle,
              location,
              experience,
              summary,
              contact_email: '',
              contact_phone: '',
              profile_url: profileUrl,
              last_updated: lastUpdated,
              search_query: searchQuery
            });
          } catch (err) {
            console.error(`Error extracting resume ${index + 1}:`, err);
          }
        });

        return results;
      }, context.searchQuery || '');

      console.log(`✓ Extracted ${resumes.length} resumes from page`);
      return resumes;

    } catch (error) {
      this.addError(error, context);
      console.error('❌ Error extracting resumes:', error);
      return [];
    }
  }

  /**
   * Validate extracted resume data
   */
  validate(resume) {
    return (
      resume &&
      resume.name &&
      resume.profile_url &&
      resume.profile_url.startsWith('http')
    );
  }
}
