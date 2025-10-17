import React, { useMemo } from 'react';
import ExpandableText from './ExpandableText.jsx';
import FactGrid, { FactItem } from './FactGrid.jsx';
import RecencyTag from './RecencyTag.jsx';
import ContactActions from './ContactActions.jsx';
import {
  computeEmploymentStatus,
  deriveSalaryInfo,
  ensureISODate,
  formatLocation,
  getRecencyLabel,
  normalizeAbout,
  titleCase
} from '../utils/formatters.js';

const sanitize = (value = '') =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const extractSummaryValue = (summary = '', labels = []) => {
  if (!summary) return null;
  const segments = summary
    .split(/[\n|]/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  for (const segment of segments) {
    const normalizedSegment = sanitize(segment);
    for (const label of labels) {
      const normalizedLabel = sanitize(label);
      if (normalizedSegment.startsWith(`${normalizedLabel}:`)) {
        const [, ...rest] = segment.split(':');
        return rest.join(':').trim();
      }
    }
  }

  return null;
};

const getAboutFromSummary = (summary = '') => {
  if (!summary) return '';
  const markers = [/pretens/i, /idiomas/i, /atualizado/i];
  const positions = markers
    .map((regex) => summary.search(regex))
    .filter((index) => index >= 0);
  const cutoffIndex = positions.length > 0 ? Math.min(...positions) : summary.length;
  return normalizeAbout(summary.slice(0, cutoffIndex));
};

const buildIcon = (path) => (
  <svg className="h-5 w-5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={path} />
  </svg>
);

const statusStyles = {
  employed: 'bg-blue-50 text-blue-700 ring-blue-100',
  available: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  default: 'bg-slate-100 text-slate-600 ring-slate-200'
};

export default function CandidateCard({ candidate, onDelete, onToast }) {
  const data = useMemo(() => {
    if (!candidate) return null;

    const summary = candidate.summary || '';
    const profile = candidate.__profile || {};
    const personalData = profile.personalData || {};
    const experiences = Array.isArray(profile.work_experiences) ? profile.work_experiences : [];

    const employmentStatus = computeEmploymentStatus(experiences);
    const salaryFromSummary = extractSummaryValue(summary, ['Pretensao', 'Pretens\u00E3o salarial']);
    const salaryInfo = deriveSalaryInfo(candidate.salary_expectation || salaryFromSummary, experiences);

    const updatedAtISO = ensureISODate(candidate.last_updated) || ensureISODate(extractSummaryValue(summary, ['Atualizado']));
    const recencyLabel = updatedAtISO
      ? getRecencyLabel(updatedAtISO)
      : extractSummaryValue(summary, ['Atualizado']) || null;

    const location =
      formatLocation({
        city: personalData.city || candidate.city,
        state: personalData.state || candidate.state,
        district: personalData.neighborhood || candidate.district
      }) ||
      formatLocation(candidate.location) ||
      candidate.location ||
      null;

    const headline =
      candidate.job_title ||
      profile?.careerInfo?.desired_position ||
      profile?.careerInfo?.headline ||
      extractSummaryValue(summary, ['Cargo de interesse', 'Objetivo']) ||
      null;

    const about =
      normalizeAbout(candidate.qualifications || candidate.about || '') ||
      getAboutFromSummary(summary) ||
      '';

    const email = personalData.email || candidate.contact_email || candidate.email || null;
    const phone = personalData.phone || candidate.contact_phone || candidate.phone || null;

    const experienceDetail = [employmentStatus.role, employmentStatus.company].filter(Boolean).join(' \\u2022 ');

    const statusVariant = employmentStatus.variant || 'default';

    return {
      id: candidate.id,
      name: titleCase(candidate.name || ''),
      headline,
      location,
      about,
      updatedAtISO,
      recencyLabel,
      status: {
        label: employmentStatus.label,
        detail: experienceDetail,
        variant: statusVariant
      },
      salary: {
        expectation: salaryInfo.expectation,
        last: salaryInfo.lastSalary
      },
      email,
      phone,
      profileUrl: candidate.profile_url,
      searchQuery: candidate.search_query,
      canDelete: Boolean(onDelete && candidate.id)
    };
  }, [candidate, onDelete]);

  if (!data) return null;

  const handleDelete = () => {
    if (data.canDelete && typeof onDelete === 'function') {
      onDelete(data.id);
      if (typeof onToast === 'function') {
        onToast('Curr\u00EDculo removido da lista', 'info');
      }
    }
  };

  const handleCopy = (type) => {
    if (typeof onToast !== 'function') return;
    if (type === 'email') {
      onToast('E-mail copiado para a \u00E1rea de transfer\u00EAncia', 'success');
    } else if (type === 'phone') {
      onToast('Telefone copiado para a \u00E1rea de transfer\u00EAncia', 'success');
    } else {
      onToast('N\u00E3o foi poss\u00EDvel copiar. Tente novamente.', 'error');
    }
  };

  const factItems = [
    {
      icon: 'M5 13l4 4L19 7',
      label: 'Status atual',
      value: data.status.label
    },
    {
      icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
      label: 'Pretens\u00E3o salarial',
      value: data.salary.expectation
    },
    {
      icon: 'M17 9V7a5 5 0 00-10 0v2M5 9h14l-1 11H6L5 9z',
      label: '\u00DAltimo sal\u00E1rio',
      value: data.salary.last
    }
  ];

  if (!data.salary.last && data.status.detail) {
    factItems.push({
      icon: 'M13 16h-1v-4h-1m1-4h.01M12 18a6 6 0 100-12 6 6 0 000 12z',
      label: '\u00DAltima experi\u00EAncia',
      value: data.status.detail
    });
  }

  return (
    <article className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-lg focus-within:shadow-lg">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-xl font-semibold text-slate-900 truncate">{data.name}</h3>
            {data.headline && <p className="text-sm font-medium text-primary-700 truncate">{data.headline}</p>}
            {data.location && <p className="text-sm text-slate-500">{data.location}</p>}
          </div>
          <div className="flex flex-col items-end gap-2">
            <span
              className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
                statusStyles[data.status.variant] || statusStyles.default
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-current opacity-80" />
              {data.status.label}
            </span>
            {data.updatedAtISO ? (
              <RecencyTag updatedAt={data.updatedAtISO} />
            ) : (
              data.recencyLabel && (
                <span className="text-xs font-medium text-slate-500">{data.recencyLabel}</span>
              )
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {data.profileUrl && (
            <a
              href={data.profileUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-2 rounded-lg border border-primary-600 px-3 py-2 text-sm font-semibold text-primary-600 hover:bg-primary-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
              Abrir na Catho
            </a>
          )}
          <button
            type="button"
            onClick={handleDelete}
            disabled={!data.canDelete}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
              data.canDelete
                ? 'border-red-200 text-red-600 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500'
                : 'border-slate-200 text-slate-300 cursor-not-allowed'
            }`}
            title={data.canDelete ? 'Excluir candidato' : 'Curriculo ainda nao salvo'}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Excluir
          </button>
        </div>
      </header>

      {data.about && (
        <section aria-label="Resumo profissional">
          <ExpandableText text={data.about} maxLines={4} />
        </section>
      )}

      <section aria-label="Informacoes principais">
        <FactGrid>
          {factItems.map((item) => (
            <FactItem
              key={item.label}
              icon={buildIcon(item.icon)}
              label={item.label}
              value={item.value}
            />
          ))}
        </FactGrid>
      </section>

      {(data.phone || data.email) && (
        <section aria-label="Contatos do candidato" className="pt-4 border-t border-slate-200">
          <ContactActions
            email={data.email}
            phone={data.phone}
            onCopy={handleCopy}
          />
        </section>
      )}

      {data.searchQuery && (
        <footer className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-1 font-semibold text-slate-600 uppercase tracking-wide">
            Busca
          </span>
          <span>{data.searchQuery}</span>
        </footer>
      )}
    </article>
  );
}
