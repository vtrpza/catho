import React from 'react';
import { getRecencyBucket, getRecencyLabel } from '../utils/formatters.js';

const STYLES = {
  fresh: 'bg-success-50 text-success-700 ring-success-100',
  stale: 'bg-warning-50 text-warning-700 ring-warning-100',
  old: 'bg-slate-100 text-slate-600 ring-slate-200'
};

export default function RecencyTag({ updatedAt }) {
  const bucket = getRecencyBucket(updatedAt);
  const label = getRecencyLabel(updatedAt);
  const styles = STYLES[bucket] || STYLES.old;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${styles}`}
      aria-label={label}
    >
      <span className="w-2 h-2 rounded-full bg-current opacity-80" />
      {label}
    </span>
  );
}
