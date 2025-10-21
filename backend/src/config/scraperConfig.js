import path from 'path';

function parseNumber(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, min, max) {
  if (value === null) {
    return null;
  }
  const clamped = Math.max(min, Math.min(max, value));
  return Number.isNaN(clamped) ? null : clamped;
}

export function getEnvNumber(name, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const fromEnv = parseNumber(process.env[name]);
  const normalized = clamp(fromEnv, min, max);
  if (normalized === null) {
    return clamp(parseNumber(fallback), min, max);
  }
  return normalized;
}

export const SCRAPER_CONCURRENCY = getEnvNumber('SCRAPER_CONCURRENCY', 3, { min: 1, max: 12 });
export const SCRAPER_MAX_REQUESTS_PER_MINUTE = getEnvNumber(
  'SCRAPER_MAX_RPM',
  getEnvNumber('SCRAPER_RPM_LIMIT', 12, { min: 6, max: 40 }),
  { min: 6, max: 40 }
);
export const SCRAPER_PROFILE_DELAY_MS = getEnvNumber('SCRAPER_PROFILE_DELAY_MS', 2500, { min: 500, max: 12000 });
export const SCRAPER_PAGE_DELAY_MS = getEnvNumber('SCRAPER_PAGE_DELAY_MS', 2000, { min: 1000, max: 10000 });
export const SCRAPER_KEEPALIVE_INTERVAL_MS = getEnvNumber('SCRAPER_KEEPALIVE_INTERVAL_MS', 180000, { min: 60000, max: 600000 });
export const SCRAPER_KEEPALIVE_TIMEOUT_MS = getEnvNumber('SCRAPER_KEEPALIVE_TIMEOUT_MS', 12000, { min: 2000, max: 60000 });
export const SCRAPER_SESSION_REFRESH_INTERVAL_MS = getEnvNumber(
  'SCRAPER_SESSION_REFRESH_INTERVAL_MS',
  180000,
  { min: 60000, max: 600000 }
);
export const SCRAPER_REAUTH_RETRY_LIMIT = getEnvNumber('SCRAPER_REAUTH_RETRY_LIMIT', 3, { min: 1, max: 10 });
export const SCRAPER_REAUTH_BACKOFF_MS = getEnvNumber('SCRAPER_REAUTH_BACKOFF_MS', 5000, { min: 2000, max: 60000 });

const defaultUserDataDir = process.env.PUPPETEER_USER_DATA_DIR
  || path.join(process.cwd(), '.puppeteer', 'profile');

export const SCRAPER_USER_DATA_DIR = defaultUserDataDir;
