/**
 * Anti-Detection & Bot Mitigation Utilities
 * Helps scraper appear more human-like to avoid detection
 */

// Pool of realistic user agents (recent Chrome and Firefox versions)
const USER_AGENTS = [
  // Chrome on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',

  // Chrome on Mac
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',

  // Firefox on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',

  // Firefox on Mac
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0',

  // Edge
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
];

// Common screen resolutions (desktop)
const SCREEN_RESOLUTIONS = [
  { width: 1920, height: 1080 }, // Full HD
  { width: 1366, height: 768 },  // Common laptop
  { width: 1440, height: 900 },  // MacBook
  { width: 1536, height: 864 },  // Scaled laptop
  { width: 2560, height: 1440 }, // 2K
  { width: 1600, height: 900 },  // 16:9 laptop
  { width: 1680, height: 1050 }  // 16:10 desktop
];

// Browser languages
const LANGUAGES = [
  'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  'pt-BR,pt;q=0.9',
  'pt-BR,pt;q=0.9,es;q=0.8,en;q=0.7',
  'pt-BR'
];

// Platforms
const PLATFORMS = [
  'Win32',
  'MacIntel',
  'Linux x86_64'
];

/**
 * Get a random item from an array
 */
function randomChoice(array) {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Generate a random delay between min and max milliseconds
 */
export function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Get a random user agent
 */
export function getRandomUserAgent() {
  return randomChoice(USER_AGENTS);
}

/**
 * Get a random viewport size
 */
export function getRandomViewport() {
  return randomChoice(SCREEN_RESOLUTIONS);
}

/**
 * Get a random language header
 */
export function getRandomLanguage() {
  return randomChoice(LANGUAGES);
}

/**
 * Get a random platform
 */
export function getRandomPlatform() {
  return randomChoice(PLATFORMS);
}

/**
 * Get realistic HTTP headers for requests
 */
export function getRealisticHeaders() {
  return {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': getRandomLanguage(),
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Cache-Control': 'max-age=0'
  };
}

/**
 * Generate a complete browser fingerprint configuration
 */
export function generateBrowserFingerprint() {
  const viewport = getRandomViewport();
  const userAgent = getRandomUserAgent();
  const language = getRandomLanguage();
  const platform = getRandomPlatform();

  return {
    userAgent,
    viewport,
    language,
    platform,
    headers: getRealisticHeaders()
  };
}

/**
 * Simulate human-like mouse movements on a page
 */
export async function simulateHumanBehavior(page) {
  try {
    // Random scroll
    const scrollAmount = randomDelay(100, 800);
    await page.evaluate((scroll) => {
      window.scrollBy({
        top: scroll,
        left: 0,
        behavior: 'smooth'
      });
    }, scrollAmount);

    // Wait a bit (reading time)
    await page.waitForTimeout(randomDelay(500, 1500));

    // Random mouse movement simulation
    await page.evaluate(() => {
      const event = new MouseEvent('mousemove', {
        clientX: Math.random() * window.innerWidth,
        clientY: Math.random() * window.innerHeight,
        bubbles: true
      });
      document.dispatchEvent(event);
    });

  } catch (error) {
    // Ignore errors in simulation
    console.log('⚠️ Erro na simulação de comportamento humano (ignorado)');
  }
}

/**
 * Wait with a randomized delay to appear more human-like
 * @param {number} baseDelay - Base delay in milliseconds
 * @param {number} variance - Variance percentage (0-1), e.g., 0.3 = ±30%
 */
export async function humanizedWait(page, baseDelay, variance = 0.3) {
  const minDelay = baseDelay * (1 - variance);
  const maxDelay = baseDelay * (1 + variance);
  const delay = randomDelay(minDelay, maxDelay);

  console.log(`⏳ Aguardando ${Math.round(delay / 1000)}s (humanizado)...`);
  await page.waitForTimeout(delay);
}

/**
 * Add stealth plugins to avoid detection
 * Makes Puppeteer harder to detect by websites
 */
export async function applyStealthMode(page) {
  // Override the navigator.webdriver property
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false
    });
  });

  // Override plugins to look more real
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        {
          0: { type: "application/x-google-chrome-pdf", suffixes: "pdf", description: "Portable Document Format", enabledPlugin: Plugin },
          description: "Portable Document Format",
          filename: "internal-pdf-viewer",
          length: 1,
          name: "Chrome PDF Plugin"
        },
        {
          0: { type: "application/pdf", suffixes: "pdf", description: "", enabledPlugin: Plugin },
          description: "",
          filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai",
          length: 1,
          name: "Chrome PDF Viewer"
        },
        {
          0: { type: "application/x-nacl", suffixes: "", description: "Native Client Executable", enabledPlugin: Plugin },
          1: { type: "application/x-pnacl", suffixes: "", description: "Portable Native Client Executable", enabledPlugin: Plugin },
          description: "",
          filename: "internal-nacl-plugin",
          length: 2,
          name: "Native Client"
        }
      ]
    });
  });

  // Override permissions
  await page.evaluateOnNewDocument(() => {
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission }) :
        originalQuery(parameters)
    );
  });

  // Add chrome object
  await page.evaluateOnNewDocument(() => {
    window.chrome = {
      runtime: {}
    };
  });

  // Mock languages
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'languages', {
      get: () => ['pt-BR', 'pt', 'en-US', 'en']
    });
  });
}

/**
 * Exponential backoff for retries
 * @param {number} attempt - Current attempt number (0-indexed)
 * @param {number} baseDelay - Base delay in milliseconds
 * @param {number} maxDelay - Maximum delay cap in milliseconds
 */
export function exponentialBackoff(attempt, baseDelay = 1000, maxDelay = 30000) {
  const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  const jitter = randomDelay(0, delay * 0.1); // Add 0-10% jitter
  return delay + jitter;
}

/**
 * Simulate typing with realistic delays between keystrokes
 */
export async function humanizedType(page, selector, text, options = {}) {
  const minDelay = options.minDelay || 50;
  const maxDelay = options.maxDelay || 150;

  for (const char of text) {
    await page.type(selector, char, {
      delay: randomDelay(minDelay, maxDelay)
    });
  }
}

/**
 * Check if we might be getting rate limited
 * Returns true if we should increase delays
 */
export function detectRateLimiting(errorCount, responseTime) {
  // If we're getting frequent errors or slow responses
  return errorCount > 3 || responseTime > 10000;
}

/**
 * Get an adaptive delay based on current conditions
 * Increases delay if we're potentially being rate limited
 */
export function getAdaptiveDelay(baseDelay, errorCount = 0, responseTime = 0) {
  let multiplier = 1;

  // Increase delay if we're seeing issues
  if (detectRateLimiting(errorCount, responseTime)) {
    multiplier = 1.5 + (errorCount * 0.2);
    console.log(`⚠️ Possível rate limiting detectado. Aumentando delay ${multiplier}x`);
  }

  return baseDelay * multiplier;
}

/**
 * Create a realistic browser args configuration
 */
export function getStealthBrowserArgs() {
  return [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--disable-gpu',
    '--window-size=1920,1080',
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
    '--flag-switches-begin --disable-site-isolation-trials --flag-switches-end',
    '--disable-web-security',
    '--disable-features=VizDisplayCompositor',
    // Performance optimizations for high concurrency
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-hang-monitor',
    '--disable-ipc-flooding-protection',
    '--disable-popup-blocking',
    '--disable-prompt-on-repost',
    '--metrics-recording-only',
    '--no-first-run',
    '--safebrowsing-disable-auto-update',
    '--enable-automation',
    '--password-store=basic',
    '--use-mock-keychain'
  ];
}
