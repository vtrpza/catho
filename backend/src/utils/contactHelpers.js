/**
 * Utilities for detecting and extracting phone/email contact information within
 * Catho profile pages. Designed to be serializable so they can run inside the
 * browser context via `page.evaluate`, and reusable from Node-based tests.
 */

export function buildContactOptions(kind) {
  const iconTestIds = kind === 'phone'
    ? ['SmartphoneIcon', 'PhoneIcon', 'PhoneIphoneIcon', 'PhoneAndroidIcon', 'PhoneEnabledIcon']
    : ['MailOutlineIcon', 'MailIcon', 'EmailIcon', 'AlternateEmailIcon', 'ForwardToInboxIcon'];

  const placeholderRegex = kind === 'phone'
    ? /ver telefone|visualizar telefone|mostrar telefone|ver numero|visualizar numero|mostrar numero|ver celular|visualizar celular|mostrar celular|ver contato telefonico|mostrar contato telefonico/i
    : /ver email|ver e-mail|visualizar email|visualizar e-mail|mostrar email|mostrar e-mail|ver contato de email|mostrar contato de email/i;

  const valueRegex = kind === 'phone'
    ? /(\(?\d{2}\)?\s*9?\d{4,5}[-\s]?\d{4})/
    : /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

  const labelPhrases = (kind === 'phone'
    ? [
        'ver telefone',
        'visualizar telefone',
        'mostrar telefone',
        'ver numero',
        'visualizar numero',
        'mostrar numero',
        'ver celular',
        'visualizar celular',
        'mostrar celular',
        'ver contato telefonico',
        'mostrar contato telefonico'
      ]
    : [
        'ver email',
        'ver e-mail',
        'visualizar email',
        'visualizar e-mail',
        'mostrar email',
        'mostrar e-mail',
        'ver contato de email',
        'mostrar contato de email'
      ]).map(phrase => normalizeText(phrase));

  return {
    iconTestIds,
    placeholderPattern: placeholderRegex.source,
    valuePattern: valueRegex.source,
    labelPhrases
  };
}

export function normalizeText(value) {
  if (!value || typeof value !== 'string') return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function hasContactTrigger(options = {}) {
  const normalize = (value) => {
    if (!value || typeof value !== 'string') return '';
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  };

  const { iconTestIds = [], labelPhrases = [] } = options;

  const hasIcon = iconTestIds.some(id => document.querySelector(`svg[data-testid="${id}"]`));
  if (hasIcon) return true;

  const candidates = Array.from(
    document.querySelectorAll('button, [role="button"], .MuiButtonBase-root, .Button__StyledButton-sc-1ovnfsw-1')
  );

  return candidates.some(element => {
    const text = normalize(element.innerText || element.textContent || '');
    if (!text) return false;
    return labelPhrases.some(phrase => text.includes(phrase));
  });
}

export function hasVisibleContact(options = {}) {
  const normalize = (value) => {
    if (!value || typeof value !== 'string') return '';
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  };

  const isVisible = (element) => {
    let current = element;
    while (current && current instanceof HTMLElement) {
      const style = window.getComputedStyle(current);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
        return false;
      }
      if (current.hasAttribute && current.hasAttribute('aria-hidden') && current.getAttribute('aria-hidden') !== 'false') {
        return false;
      }
      current = current.parentElement;
    }
    return true;
  };

  const {
    iconTestIds = [],
    placeholderPattern,
    valuePattern,
    kind = 'phone'
  } = options;

  const placeholder = placeholderPattern ? new RegExp(placeholderPattern, 'i') : null;
  const valueRegex = valuePattern
    ? new RegExp(valuePattern, kind === 'phone' ? '' : 'i')
    : null;

  const isValidValue = (text) => {
    if (!valueRegex) return false;
    return valueRegex.test(text);
  };

  const collectContactAreas = (icon) => {
    if (!icon) return [];

    const areas = [
      icon.closest('[class*="Row"]'),
      icon.closest('[class*="Col"]'),
      icon.closest('button'),
      icon.parentElement,
      icon.parentElement ? icon.parentElement.parentElement : null,
      icon.parentElement ? icon.parentElement.nextElementSibling : null,
      icon.parentElement && icon.parentElement.parentElement
        ? icon.parentElement.parentElement.nextElementSibling
        : null
    ];

    return areas.filter(Boolean);
  };

  const gatherVisibleText = (root) => {
    if (!root) return '';
    const parts = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    while (walker.nextNode()) {
      const textNode = walker.currentNode;
      const parent = textNode.parentElement;
      if (!parent) continue;

      if (!isVisible(parent)) continue;

      const chunk = (textNode.textContent || '').trim();
      if (chunk) parts.push(chunk);
    }
    return parts.join(' ');
  };

  const areasHaveValue = (icon) => {
    const areas = collectContactAreas(icon);
    for (const area of areas) {
      const raw = gatherVisibleText(area);
      const text = normalize(raw);
      if (!text || (placeholder && placeholder.test(text))) continue;
      if (isValidValue(text)) return true;

      if (kind === 'email' && area.querySelector) {
        const mailto = Array.from(area.querySelectorAll('a[href^="mailto:"]'));
        if (mailto.some(link => isValidValue(link.getAttribute('href') || '') || isValidValue(link.innerText || link.textContent || ''))) {
          return true;
        }
      }
    }
    return false;
  };

  if (iconTestIds.some(id => areasHaveValue(document.querySelector(`svg[data-testid="${id}"]`)))) {
    return true;
  }

  if (kind === 'email') {
    const mailto = document.querySelector('a[href^="mailto:"]');
    if (mailto) {
      if (!isVisible(mailto)) return false;
      const href = normalize(mailto.getAttribute('href') || '');
      const label = normalize(mailto.innerText || mailto.textContent || '');
      if (isValidValue(href) || isValidValue(label)) {
        return true;
      }
    }
  }

  return false;
}

export function clickContactButton(options = {}) {
  const normalize = (value) => {
    if (!value || typeof value !== 'string') return '';
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  };

  const { iconTestIds = [], labelPhrases = [] } = options;

  const attemptClick = (element) => {
    if (!element) return false;
    const clickable = element.closest && element.closest('button')
      ? element.closest('button')
      : element;

    if (typeof clickable.click === 'function') {
      clickable.click();
      return true;
    }

    try {
      clickable.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return true;
    } catch (err) {
      return false;
    }
  };

  for (const id of iconTestIds) {
    const icon = document.querySelector(`svg[data-testid="${id}"]`);
    if (!icon) continue;
    const button = icon.closest('button');
    if (button && attemptClick(button)) {
      return true;
    }
  }

  const candidates = Array.from(
    document.querySelectorAll('button, [role="button"], .MuiButtonBase-root, .Button__StyledButton-sc-1ovnfsw-1')
  );

  for (const element of candidates) {
    const text = normalize(element.innerText || element.textContent || '');
    if (!text) continue;

    if (labelPhrases.some(phrase => text.includes(phrase))) {
      if (attemptClick(element)) {
        return true;
      }
    }
  }

  const spans = Array.from(document.querySelectorAll('span, div'));
  for (const element of spans) {
    const text = normalize(element.innerText || element.textContent || '');
    if (!text) continue;
    if (labelPhrases.some(phrase => text.includes(phrase))) {
      if (attemptClick(element)) {
        return true;
      }
    }
  }

  return false;
}

export function collectContactValues(options = {}) {
  const {
    iconTestIds = [],
    placeholderPattern,
    kind = 'phone'
  } = options;

  const values = [];
  const seen = new Set();
  const placeholder = placeholderPattern ? new RegExp(placeholderPattern, 'i') : null;

  const isVisible = (element) => {
    let current = element;
    while (current && current instanceof HTMLElement) {
      const style = window.getComputedStyle(current);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
        return false;
      }
      if (current.hasAttribute && current.hasAttribute('aria-hidden') && current.getAttribute('aria-hidden') !== 'false') {
        return false;
      }
      current = current.parentElement;
    }
    return true;
  };

  const pushValue = (raw) => {
    if (!raw) return;
    const cleaned = (raw || '').replace(/^mailto:/i, '').trim();
    if (!cleaned) return;

    const isValid = kind === 'phone'
      ? /\(?\d{2}\)?\s*9?\d{4,5}[-\s]?\d{4}/.test(cleaned)
      : /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i.test(cleaned);

    if (!isValid) return;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    values.push(cleaned);
  };

  const collectContactAreas = (icon) => {
    if (!icon) return [];

    const areas = [
      icon.closest('[class*="Row"]'),
      icon.closest('[class*="Col"]'),
      icon.closest('button'),
      icon.parentElement,
      icon.parentElement ? icon.parentElement.parentElement : null,
      icon.parentElement ? icon.parentElement.nextElementSibling : null,
      icon.parentElement && icon.parentElement.parentElement
        ? icon.parentElement.parentElement.nextElementSibling
        : null
    ];

    return areas.filter(Boolean);
  };

  const gatherVisibleText = (root) => {
    if (!root) return '';
    const parts = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    while (walker.nextNode()) {
      const textNode = walker.currentNode;
      const parent = textNode.parentElement;
      if (!parent) continue;

      if (!isVisible(parent)) continue;

      const chunk = (textNode.textContent || '').trim();
      if (chunk) parts.push(chunk);
    }
    return parts.join(' ');
  };

  const inspectNode = (node) => {
    if (!node) return;
    const text = gatherVisibleText(node).trim();

    if (text && !(placeholder && placeholder.test(text))) {
      if (kind === 'phone') {
        const matches = text.match(/(\(?\d{2}\)?\s*9?\d{4,5}[-\s]?\d{4})/g) || [];
        matches.forEach(pushValue);
      } else {
        const matches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi) || [];
        matches.forEach(pushValue);
      }
    }

    if (kind === 'email' && node.querySelector) {
      const links = node.querySelectorAll('a[href^="mailto:"]');
      links.forEach(link => {
        pushValue(link.getAttribute('href') || '');
        pushValue(link.innerText || link.textContent || '');
      });
    }
  };

  iconTestIds.forEach(id => {
    const icon = document.querySelector(`svg[data-testid="${id}"]`);
    if (!icon) return;
    const areas = collectContactAreas(icon);
    areas.forEach(inspectNode);
  });

  if (kind === 'email' && values.length === 0) {
    const mailto = document.querySelector('a[href^="mailto:"]');
    if (mailto) {
      if (isVisible(mailto)) {
        pushValue(mailto.getAttribute('href') || '');
        pushValue(mailto.innerText || mailto.textContent || '');
      }
    }
  }

  return values.length ? values.join(', ') : null;
}

export function listContactTriggers(options = {}) {
  const normalize = (value) => {
    if (!value || typeof value !== 'string') return '';
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  };

  const { labelPhrases = [] } = options;

  const candidates = Array.from(
    document.querySelectorAll('button, [role="button"], .MuiButtonBase-root, .Button__StyledButton-sc-1ovnfsw-1, span, div')
  );

  return candidates
    .map(element => {
      const text = normalize(element.innerText || element.textContent || '');
      return {
        tag: element.tagName,
        classes: element.className,
        text,
        matched: labelPhrases.some(phrase => text.includes(phrase))
      };
    })
    .filter(entry => entry.text)
    .slice(0, 30);
}
