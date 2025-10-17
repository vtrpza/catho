import puppeteer from 'puppeteer';
import {
  generateBrowserFingerprint,
  getStealthBrowserArgs,
  applyStealthMode,
  humanizedType,
  humanizedWait
} from '../utils/antiDetection.js';

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
  }

  async init() {
    try {
      console.log('🌐 Iniciando navegador...');

      // Verificar variável de ambiente para debug
      const isDebugMode = process.env.DEBUG_MODE === 'true';

      // Gerar fingerprint único para esta sessão
      this.fingerprint = generateBrowserFingerprint();
      console.log(`🎭 Fingerprint gerado: ${this.fingerprint.userAgent.substring(0, 50)}...`);

      this.browser = await puppeteer.launch({
        headless: isDebugMode ? false : 'new',
        args: getStealthBrowserArgs()
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
      if (!this.page) {
        await this.init();
      }

      console.log('🔑 Iniciando login no Catho...');

      // Navegar para a página de login
      await this.page.goto('https://www.catho.com.br/login/', {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Aguardar os campos de login aparecerem
      await this.page.waitForSelector('input[name="email"], input[type="email"]', { timeout: 10000 });

      console.log('📝 Preenchendo credenciais...');

      // Preencher email com digitação humanizada
      await humanizedType(this.page, 'input[name="email"], input[type="email"]', this.email, {
        minDelay: 80,
        maxDelay: 180
      });

      // Aguardar com tempo randomizado (simular leitura/pensamento)
      await humanizedWait(this.page, 1200, 0.4);

      // Preencher senha com digitação humanizada
      await humanizedType(this.page, 'input[name="password"], input[type="password"]', this.password, {
        minDelay: 70,
        maxDelay: 160
      });

      // Aguardar antes de clicar (simular verificação do form)
      await humanizedWait(this.page, 1000, 0.3);

      console.log('🚀 Submetendo formulário...');

      // Clicar no botão de login - usar XPath para encontrar botão com texto
      const submitButton = await this.page.evaluateHandle(() => {
        // Procurar por botão de submit ou botão com texto "Entrar"
        const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
        const submitBtn = buttons.find(btn =>
          btn.type === 'submit' ||
          btn.textContent.toLowerCase().includes('entrar') ||
          btn.textContent.toLowerCase().includes('login') ||
          btn.value?.toLowerCase().includes('entrar')
        );
        return submitBtn;
      });

      if (submitButton) {
        await Promise.all([
          submitButton.click(),
          this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
        ]);
      } else {
        // Tentar submeter o form diretamente
        await this.page.evaluate(() => {
          const form = document.querySelector('form');
          if (form) form.submit();
        });
        await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
      }

      // Verificar se o login foi bem-sucedido
      const currentUrl = this.page.url();

      if (currentUrl.includes('login') || currentUrl.includes('erro')) {
        throw new Error('Falha no login. Verifique as credenciais.');
      }

      this.isAuthenticated = true;
      await this.snapshotSession();
      console.log('✓ Login realizado com sucesso!');
      return true;
    } catch (error) {
      console.error('❌ Erro durante login:', error.message);
      this.isAuthenticated = false;
      throw error;
    }
  }

  async navigateToSearch(searchQuery) {
    try {
      if (!this.isAuthenticated) {
        await this.login();
      }
      await this.applySessionTo(this.page);

      const searchUrl = `https://www.catho.com.br/curriculos/busca/?q=${encodeURIComponent(searchQuery)}&pais_id=31`;
      console.log(`🔍 Navegando para: ${searchUrl}`);

      await this.page.goto(searchUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      return this.page;
    } catch (error) {
      console.error('❌ Erro ao navegar para busca:', error);
      throw error;
    }
  }

  async close() {
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

  async snapshotSession() {
    if (!this.page) return;
    try {
      this.sessionData.cookies = await this.page.cookies();
    } catch (error) {
      console.log('⚠️ Não foi possível capturar cookies:', error.message);
      this.sessionData.cookies = [];
    }

    try {
      const storageEntries = await this.page.evaluate(() => {
        return Object.entries(window.localStorage || {});
      });
      this.sessionData.localStorage = storageEntries || [];
    } catch (error) {
      console.log('⚠️ Não foi possível capturar localStorage:', error.message);
      this.sessionData.localStorage = [];
    }
  }

  async applySessionTo(page) {
    if (!page) return;

    await this.preparePage(page);

    if (this.sessionData.cookies.length > 0) {
      try {
        await page.setCookie(...this.sessionData.cookies);
      } catch (error) {
        console.log('⚠️ Não foi possível aplicar cookies na nova página:', error.message);
      }
    }

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
}
