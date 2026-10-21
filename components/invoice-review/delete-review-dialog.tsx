'use client';

import { useEffect, useId, useRef } from 'react';

export function DeleteReviewDialog({
  open,
  title,
  description,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  if (!open) return null;

  return <dialog
    ref={dialogRef}
    aria-labelledby={titleId}
    aria-describedby={descriptionId}
    onCancel={(event) => {
      if (busy) {
        event.preventDefault();
        return;
      }
      onCancel();
    }}
    className="w-[min(32rem,calc(100%-2rem))] rounded-xl border border-line bg-panel p-6 text-slate-100 shadow-glow backdrop:bg-black/60"
  >
    <h2 id={titleId} className="text-lg font-semibold text-white">{title}</h2>
    <p id={descriptionId} className="mt-3 text-sm leading-6 text-slate-300">{description}</p>
    <div className="mt-6 flex justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="rounded-lg border border-line px-4 py-2.5 text-sm text-slate-200 hover:bg-white/5 disabled:opacity-50"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={busy}
        className="rounded-lg border border-rose-900/60 bg-rose-950/40 px-4 py-2.5 text-sm font-semibold text-rose-100 hover:bg-rose-950/60 disabled:opacity-50"
      >
        {busy ? 'Deleting…' : 'Delete'}
      </button>
    </div>
  </dialog>;
}
