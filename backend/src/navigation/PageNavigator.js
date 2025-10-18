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
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      const requestTime = Date.now() - startTime;

      // Wait for resume tiles to appear when possible
      try {
        await page.waitForSelector('article.sc-fvtFIe, article', { timeout: 8000 });
      } catch {
        // fallback to a shorter delay only when selector is missing
        await page.waitForTimeout(600);
      }

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
  async hasNextPage(page, attempts = 2) {
    for (let attempt = 0; attempt < attempts; attempt++) {
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
            const text = (b.textContent || '').toLowerCase().trim();
            return (text.includes('próxim') || text.includes('next') || text === '>') &&
                   !b.disabled &&
                   !b.classList.contains('disabled') &&
                   b.getAttribute('aria-disabled') !== 'true';
          });

          return !!btn;
        });

        this.hasMore = hasNext;
        if (hasNext || attempt === attempts - 1) {
          return hasNext;
        }
      } catch (error) {
        console.error('❌ Error checking for next page:', error.message);
        this.hasMore = false;
        return false;
      }

      await page.waitForTimeout(750);
    }

    this.hasMore = false;
    return false;
  }

  /**
   * Go to next page
   */
  async goToNextPage(page, attempts = 2) {
    for (let attempt = 0; attempt < attempts; attempt++) {
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
            const text = (b.textContent || '').toLowerCase().trim();
            return (text.includes('próxim') || text.includes('next') || text === '>') &&
                   !b.disabled &&
                   !b.classList.contains('disabled') &&
                   b.getAttribute('aria-disabled') !== 'true';
          });

          return btn || null;
        });

        const buttonExists = nextButton
          ? await page.evaluate(btn => btn !== null, nextButton)
          : false;

        if (!buttonExists) {
          this.hasMore = false;
          return { success: false, reason: 'no_next_button' };
        }

        await Promise.all([
          nextButton.click(),
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
        ]);

        try {
          await page.waitForSelector('article.sc-fvtFIe, article', { timeout: 7000 });
        } catch {
          await page.waitForTimeout(500);
        }

        this.currentPage++;
        this.hasMore = true;
        return { success: true };

      } catch (error) {
        console.error(`❌ Error going to next page (attempt ${attempt + 1}):`, error.message);
        await page.waitForTimeout(1000 * (attempt + 1));
      }
    }

    this.hasMore = false;
    return { success: false, error: 'navigation_failed' };
  }

  /**
   * Extract total results count from page
   */
  async getTotalResults(page) {
    try {
      const total = await page.evaluate(() => {
        const normalizeNumber = (text = '') => {
          if (!text) return null;
          const cleaned = text.replace(/\s/g, '').replace(/[.,]/g, '');
          const digits = cleaned.match(/\d+/g);
          if (!digits) return null;
          const numberString = digits.join('');
          const parsed = parseInt(numberString, 10);
          return Number.isNaN(parsed) ? null : parsed;
        };

        const selectors = [
          '.total-results',
          '.results-count',
          '[data-testid="results-count"]',
          '[data-testid="total-results"]',
          '[data-testid="header-results-count"]'
        ];

        for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (element) {
            const parsed = normalizeNumber(element.textContent);
            if (parsed !== null && parsed > 0) {
              return parsed;
            }
          }
        }

        const headingCandidates = Array.from(document.querySelectorAll('h1, h2, h3, p, span, strong'));
        for (const node of headingCandidates) {
          const text = node.textContent || '';
          if (!text) continue;
          if (!/curr\u00edculo|curriculo|currículos|curriculos|resultado|Encontramos/i.test(text)) {
            continue;
          }
          const parsed = normalizeNumber(text);
          if (parsed !== null && parsed > 0) {
            return parsed;
          }
        }

        const inlineText = document.body ? document.body.innerText || '' : '';
        if (inlineText) {
          const lines = inlineText.split('\n');
          for (const line of lines) {
            if (!/curr\u00edculo|curriculo|resultado|Encontramos/i.test(line)) continue;
            const parsed = normalizeNumber(line);
            if (parsed !== null && parsed > 0) {
              return parsed;
            }
          }
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

  /**
   * Check if any filters are active
   */
  hasActiveFilters(options = {}) {
    if (!options || typeof options !== 'object') {
      return false;
    }

    const hasArrayValues = (value) => Array.isArray(value) && value.length > 0;

    return (
      hasArrayValues(options.salaryRanges) ||
      hasArrayValues(options.ageRanges) ||
      hasArrayValues(options.professionalAreas) ||
      hasArrayValues(options.hierarchicalLevels) ||
      hasArrayValues(options.educationLevels) ||
      (options.gender && options.gender !== 'ambos') ||
      (options.lastUpdated && options.lastUpdated !== 'indifferent') ||
      (options.candidateSituation && options.candidateSituation !== 'indifferent') ||
      (options.disabilityStatus && options.disabilityStatus !== 'indifferent')
    );
  }

  /**
   * Apply UI filters if needed (new Catho search interface)
   */
  async applyFiltersIfNeeded(page, options = {}) {
    if (!this.hasActiveFilters(options)) {
      return false;
    }

    try {
      const opened = await this.isFilterDrawerOpen(page);
      if (!opened) {
        const clicked = await this.openFilterDrawer(page);
        if (!clicked) {
          console.warn('⚠️ Could not open Catho filter drawer');
          return false;
        }
        await humanizedWait(page, 1200, 0.25);
      }

      const actions = [];

      if (Array.isArray(options.salaryRanges) && options.salaryRanges.length > 0) {
        actions.push(this.applySalaryFilter(page, options.salaryRanges));
      }

      if (Array.isArray(options.ageRanges) && options.ageRanges.length > 0) {
        actions.push(this.applyCheckboxFilter(page, 'Idade', options.ageRanges.map(String)));
      }

      if (Array.isArray(options.professionalAreas) && options.professionalAreas.length > 0) {
        actions.push(this.applyCheckboxFilter(page, 'Área Profissional', options.professionalAreas.map(String)));
      }

      if (Array.isArray(options.hierarchicalLevels) && options.hierarchicalLevels.length > 0) {
        actions.push(this.applyCheckboxFilter(page, 'Nível Hierárquico', options.hierarchicalLevels.map(String)));
      }

      if (options.gender && options.gender !== 'ambos') {
        actions.push(this.applyRadioFilter(page, 'Sexo', 'gender', options.gender));
      }

      if (options.lastUpdated && options.lastUpdated !== 'indifferent') {
        const lastUpdatedValue = typeof options.lastUpdated === 'number'
          ? String(options.lastUpdated)
          : options.lastUpdated;
        actions.push(this.applyRadioFilter(page, 'Última Atualização de Currículo', 'updatedDate', lastUpdatedValue));
      }

      if (options.candidateSituation && options.candidateSituation !== 'indifferent') {
        const situationMap = {
          unemployed: '0',
          employed: '1',
          indifferent: '-1'
        };
        const mappedValue = situationMap[options.candidateSituation] || '-1';
        actions.push(this.applyRadioFilter(page, 'Situação do Candidato', 'isEmployed', mappedValue));
      }

      if (options.disabilityStatus && options.disabilityStatus !== 'indifferent') {
        actions.push(this.applyDisabilityFilter(page, options.disabilityStatus));
      }

      if (Array.isArray(options.educationLevels) && options.educationLevels.length > 0) {
        actions.push(this.applyCheckboxFilter(page, 'Escolaridade', options.educationLevels));
      }

      if (actions.length > 0) {
        for (const action of actions) {
          try {
            await action;
            await humanizedWait(page, 400, 0.2);
          } catch (actionError) {
            console.warn('⚠️ Failed to apply specific filter:', actionError.message);
          }
        }
      }

      await this.submitFilterDrawer(page);
      await humanizedWait(page, 1500, 0.35);
      return true;
    } catch (error) {
      console.warn('⚠️ Failed to apply filters via Catho UI:', error.message);
      return false;
    }
  }

  async isFilterDrawerOpen(page) {
    try {
      return await page.evaluate(() => {
        const drawer = document.querySelector('.sc-hTUWRQ');
        if (!drawer) return false;
        const ariaHidden = drawer.getAttribute('aria-hidden');
        if (ariaHidden === 'true') return false;
        const style = window.getComputedStyle(drawer);
        return style.display !== 'none';
      });
    } catch (error) {
      return false;
    }
  }

  async openFilterDrawer(page) {
    try {
      await page.waitForSelector('button, a', { timeout: 5000 });

      const clicked = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('button, a'));
        const target = elements.find((el) => {
          const text = (el.textContent || '').toLowerCase();
          return text.includes('filtrar') || text.includes('filtro') || text.includes('filtros');
        });
        if (target) {
          target.click();
          return true;
        }
        const iconButton = Array.from(document.querySelectorAll('button svg[data-testid="TuneIcon"]'))
          .map((svg) => svg.closest('button'))
          .find(Boolean);
        if (iconButton) {
          iconButton.click();
          return true;
        }
        return false;
      });

      if (!clicked) {
        return false;
      }

      await page.waitForSelector('.Accordion__Wrapper-sc-xw8wcl-0', { timeout: 5000 });
      return true;
    } catch (error) {
      return false;
    }
  }

  async submitFilterDrawer(page) {
    try {
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const applyButton = buttons.find((btn) => {
          const text = (btn.textContent || '').toLowerCase();
          return (
            text.includes('aplicar') ||
            text.includes('ver resultados') ||
            text.includes('buscar') ||
            text.includes('ver') && text.includes('currículo')
          );
        });

        if (applyButton) {
          applyButton.click();
        } else {
          const closeButton = buttons.find((btn) => {
            const text = (btn.textContent || '').toLowerCase();
            return text.includes('fechar') || text.includes('concluir');
          });
          closeButton?.click();
        }
      });
    } catch (error) {
      console.warn('⚠️ Could not submit filter drawer:', error.message);
    }
  }

  async applyCheckboxFilter(page, sectionTitle, values = []) {
    if (!Array.isArray(values) || values.length === 0) {
      return;
    }
    await page.evaluate(({ title, values: targetValues }) => {
      const lowerTitle = title.toLowerCase();
      const headers = Array.from(document.querySelectorAll('button[aria-controls]'));
      const header = headers.find((btn) => (btn.textContent || '').toLowerCase().includes(lowerTitle));
      if (!header) return;

      const contentId = header.getAttribute('aria-controls');
      if (!contentId) return;
      const content = document.getElementById(contentId);
      if (!content) return;

      if (content.getAttribute('aria-hidden') === 'true') {
        header.click();
      }

      const targetSet = new Set(targetValues.map(String));
      const checkboxes = Array.from(content.querySelectorAll('input[type="checkbox"]'));
      checkboxes.forEach((checkbox) => {
        const value =
          checkbox.value ||
          checkbox.getAttribute('data-value') ||
          checkbox.getAttribute('id') ||
          checkbox.getAttribute('name');
        if (!value) return;

        const shouldCheck = targetSet.has(String(value));
        if (shouldCheck && !checkbox.checked) {
          checkbox.click();
        } else if (!shouldCheck && checkbox.checked) {
          checkbox.click();
        }
      });
    }, { title: sectionTitle, values });
  }

  async applyRadioFilter(page, sectionTitle, inputName, targetValue) {
    if (!targetValue && targetValue !== 0) {
      return;
    }
    await page.evaluate(({ title, inputName, targetValue }) => {
      const lowerTitle = title.toLowerCase();
      const headers = Array.from(document.querySelectorAll('button[aria-controls]'));
      const header = headers.find((btn) => (btn.textContent || '').toLowerCase().includes(lowerTitle));
      if (!header) return;

      const contentId = header.getAttribute('aria-controls');
      if (!contentId) return;
      const content = document.getElementById(contentId);
      if (!content) return;

      if (content.getAttribute('aria-hidden') === 'true') {
        header.click();
      }

      const radios = Array.from(content.querySelectorAll(`input[type="radio"][name="${inputName}"]`));
      const target = radios.find((radio) => {
        const value = radio.value || radio.getAttribute('data-value') || radio.getAttribute('id');
        return String(value) === String(targetValue);
      });
      if (target && !target.checked) {
        const label = target.closest('label');
        if (label) {
          label.click();
        } else {
          target.click();
        }
      }
    }, { title: sectionTitle, inputName, targetValue });
  }

  async applyDisabilityFilter(page, status = 'indifferent') {
    if (!status || status === 'indifferent') {
      return;
    }

    await page.evaluate((status) => {
      const lowerTitle = 'deficiência';
      const headers = Array.from(document.querySelectorAll('button[aria-controls]'));
      const header = headers.find((btn) => (btn.textContent || '').toLowerCase().includes(lowerTitle));
      if (!header) return;

      const contentId = header.getAttribute('aria-controls');
      if (!contentId) return;
      const content = document.getElementById(contentId);
      if (!content) return;
      if (content.getAttribute('aria-hidden') === 'true') {
        header.click();
      }

      const checkboxGroups = Array.from(content.querySelectorAll('input[type="checkbox"]'));
      const shouldSelect = status === 'with_disability';

      checkboxGroups.forEach((checkbox) => {
        if (shouldSelect && !checkbox.checked) {
          checkbox.click();
        } else if (!shouldSelect && checkbox.checked) {
          checkbox.click();
        }
      });
    }, status);
  }

  async applySalaryFilter(page, salaryRangeIds = []) {
    if (!Array.isArray(salaryRangeIds) || salaryRangeIds.length === 0) {
      return;
    }

    const rangeMap = {
      1: { min: 0, max: 1000 },
      2: { min: 1000, max: 2000 },
      3: { min: 2000, max: 3000 },
      4: { min: 3000, max: 4000 },
      5: { min: 4000, max: 5000 },
      6: { min: 5000, max: 6000 },
      7: { min: 6000, max: 7000 },
      8: { min: 7000, max: 8000 },
      9: { min: 8000, max: 10000 },
      10: { min: 10000, max: 12000 },
      11: { min: 12000, max: 15000 },
      12: { min: 15000, max: 20000 },
      13: { min: 20000, max: Infinity }
    };

    let minValue = Infinity;
    let maxValue = 0;

    salaryRangeIds.forEach((id) => {
      const range = rangeMap[id];
      if (!range) return;
      minValue = Math.min(minValue, range.min);
      maxValue = Math.max(maxValue, range.max);
    });

    if (minValue === Infinity) {
      minValue = 0;
    }

    const formatLabel = (value, isMax = false) => {
      if (value === Infinity || (isMax && value >= 20000)) {
        return 'R$ 20.000 ou mais';
      }
      if (value <= 0) {
        return 'R$ 0';
      }
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        maximumFractionDigits: 0,
        minimumFractionDigits: 0
      }).format(value);
    };

    const minLabel = formatLabel(minValue, false);
    const maxLabel = formatLabel(maxValue, true);

    await page.evaluate(({ minLabel, maxLabel }) => {
      const lowerTitle = 'pretensão salarial';
      const headers = Array.from(document.querySelectorAll('button[aria-controls]'));
      const header = headers.find((btn) => (btn.textContent || '').toLowerCase().includes(lowerTitle));
      if (!header) return;

      const contentId = header.getAttribute('aria-controls');
      if (!contentId) return;
      const content = document.getElementById(contentId);
      if (!content) return;
      if (content.getAttribute('aria-hidden') === 'true') {
        header.click();
      }

      const dropdownButtons = Array.from(content.querySelectorAll('div[role="combobox"] button'));
      if (!dropdownButtons.length) return;

      const selectOption = (button, targetLabel) => {
        if (!button || !targetLabel) return;
        const normalized = (value) => value.replace(/\s+/g, ' ').trim();

        button.click();

        const listbox = document.querySelector('[role="listbox"]');
        if (!listbox) {
          button.click();
          return;
        }

        const options = Array.from(listbox.querySelectorAll('[role="option"], li, button'));
        const targetOption = options.find((option) => {
          const text = normalized(option.textContent || '');
          return text === normalized(targetLabel);
        }) || options.find((option) => {
          const text = normalized(option.textContent || '');
          return text.includes(targetLabel);
        });

        if (targetOption) {
          targetOption.click();
        } else {
          listbox.dispatchEvent(new Event('keydown', { key: 'Escape', bubbles: true }));
        }
      };

      const [minButton, maxButton] = dropdownButtons;
      if (minButton) selectOption(minButton, minLabel);
      if (maxButton) selectOption(maxButton, maxLabel);
    }, { minLabel, maxLabel });
  }
}
