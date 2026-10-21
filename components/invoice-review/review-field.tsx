'use client';

import { useEffect, useId, useState } from 'react';
import type { FieldKind } from '@/lib/invoice-review/fields';
import type { FieldMeta } from '@/lib/invoice-review/types';
import { confidenceLevel, formatFieldValue } from '@/lib/invoice-review/format';

const CATEGORIES = ['labor', 'parts', 'fee', 'other'] as const;

const CONFIDENCE_CLASSES = {
  high: 'bg-emerald/15 text-mint',
  medium: 'bg-amber-400/15 text-amber-200',
  low: 'bg-rose-400/15 text-rose-200',
} as const;

function EditedMark({ original }: { original: string }) {
  return <span className="group relative inline-flex">
    <span
      className="rounded-full bg-mint/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-mint"
      title={`Original: ${original}`}
    >
      edited
    </span>
    <span className="pointer-events-none absolute right-0 top-full z-20 mt-1 w-max max-w-xs rounded-md border border-line bg-ink px-2 py-1 text-[11px] font-normal normal-case tracking-normal text-slate-200 opacity-0 shadow-lg group-hover:opacity-100">
      Original: {original}
    </span>
  </span>;
}

export function ReviewField({
  documentId,
  label,
  path,
  value,
  original,
  meta,
  kind,
  currency,
  edited,
  emphasize = false,
  compact = false,
  onCommit,
  onView,
}: {
  documentId: string;
  label: string;
  path: string;
  value: string;
  original: string;
  meta?: FieldMeta;
  kind: FieldKind;
  currency: string;
  edited: boolean;
  emphasize?: boolean;
  compact?: boolean;
  onCommit: (path: string, value: string) => void;
  onView: (path: string) => void;
}) {
  const reactId = useId();
  const inputId = `${documentId}-${path}-${reactId}`.replace(/[^a-zA-Z0-9_-]/g, '-');
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(value);
  const formatsWhileBlurred = kind === 'date' || kind === 'money' || kind === 'number';
  const level = meta ? confidenceLevel(meta.confidence) : null;
  const originalDisplay = formatFieldValue(kind, original, currency);

  useEffect(() => {
    if (!focused) setText(value);
  }, [focused, value]);

  function view() {
    setFocused(true);
    setText(value);
    onView(path);
  }

  const shown = focused || !formatsWhileBlurred ? text : formatFieldValue(kind, text, currency);
  const controlClass = `w-full bg-transparent outline-none placeholder:text-slate-600 ${
    emphasize ? 'text-lg font-semibold text-mint' : 'text-sm text-slate-100'
  }`;

  return <div className={`rounded-lg border ${
    meta?.needs_review ? 'border-amber-300/70 bg-amber-300/10' : 'border-line bg-ink/40'
  } ${compact ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
    <div className="mb-1 flex items-center justify-between gap-2">
      <label htmlFor={inputId} className={compact ? 'sr-only' : 'text-xs text-slate-400'}>{label}</label>
      <span className="ml-auto flex items-center gap-1.5">
        {meta?.needs_review && <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-200">Review</span>}
        {edited && <EditedMark original={originalDisplay} />}
        {level ? (
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${CONFIDENCE_CLASSES[level]}`}
            title={`${level} confidence, page ${meta?.source_page ?? 1}`}
          >
            {level}
          </span>
        ) : (
          <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-500" title="No confidence score">
            No score
          </span>
        )}
      </span>
    </div>
    {kind === 'category' ? (
      <select
        id={inputId}
        value={text}
        onFocus={view}
        onBlur={() => setFocused(false)}
        onChange={(event) => {
          setText(event.target.value);
          onCommit(path, event.target.value);
        }}
        className={controlClass}
      >
        {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
      </select>
    ) : kind === 'long' ? (
      <textarea
        id={inputId}
        value={text}
        rows={compact ? 2 : 3}
        placeholder="—"
        title={edited ? `Original: ${originalDisplay}` : undefined}
        onFocus={view}
        onBlur={() => setFocused(false)}
        onChange={(event) => {
          setText(event.target.value);
          onCommit(path, event.target.value);
        }}
        className={`${controlClass} resize-y`}
      />
    ) : (
      <input
        id={inputId}
        value={shown}
        readOnly={!focused && formatsWhileBlurred}
        inputMode={kind === 'money' || kind === 'number' ? 'decimal' : undefined}
        placeholder="—"
        title={edited ? `Original: ${originalDisplay}` : undefined}
        onFocus={view}
        onBlur={() => setFocused(false)}
        onChange={(event) => {
          setText(event.target.value);
          onCommit(path, event.target.value);
        }}
        className={controlClass}
      />
    )}
  </div>;
}
