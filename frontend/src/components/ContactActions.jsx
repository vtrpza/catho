import React from 'react';
import { formatPhoneDisplay } from '../utils/formatters.js';

export default function ContactActions({ email, phone, onCopy }) {
  const handleCopy = async (value, type) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      if (typeof onCopy === 'function') {
        onCopy(type);
      }
    } catch (error) {
      if (typeof onCopy === 'function') {
        onCopy('error');
      }
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {phone && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
          <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
          <span className="font-semibold uppercase tracking-wide text-xs text-slate-500">Telefone</span>
          <span className="text-sm font-medium text-slate-800">{formatPhoneDisplay(phone)}</span>
          <button
            type="button"
            onClick={() => handleCopy(phone, 'phone')}
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded"
            aria-label="Copiar telefone do candidato"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16h8M8 12h8m-6 8h4a2 2 0 002-2V7a2 2 0 00-2-2h-2l-2-2h-4a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            Copiar
          </button>
        </div>
      )}

      {email && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
          <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <span className="font-semibold uppercase tracking-wide text-xs text-slate-500">E-mail</span>
          <span className="text-sm font-medium text-slate-800 break-all">{email}</span>
          <button
            type="button"
            onClick={() => handleCopy(email, 'email')}
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded"
            aria-label="Copiar e-mail do candidato"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16h8M8 12h8m-6 8h4a2 2 0 002-2V7a2 2 0 00-2-2h-2l-2-2h-4a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            Copiar
          </button>
        </div>
      )}
    </div>
  );
}
