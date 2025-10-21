import fs from 'fs';
import puppeteer from 'puppeteer';
import {
  generateBrowserFingerprint,
  getStealthBrowserArgs,
  applyStealthMode,
  humanizedType,
  humanizedWait
} from '../utils/antiDetection.js';
import {
  SCRAPER_USER_DATA_DIR,
  SCRAPER_KEEPALIVE_INTERVAL_MS,
  SCRAPER_KEEPALIVE_TIMEOUT_MS,
  SCRAPER_SESSION_REFRESH_INTERVAL_MS,
  SCRAPER_REAUTH_RETRY_LIMIT,
  SCRAPER_REAUTH_BACKOFF_MS
} from '../config/scraperConfig.js';

export class CathoAuth {
  constructor(email, password) {
    this.email = email;
    this.password = password;
    this.browser = null;
    this.page = null;
    this.isAuthenticated = false;
    this.fingerprint = null;
    this.sessionData = {
      cookies: [],
      localStorage: []
    };
    this.refererBase = 'https://www.catho.com.br/';
    this.keepAliveTimer = null;
    this.keepAlivePage = null;
    this.reauthPromise = null;
    this.lastAuthValidation = 0;
  }

  async init() {
    try {
      console.log('🌐 Iniciando navegador...');

      // Verificar variável de ambiente para debug
      const isDebugMode = process.env.DEBUG_MODE === 'true';

      // Gerar fingerprint único para esta sessão
      this.fingerprint = generateBrowserFingerprint();
      console.log(`🎭 Fingerprint gerado: ${this.fingerprint.userAgent.substring(0, 50)}...`);

      try {
        if (SCRAPER_USER_DATA_DIR) {
          fs.mkdirSync(SCRAPER_USER_DATA_DIR, { recursive: true });
        }
      } catch (dirError) {
        console.warn('⚠️ Não foi possível preparar o diretório de sessão:', dirError.message);
      }

      this.browser = await puppeteer.launch({
        headless: isDebugMode ? false : 'new',
        args: getStealthBrowserArgs(),
        userDataDir: SCRAPER_USER_DATA_DIR,
        protocolTimeout: 120000  // Increase timeout for high concurrency
      });

      this.page = await this.browser.newPage();

      await this.preparePage(this.page);

      console.log(`✓ Navegador iniciado (${this.fingerprint.viewport.width}x${this.fingerprint.viewport.height})`);
      return true;
    } catch (error) {
      console.error('❌ Erro ao iniciar navegador:', error);
      throw error;
    }
  }

  async login() {
    try {
      if (!this.browser) {
        await this.init();
      } else if (!this.page) {
        this.page = await this.browser.newPage();
        await this.preparePage(this.page);
      }

      await this.performLoginFlow(this.page);
      this.isAuthenticated = true;
      await this.snapshotSession(this.page);
      this.lastAuthValidation = Date.now();
      this.startKeepAlive();
      console.log('✓ Login realizado com sucesso!');
      return true;
    } catch (error) {
      console.error('❌ Erro durante login:', error.message);
      this.isAuthenticated = false;
      throw error;
    }
  }

  async performLoginFlow(page) {
    if (!page) {
      throw new Error('Página inválida para login');
    }

    console.log('🔑 Iniciando login no Catho...');

    await page.goto('https://www.catho.com.br/login/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await page.waitForSelector('input[name="email"], input[type="email"]', { timeout: 10000 });

    console.log('📝 Preenchendo credenciais...');

    await humanizedType(page, 'input[name="email"], input[type="email"]', this.email, {
      minDelay: 80,
      maxDelay: 180
    });

    await humanizedWait(page, 1200, 0.4);

    await humanizedType(page, 'input[name="password"], input[type="password"]', this.password, {
      minDelay: 70,
      maxDelay: 160
    });

    await humanizedWait(page, 1000, 0.3);

    console.log('🚀 Submetendo formulário...');

    const submitButton = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
      const submitBtn = buttons.find(btn =>
        btn.type === 'submit' ||
        btn.textContent.toLowerCase().includes('entrar') ||
        btn.textContent.toLowerCase().includes('login') ||
        btn.value?.toLowerCase().includes('entrar')
      );
      return submitBtn;
    });

    try {
      if (submitButton) {
        await Promise.all([
          submitButton.click(),
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
        ]);
      } else {
        await page.evaluate(() => {
          const form = document.querySelector('form');
          if (form) form.submit();
        });
        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      }
    } finally {
      if (submitButton) {
        await submitButton.dispose().catch(() => {});
      }
    }

    const currentUrl = page.url();
    if (currentUrl.includes('login') || currentUrl.includes('erro')) {
      throw new Error('Falha no login. Verifique as credenciais.');
    }
  }

  async navigateToSearch(searchQuery) {
    try {
      if (!this.isAuthenticated) {
        await this.login();
      }
      await this.ensureAuthenticated(this.page);
      await this.applySessionTo(this.page);

      const searchUrl = `https://www.catho.com.br/curriculos/busca/?q=${encodeURIComponent(searchQuery)}&pais_id=31`;
      console.log(`🔍 Navegando para: ${searchUrl}`);

      await this.page.goto(searchUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      try {
        await this.page.waitForSelector('article.sc-fvtFIe, article', { timeout: 7000 });
      } catch {
        await this.page.waitForTimeout(500);
      }

      return this.page;
    } catch (error) {
      console.error('❌ Erro ao navegar para busca:', error);
      throw error;
    }
  }

  async close() {
    this.stopKeepAlive();
    if (this.keepAlivePage) {
      try {
        await this.keepAlivePage.close();
      } catch {
        // ignore closing errors
      }
      this.keepAlivePage = null;
    }
    this.reauthPromise = null;
    this.lastAuthValidation = 0;
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      this.isAuthenticated = false;
      console.log('✓ Navegador fechado');
    }
  }

  getPage() {
    return this.page;
  }

  isLoggedIn() {
    return this.isAuthenticated;
  }

  getRequestHeaders() {
    return this.fingerprint?.headers || {};
  }

  async preparePage(page) {
    if (!page) return;

    // Aplicar modo stealth para evitar detecção
    await applyStealthMode(page);

    // Configure interception only once per page
    if (!page.__cathoRequestInterception) {
      try {
        await page.setRequestInterception(true);
      } catch (error) {
        console.warn('⚠️ Não foi possível ativar interceptação de requisições:', error.message);
      }

      const blockedResourceTypes = new Set(['image', 'media', 'font', 'stylesheet', 'eventsource']);
      const blockedHosts = [
        'google-analytics.com',
        'googletagmanager.com',
        'facebook.net',
        'doubleclick.net',
        'static-plataforma.catho.com.br/images',
        'plataforma.catho.com.br/images'
      ];

      page.on('request', request => {
        try {
          const resourceType = request.resourceType();
          const url = request.url();

          if (blockedResourceTypes.has(resourceType)) {
            return request.abort();
          }

          if (blockedHosts.some(host => url.includes(host))) {
            return request.abort();
          }

          return request.continue();
        } catch (interceptError) {
          console.warn('⚠️ Falha na interceptação de requisição:', interceptError.message);
          try {
            request.continue();
          } catch {
            // ignore follow-up failures
          }
        }
      });

      page.__cathoRequestInterception = true;
    }

    // Configurar user agent randomizado
    if (this.fingerprint?.userAgent) {
      await page.setUserAgent(this.fingerprint.userAgent);
    }

    // Configurar viewport randomizado
    if (this.fingerprint?.viewport) {
      await page.setViewport(this.fingerprint.viewport);
    }

    // Adicionar headers realistas
    if (this.fingerprint?.headers) {
      await page.setExtraHTTPHeaders(this.fingerprint.headers);
    }

    // Configurar idioma
    if (this.fingerprint?.language) {
      await page.evaluateOnNewDocument((lang) => {
        Object.defineProperty(navigator, 'language', {
          get: () => lang.split(',')[0]
        });
      }, this.fingerprint.language);
    }
  }

  async snapshotSession(sourcePage = this.page) {
    if (!sourcePage) return;
    try {
      this.sessionData.cookies = await sourcePage.cookies();
    } catch (error) {
      console.log('⚠️ Não foi possível capturar cookies:', error.message);
      this.sessionData.cookies = [];
    }

    try {
      const storageEntries = await sourcePage.evaluate(() => {
        return Object.entries(window.localStorage || {});
      });
      this.sessionData.localStorage = storageEntries || [];
    } catch (error) {
      console.log('⚠️ Não foi possível capturar localStorage:', error.message);
      this.sessionData.localStorage = [];
    }
    this.lastAuthValidation = Date.now();
  }

  async applySessionTo(page, options = {}) {
    if (!page) return;

    // Refresh session from main page before applying (unless explicitly skipped)
    const shouldRefreshSnapshot = options.skipSnapshot !== true;
    if (shouldRefreshSnapshot && this.page && this.isAuthenticated) {
      try {
        await this.snapshotSession();
      } catch (snapshotError) {
        console.warn('⚠️ Falha ao atualizar snapshot de sessão:', snapshotError.message);
      }
    }

    // CRITICAL: Set cookies BEFORE enabling request interception
    // Navigate to Catho domain first - Puppeteer requires a page URL before setCookie works
    if (this.sessionData.cookies.length > 0) {
      try {
        // Navigate to base domain to establish context for cookies - minimal wait
        await page.goto('https://www.catho.com.br/', {
          waitUntil: 'domcontentloaded',
          timeout: 10000
        });

        await page.setCookie(...this.sessionData.cookies);
        console.log(`  🍪 Applied ${this.sessionData.cookies.length} cookies`);
      } catch (error) {
        console.log('⚠️ Não foi possível aplicar cookies na nova página:', error.message);
      }
    } else {
      console.warn('⚠️ No cookies to apply! Session may not be authenticated.');
    }

    // Now prepare page (enables request interception) - cookies already set
    await this.preparePage(page);

    // localStorage - applies to future navigations
    if (this.sessionData.localStorage.length > 0) {
      try {
        await page.evaluateOnNewDocument((entries) => {
          entries.forEach(([key, value]) => {
            try {
              window.localStorage.setItem(key, value);
            } catch (err) {
              // Ignore storage errors (quota, etc.)
            }
          });
        }, this.sessionData.localStorage);
      } catch (error) {
      console.log('⚠️ Não foi possível aplicar localStorage na nova página:', error.message);
      }
    }
  }

  startKeepAlive() {
    this.stopKeepAlive();
    if (!this.browser || SCRAPER_KEEPALIVE_INTERVAL_MS <= 0) {
      return;
    }
    this.keepAliveTimer = setInterval(() => {
      this.keepSessionAlive().catch(error => {
        console.log('⚠️ Erro no keep-alive:', error.message);
      });
    }, SCRAPER_KEEPALIVE_INTERVAL_MS);
    this.keepSessionAlive().catch(error => {
      console.log('⚠️ Erro inicial no keep-alive:', error.message);
    });
  }

  stopKeepAlive() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  async keepSessionAlive() {
    if (!this.browser || !this.isAuthenticated) {
      return;
    }

    const elapsed = Date.now() - this.lastAuthValidation;
    if (elapsed < SCRAPER_SESSION_REFRESH_INTERVAL_MS) {
      return;
    }

    let keepAlivePage = this.keepAlivePage;

    try {
      if (!keepAlivePage || keepAlivePage.isClosed?.()) {
        keepAlivePage = await this.browser.newPage();
        this.keepAlivePage = keepAlivePage;
        await this.preparePage(keepAlivePage);
      }

      await this.applySessionTo(keepAlivePage);
      const response = await keepAlivePage.goto(
        'https://www.catho.com.br/minha-conta/?keepalive=1',
        {
          waitUntil: 'domcontentloaded',
          timeout: SCRAPER_KEEPALIVE_TIMEOUT_MS
        }
      ).catch(() => null);

      const status = typeof response?.status === 'function' ? response.status() : null;

      if (status && status >= 200 && status < 400) {
        await this.snapshotSession(keepAlivePage);
        this.isAuthenticated = true;
      } else if (status === 401 || status === 403) {
        console.log('⚠️ Sessão expirou durante keep-alive');
        this.isAuthenticated = false;
        await this.reauthenticate('keepalive');
      }
    } catch (error) {
      console.log('⚠️ Falha ao manter sessão ativa:', error.message);
      if (keepAlivePage && !keepAlivePage.isClosed?.()) {
        try {
          await keepAlivePage.close();
        } catch {
          // ignore close failure
        }
      }
      this.keepAlivePage = null;
    }
  }

  async ensureAuthenticated(page = this.page, { forceCheck = false } = {}) {
    if (!this.isAuthenticated) {
      return this.reauthenticate('lost_session');
    }

    const elapsed = Date.now() - this.lastAuthValidation;
    if (!forceCheck && elapsed < SCRAPER_SESSION_REFRESH_INTERVAL_MS) {
      return true;
    }

    const targetPage = page || this.page;
    if (!targetPage) {
      return this.reauthenticate('no_page');
    }

    try {
      const status = await targetPage.evaluate(async () => {
        try {
          const response = await fetch('https://www.catho.com.br/minha-conta/', {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store'
          });
          return {
            status: response.status,
            url: response.url || '',
            redirected: response.redirected
          };
        } catch (err) {
          return { status: 0, url: '', redirected: false };
        }
      });

      const stillAuthenticated = status
        && status.status >= 200
        && status.status < 400
        && !String(status.url || '').includes('/login');

      if (stillAuthenticated) {
        this.lastAuthValidation = Date.now();
        this.isAuthenticated = true;
        return true;
      }

      this.isAuthenticated = false;
    } catch (error) {
      console.log('⚠️ Não foi possível validar sessão:', error.message);
    }

    return this.reauthenticate('validation_failed');
  }

  async reauthenticate(reason = 'unknown') {
    if (this.reauthPromise) {
      return this.reauthPromise;
    }

    this.reauthPromise = (async () => {
      let attempt = 0;
      console.log(`🔄 Reautenticando sessão (${reason})...`);

      while (attempt < SCRAPER_REAUTH_RETRY_LIMIT) {
        attempt++;
        let loginPage = null;
        try {
          if (!this.browser) {
            await this.init();
          }

          loginPage = await this.browser.newPage();
          await this.preparePage(loginPage);
          if (this.sessionData.cookies.length > 0 || this.sessionData.localStorage.length > 0) {
            await this.applySessionTo(loginPage);
          }

          await this.performLoginFlow(loginPage);
          await this.snapshotSession(loginPage);

          if (this.page) {
            await this.applySessionTo(this.page);
          }

          this.isAuthenticated = true;
          this.lastAuthValidation = Date.now();
          this.startKeepAlive();
          console.log('✓ Sessão renovada com sucesso');
          return true;
        } catch (error) {
          console.error(`❌ Falha na reautenticação (tentativa ${attempt}):`, error.message);
          const backoff = SCRAPER_REAUTH_BACKOFF_MS * attempt;
          await new Promise(resolve => setTimeout(resolve, backoff));
        } finally {
          if (loginPage && !loginPage.isClosed?.()) {
            try {
              await loginPage.close();
            } catch {
              // ignore close failure
            }
          }
        }
      }

      console.error('🚫 Não foi possível reautenticar após múltiplas tentativas');
      this.isAuthenticated = false;
      return false;
    })();

    try {
      return await this.reauthPromise;
    } finally {
      this.reauthPromise = null;
    }
  }
}
