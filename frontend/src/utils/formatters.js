const MONTHS_IN_YEAR = 12;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

const padNumber = (value) => value.toString().padStart(2, '0');
const onlyDigits = (value = '') => value.replace(/\D/g, '');

const pickValue = (source = {}, keys = []) => {
  for (const key of keys) {
    const value = source?.[key];
    if (value) return value;
  }
  return null;
};

const parseDateInput = (value) => {
  if (!value || typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/atual/i.test(trimmed)) return new Date();

  const direct = new Date(trimmed);
  if (!Number.isNaN(direct.getTime())) return direct;

  const full = trimmed.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (full) {
    const [, day, month, yearRaw] = full;
    const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
    return new Date(`${year}-${padNumber(month)}-${padNumber(day)}`);
  }

  const monthYear = trimmed.match(/(\d{1,2})\/(\d{4})/);
  if (monthYear) {
    const [, month, year] = monthYear;
    return new Date(`${year}-${padNumber(month)}-01`);
  }

  const yearMatch = trimmed.match(/(19|20)\d{2}/);
  if (yearMatch) {
    return new Date(`${yearMatch[0]}-01-01`);
  }

  return null;
};

const isCurrentExperience = (item = {}) => {
  const endRaw = pickValue(item, ['end_date', 'endDate', 'until', 'finishDate', 'period']);
  if (!endRaw) return true;
  if (item.is_current === true || item.isCurrent === true) return true;
  return /atual/i.test(endRaw);
};

const getExperienceEndDate = (item = {}) => {
  const endRaw = pickValue(item, ['end_date', 'endDate', 'until', 'finishDate', 'period']);
  return parseDateInput(endRaw);
};

const getExperienceStartDate = (item = {}) => {
  const startRaw = pickValue(item, ['start_date', 'startDate', 'from', 'beginDate', 'period']);
  return parseDateInput(startRaw);
};

const getExperienceTimestamp = (item = {}) => {
  if (isCurrentExperience(item)) return Date.now();
  const endDate = getExperienceEndDate(item);
  if (endDate) return endDate.getTime();
  const startDate = getExperienceStartDate(item);
  if (startDate) return startDate.getTime();
  return 0;
};

const sortExperiencesByRecency = (experience = []) =>
  [...experience].sort((a, b) => getExperienceTimestamp(b) - getExperienceTimestamp(a));

const differenceInMonths = (fromDate, toDate = new Date()) => {
  if (!fromDate) return null;
  let months = (toDate.getFullYear() - fromDate.getFullYear()) * 12;
  months += toDate.getMonth() - fromDate.getMonth();
  if (toDate.getDate() < fromDate.getDate()) {
    months -= 1;
  }
  return Math.max(months, 0);
};

export const titleCase = (value = '') => {
  if (!value) return '';
  return value
    .toLowerCase()
    .split(' ')
    .map((word, index) => {
      if (!word) return '';
      const lower = word.toLowerCase();
      const isPreposition = index !== 0 && ['de', 'da', 'do', 'das', 'dos', 'e'].includes(lower);
      return isPreposition ? lower : `${lower[0].toUpperCase()}${lower.slice(1)}`;
    })
    .join(' ');
};

export const formatCurrencyBRL = (amount) => {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return null;
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2
    }).format(amount);
  } catch (error) {
    return `R$ ${Number(amount).toFixed(2)}`;
  }
};

export const parseSalary = (value) => {
  if (!value) return null;
  const parsed = Number(
    value
      .toString()
      .replace(/[^0-9,.-]+/g, '')
      .replace(/\./g, '')
      .replace(',', '.')
  );
  return Number.isNaN(parsed) ? null : parsed;
};

export const formatSalaryValue = (value) => {
  if (!value) return null;
  if (typeof value === 'number') return formatCurrencyBRL(value);
  const numeric = parseSalary(value);
  if (numeric !== null) return formatCurrencyBRL(numeric);
  return value;
};

export const getRecencyBucket = (updatedAt) => {
  if (!updatedAt) return 'old';
  const base = new Date(updatedAt);
  if (Number.isNaN(base.getTime())) return 'old';
  const now = new Date();
  const diff = Math.floor((now - base) / MS_PER_DAY);
  if (diff <= 30) return 'fresh';
  if (diff <= 90) return 'stale';
  return 'old';
};

export const getRecencyLabel = (updatedAt) => {
  if (!updatedAt) return 'Atualizado h\u00E1 tempo indeterminado';
  const base = new Date(updatedAt);
  if (Number.isNaN(base.getTime())) return updatedAt;
  const now = new Date();
  const diffDays = Math.floor((now - base) / MS_PER_DAY);
  if (diffDays < 1) return 'Atualizado hoje';
  if (diffDays === 1) return 'Atualizado h\u00E1 1 dia';
  if (diffDays < 30) return `Atualizado h\u00E1 ${diffDays} dias`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) return 'Atualizado ha 1 mes';
  if (diffMonths < 12) return `Atualizado ha ${diffMonths} meses`;
  const diffYears = Math.floor(diffDays / 365);
  if (diffYears === 1) return 'Atualizado ha 1 ano';
  return `Atualizado ha ${diffYears} anos`;
};

export const ensureISODate = (value) => {
  const parsed = parseDateInput(value);
  return parsed ? parsed.toISOString() : null;
};

export const formatLocation = (location) => {
  if (!location) return null;
  if (typeof location === 'string') return location.trim();
  const { city, state, district, neighborhood } = location;
  const localDistrict = district || neighborhood;
  const cityState = [city, state].filter(Boolean).join(' / ');
  if (localDistrict) {
    return [cityState, localDistrict].filter(Boolean).join(' • ');
  }
  return cityState || null;
};

export const normalizeAbout = (text = '') => {
  if (!text) return '';
  return text
    .replace(/\b(Qualificacoes?|Resumo|Resumo profissional|Objetivo):?\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
};

export const formatDuration = (totalMonths = 0) => {
  if (!totalMonths || totalMonths <= 0) return null;
  const years = Math.floor(totalMonths / MONTHS_IN_YEAR);
  const months = totalMonths % MONTHS_IN_YEAR;
  const yearLabel = years > 0 ? `${years} ano${years > 1 ? 's' : ''}` : '';
  const monthLabel = months > 0 ? `${months} mes${months > 1 ? 'es' : ''}` : '';
  return [yearLabel, monthLabel].filter(Boolean).join(' e ');
};

export const getTotalExperienceMonths = (experience = []) => {
  if (!Array.isArray(experience)) return 0;
  return experience.reduce((total, item = {}) => {
    const months = Number(item.months || item.durationMonths || 0);
    if (Number.isNaN(months)) return total;
    return total + months;
  }, 0);
};

export const computeEmploymentStatus = (experience = []) => {
  if (!Array.isArray(experience) || experience.length === 0) {
    return {
      label: 'Disponivel',
      variant: 'available',
      current: false,
      role: null,
      company: null,
      sinceISO: null
    };
  }

  const sorted = sortExperiencesByRecency(experience);
  const current = sorted.find((item) => isCurrentExperience(item));

  if (current) {
    const role = pickValue(current, ['role', 'position', 'job_title', 'cargo']);
    const company = pickValue(current, ['company', 'employer', 'empresa']);
    const detail = [role, company].filter(Boolean).join(' • ');
    return {
      label: detail ? `Empregado • ${detail}` : 'Empregado',
      variant: 'employed',
      current: true,
      role: role || null,
      company: company || null,
      sinceISO: null
    };
  }

  const latest = sorted[0];
  const lastEndDate = getExperienceEndDate(latest);
  const monthsWithoutJob = lastEndDate ? differenceInMonths(lastEndDate) : null;

  let label = 'Disponivel';
  if (monthsWithoutJob !== null) {
    if (monthsWithoutJob === 0) {
      label = 'Disponivel recentemente';
    } else if (monthsWithoutJob === 1) {
      label = 'Disponivel ha 1 mes';
    } else {
      label = `Disponivel ha ${monthsWithoutJob} meses`;
    }
  }

  const role = pickValue(latest, ['role', 'position', 'job_title', 'cargo']);
  const company = pickValue(latest, ['company', 'employer', 'empresa']);

  return {
    label,
    variant: 'available',
    current: false,
    role: role || null,
    company: company || null,
    sinceISO: lastEndDate ? lastEndDate.toISOString() : null
  };
};

export const extractLastSalary = (experience = []) => {
  if (!Array.isArray(experience)) return null;
  const sorted = sortExperiencesByRecency(experience);
  for (const item of sorted) {
    const raw = pickValue(item, ['last_salary', 'lastSalary', 'salary', 'remuneration']);
    if (raw) return raw;
  }
  return null;
};

export const deriveSalaryInfo = (salaryExpectation, experience = []) => {
  const expectation = salaryExpectation ? salaryExpectation.toString().trim() : null;
  const expectationLower = expectation?.toLowerCase();
  const expectationLabel = expectation
    ? expectationLower?.includes('combinar')
      ? 'A combinar'
      : formatSalaryValue(expectation)
    : null;

  const lastSalary = extractLastSalary(experience);
  const lastSalaryLabel = lastSalary ? formatSalaryValue(lastSalary) : null;

  return {
    expectation: expectationLabel,
    lastSalary: lastSalaryLabel
  };
};

export const formatPhoneLink = (phone = '') => {
  const digits = onlyDigits(phone);
  if (!digits) return null;
  return `https://wa.me/${digits.startsWith('55') ? digits : `55${digits}`}`;
};

export const formatPhoneDisplay = (phone = '') => {
  const digits = onlyDigits(phone);
  if (!digits) return phone;
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (digits.length > 4) {
    return `${digits.slice(0, digits.length - 4)}-${digits.slice(-4)}`;
  }
  return phone;
};

export const getPhoneDigits = (phone = '') => {
  const digits = onlyDigits(phone);
  if (!digits) return null;
  return digits.startsWith('55') ? digits : `55${digits}`;
};
