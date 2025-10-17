/**
 * Helper to navigate with consistent headers/referer and classify redirects.
 */
export async function navigateWithContext(page, url, options = {}) {
  const {
    referer,
    baseHeaders = {},
    waitUntil = 'networkidle2',
    timeout = 30000,
    inspectBody = true,
    blockedPatterns = [
      /operac[aã]o invalida/i,
      /anunciar curriculo gratis/i,
      /area[-_\s]?re[c]{1,2}rutador/i
    ],
    loginPatterns = [/\/login/i, /\/credenciamento/i],
    debug = false
  } = options;

  const headers = { ...baseHeaders };
  if (referer) {
    headers.referer = referer;
  }

  if (Object.keys(headers).length > 0) {
    await page.setExtraHTTPHeaders(headers);
  }

  const startTime = Date.now();
  const response = await page.goto(url, { waitUntil, timeout }).catch(error => {
    return { error };
  });
  const duration = Date.now() - startTime;
  const finalUrl = page.url();
  const responseStatus = typeof response?.status === 'function' ? response.status() : null;

  let redirected = false;
  let loginRedirect = false;
  let blocked = false;
  let bodyPreview = '';

  if (response?.error) {
    const result = {
      finalUrl,
      redirected,
      loginRedirect,
      blocked,
      responseStatus: null,
      duration,
      error: response.error.message
    };

    if (debug) {
      console.log('[navigateWithContext] Falha ao navegar', {
        url,
        finalUrl,
        duration,
        error: response.error.message
      });
    }
    return result;
  }

  if (response && response.url && response.url() && response.url() !== url) {
    redirected = true;
  }

  if (finalUrl && finalUrl !== url) {
    if (loginPatterns.some(pattern => pattern.test(finalUrl))) {
      loginRedirect = true;
    }
    if (blockedPatterns.some(pattern => pattern.test(finalUrl))) {
      blocked = true;
    }
  }

  if (inspectBody && (!loginRedirect && !blocked)) {
    try {
      bodyPreview = await page.evaluate(() => {
        if (!document || !document.body) return '';
        const text = document.body.innerText || '';
        return text.slice(0, 1200);
      });

      if (!blocked && bodyPreview) {
        if (blockedPatterns.some(pattern => pattern.test(bodyPreview))) {
          blocked = true;
        }
        if (loginPatterns.some(pattern => pattern.test(bodyPreview))) {
          loginRedirect = true;
        }
      }
    } catch (error) {
      if (debug) {
        console.log('[navigateWithContext] Falha ao inspecionar body:', error.message);
      }
    }
  }

  const result = {
    finalUrl,
    redirected,
    loginRedirect,
    blocked,
    responseStatus,
    duration,
    bodyPreview: debug ? bodyPreview : '',
    error: null
  };

  if (debug) {
    console.log('[navigateWithContext] Resultado navegação', {
      url,
      finalUrl,
      redirected,
      loginRedirect,
      blocked,
      responseStatus,
      duration,
      preview: result.bodyPreview ? result.bodyPreview.slice(0, 200) : ''
    });
  }

  return result;
}
