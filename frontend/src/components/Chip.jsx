import React from 'react';

export default function Chip({ label }) {
  if (!label) return null;
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
      {label}
    </span>
  );
}
