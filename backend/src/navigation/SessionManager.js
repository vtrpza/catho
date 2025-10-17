/**
 * Manages browser session state (cookies, localStorage, etc.)
 */
export class SessionManager {
  constructor() {
    this.sessionData = {
      cookies: [],
      localStorage: [],
      authenticated: false
    };
  }

  /**
   * Capture session data from a page
   */
  async captureSession(page) {
    if (!page) return;

    try {
      // Capture cookies
      this.sessionData.cookies = await page.cookies();
    } catch (error) {
      console.log('⚠️ Could not capture cookies:', error.message);
      this.sessionData.cookies = [];
    }

    try {
      // Capture localStorage
      const storageEntries = await page.evaluate(() => {
        return Object.entries(window.localStorage || {});
      });
      this.sessionData.localStorage = storageEntries || [];
    } catch (error) {
      console.log('⚠️ Could not capture localStorage:', error.message);
      this.sessionData.localStorage = [];
    }

    this.sessionData.authenticated = true;
    console.log('✓ Session captured successfully');
  }

  /**
   * Apply session data to a page
   */
  async applySession(page) {
    if (!page || !this.sessionData.authenticated) return;

    // Apply cookies
    if (this.sessionData.cookies.length > 0) {
      try {
        await page.setCookie(...this.sessionData.cookies);
        console.log('✓ Cookies applied to page');
      } catch (error) {
        console.log('⚠️ Could not apply cookies:', error.message);
      }
    }

    // Apply localStorage
    if (this.sessionData.localStorage.length > 0) {
      try {
        await page.evaluateOnNewDocument((entries) => {
          entries.forEach(([key, value]) => {
            try {
              window.localStorage.setItem(key, value);
            } catch (err) {
              // Ignore storage errors
            }
          });
        }, this.sessionData.localStorage);
        console.log('✓ LocalStorage applied to page');
      } catch (error) {
        console.log('⚠️ Could not apply localStorage:', error.message);
      }
    }
  }

  /**
   * Check if session is authenticated
   */
  isAuthenticated() {
    return this.sessionData.authenticated;
  }

  /**
   * Clear session data
   */
  clearSession() {
    this.sessionData = {
      cookies: [],
      localStorage: [],
      authenticated: false
    };
    console.log('✓ Session cleared');
  }

  /**
   * Get session data
   */
  getSessionData() {
    return { ...this.sessionData };
  }

  /**
   * Set session data
   */
  setSessionData(data) {
    this.sessionData = {
      ...this.sessionData,
      ...data
    };
  }
}
