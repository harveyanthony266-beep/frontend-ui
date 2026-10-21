'use client';

import { useState } from 'react';
import { Check, ChevronDown, Download, X } from 'lucide-react';
import { ReviewField } from '@/components/invoice-review/review-field';
import { SourcePreview } from '@/components/invoice-review/source-preview';
import { readPath, valuesMatch, writePath } from '@/lib/invoice-review/edit';
import { downloadInvoiceCsv, downloadInvoiceWorkbook } from '@/lib/invoice-review/export';
import {
  billToFields,
  invoiceDetailFields,
  lineItemColumns,
  lineItemPath,
  propertyFields,
  remitFields,
  totalFields,
  vendorFields,
  type ReviewFieldDefinition,
} from '@/lib/invoice-review/fields';
import { flaggedFieldCount, formatDate, formatMoney, statusLabel } from '@/lib/invoice-review/format';
import { approveInvoiceReview } from '@/lib/invoice-review/load';
import type { VendorInvoice } from '@/lib/invoice-review/types';

const STATUS_CLASS = {
  needs_review: 'bg-amber-400/15 text-amber-200',
  approved: 'bg-emerald/15 text-mint',
  rejected: 'bg-rose-400/15 text-rose-200',
} as const;

function FieldSection({
  title,
  fields,
  draft,
  source,
  edited,
  onCommit,
  onView,
}: {
  title: string;
  fields: ReviewFieldDefinition[];
  draft: VendorInvoice;
  source: VendorInvoice;
  edited: Set<string>;
  onCommit: (path: string, value: string) => void;
  onView: (path: string) => void;
}) {
  return <section className="border-b border-line/70 px-4 py-5 sm:px-5">
    <h3 className="text-xs font-semibold uppercase tracking-[.18em] text-mint">{title}</h3>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {fields.map((field) => (
        <div key={field.path} className={field.kind === 'long' || field.emphasize ? 'sm:col-span-2' : undefined}>
          <ReviewField
            documentId={draft.document_id}
            label={field.label}
            path={field.path}
            value={readPath(draft, field.path)}
            original={readPath(source, field.path)}
            meta={source.field_meta[field.path]}
            kind={field.kind}
            currency={draft.totals.currency || 'USD'}
            edited={edited.has(field.path)}
            emphasize={field.emphasize}
            onCommit={onCommit}
            onView={onView}
          />
        </div>
      ))}
    </div>
  </section>;
}

export function InvoiceReviewRow({
  invoice,
  expanded,
  onToggle,
  organizationId,
}: {
  invoice: VendorInvoice;
  expanded: boolean;
  onToggle: () => void;
  organizationId: string;
}) {
  const panelId = `review-panel-${invoice.document_id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const toggleId = `${panelId}-toggle`;
  const [draft, setDraft] = useState(() => structuredClone(invoice));
  const [edited, setEdited] = useState<Set<string>>(() => new Set());
  const [viewed, setViewed] = useState<Set<string>>(() => new Set());
  const [rejectReason, setRejectReason] = useState('');
  const [approving, setApproving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [actionError, setActionError] = useState('');
  const flagCount = flaggedFieldCount(invoice.field_meta);
  const failedChecks = draft.validation.checks.filter((check) => !check.passed);
  const unreviewed = Object.entries(invoice.field_meta)
    .filter(([, meta]) => meta.needs_review)
    .map(([path]) => path)
    .filter((path) => !viewed.has(path));
  const approveReason = unreviewed.length > 0
    ? 'Review each flagged field before approving.'
    : draft.status === 'approved'
      ? 'This invoice is already approved.'
      : approving
        ? 'Approving this invoice.'
        : undefined;
  const exportReason = draft.status === 'approved' ? undefined : 'Export is available after this invoice is approved.';

  function view(path: string) {
    setViewed((current) => {
      if (current.has(path)) return current;
      const next = new Set(current);
      next.add(path);
      return next;
    });
  }

  function commit(path: string, raw: string) {
    setDraft((current) => writePath(current, path, raw));
    view(path);
    setEdited((current) => {
      const next = new Set(current);
      if (valuesMatch(path, raw, readPath(invoice, path))) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  async function approve() {
    if (approveReason) return;
    setApproving(true);
    setActionError('');
    try {
      await approveInvoiceReview(organizationId, draft.document_id);
      setDraft((current) => ({ ...current, status: 'approved' }));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not approve this invoice.');
    } finally {
      setApproving(false);
    }
  }

  function reject() {
    setActionError('');
    setDraft((current) => ({ ...current, status: 'rejected' }));
  }

  async function exportWorkbook() {
    if (draft.status !== 'approved' || exporting) return;
    setExporting(true);
    setActionError('');
    try {
      await downloadInvoiceWorkbook(draft);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not export this invoice.');
    } finally {
      setExporting(false);
    }
  }

  const sectionProps = { draft, source: invoice, edited, onCommit: commit, onView: view };

  return <li className="rounded-xl border border-line bg-panel">
    <button
      type="button"
      id={toggleId}
      aria-expanded={expanded}
      aria-controls={panelId}
      onClick={onToggle}
      className="flex w-full items-center gap-4 px-4 py-4 text-left hover:bg-white/[.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-mint sm:px-5"
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="font-medium text-white">{draft.vendor.name || 'Unknown vendor'}</span>
          <span className="text-slate-300">{draft.invoice.number || 'No number'}</span>
          <span className="tabular-nums text-slate-200">{formatMoney(draft.totals.total_due, draft.totals.currency || 'USD')}</span>
          <span className="text-slate-400">Due {formatDate(draft.invoice.due_date)}</span>
          <span className={`rounded-full px-2.5 py-1 text-xs ${STATUS_CLASS[draft.status]}`}>{statusLabel(draft.status)}</span>
          <span className={flagCount > 0 ? 'text-xs font-medium text-amber-200' : 'text-xs text-slate-500'}>
            {flagCount} flagged<span className="sr-only"> field{flagCount === 1 ? '' : 's'}</span>
          </span>
        </span>
      </span>
      <ChevronDown size={18} aria-hidden="true" className={`shrink-0 text-slate-500 transition ${expanded ? 'rotate-180' : ''}`} />
    </button>
    {!expanded && <div id={panelId} hidden />}
    {expanded && <div id={panelId} role="region" aria-labelledby={toggleId}>
      {failedChecks.length > 0 && (
        <div role="alert" className="border-y border-amber-300/40 bg-amber-300/10 px-4 py-3 text-sm text-amber-100 sm:px-5">
          <p className="font-medium">Validation needs attention</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {failedChecks.map((check) => <li key={check.name}>{check.message}</li>)}
          </ul>
        </div>
      )}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <FieldSection title="Invoice details" fields={invoiceDetailFields} {...sectionProps} />
          <FieldSection title="Vendor" fields={vendorFields} {...sectionProps} />
          <FieldSection title="Bill to" fields={billToFields} {...sectionProps} />
          <FieldSection title="Property and work" fields={propertyFields} {...sectionProps} />
          <section className="border-b border-line/70 px-4 py-5 sm:px-5">
            <h3 className="text-xs font-semibold uppercase tracking-[.18em] text-mint">Line items</h3>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead className="text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    {lineItemColumns.map((column) => (
                      <th key={column.path} scope="col" className="px-1 pb-2 font-medium">{column.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {draft.line_items.length === 0 ? (
                    <tr>
                      <td colSpan={lineItemColumns.length} className="py-4 text-sm text-slate-500">No line items extracted.</td>
                    </tr>
                  ) : draft.line_items.map((item, index) => (
                    <tr key={index} className="align-top">
                      {lineItemColumns.map((column) => {
                        const path = lineItemPath(index, column.path);
                        return <td key={path} className="px-1 py-1">
                          <ReviewField
                            documentId={draft.document_id}
                            label={`${column.label} for line ${index + 1}`}
                            path={path}
                            value={readPath(draft, path)}
                            original={readPath(invoice, path)}
                            meta={invoice.field_meta[path]}
                            kind={column.kind}
                            currency={draft.totals.currency || 'USD'}
                            edited={edited.has(path)}
                            compact
                            onCommit={commit}
                            onView={view}
                          />
                        </td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <FieldSection title="Totals" fields={totalFields} {...sectionProps} />
          <FieldSection title="Remit to and late fee terms" fields={remitFields} {...sectionProps} />
          <section className="px-4 py-5 sm:px-5">
            <h3 className="text-xs font-semibold uppercase tracking-[.18em] text-mint">Validation checks</h3>
            <ul className="mt-4 space-y-3">
              {draft.validation.checks.map((check, index) => (
                <li key={`${check.name}-${index}`} className="flex flex-wrap gap-3 rounded-lg border border-line bg-ink/40 px-3 py-3">
                  {check.passed ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-emerald"><Check size={16} aria-hidden="true" /> Passed</span>
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-rose-300"><X size={16} aria-hidden="true" /> Failed</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-100">{check.name}</p>
                    <p className="mt-1 text-sm leading-5 text-slate-400">{check.message}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <SourcePreview invoice={invoice} />
      </div>
      <div className="sticky bottom-0 z-10 border-t border-line bg-panel/95 px-4 py-3 backdrop-blur sm:px-5">
        {actionError && <p role="alert" className="mb-3 text-sm text-rose-200">{actionError}</p>}
        {unreviewed.length > 0 && <p className="mb-3 text-xs text-amber-200">Review each flagged field before approving.</p>}
        {draft.status === 'rejected' && rejectReason && (
          <p className="mb-3 text-sm text-rose-200">Reject reason: {rejectReason}</p>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-56 flex-1 text-xs text-slate-400">
            Reject reason
            <input
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              placeholder="Optional"
              className="mt-1 w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600"
            />
          </label>
          <button
            type="button"
            onClick={reject}
            className="rounded-lg border border-rose-900/60 px-4 py-2.5 text-sm text-rose-200 hover:bg-rose-950/30"
          >
            Reject
          </button>
          <span className="inline-flex" {...(approveReason ? { title: approveReason } : {})}>
            <button
              type="button"
              disabled={Boolean(approveReason)}
              onClick={() => void approve()}
              className="rounded-lg bg-emerald px-4 py-2.5 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              {approving ? 'Approving…' : 'Approve'}
            </button>
          </span>
          <span className="inline-flex" {...(exportReason ? { title: exportReason } : {})}>
            <button
              type="button"
              disabled={Boolean(exportReason)}
              onClick={() => downloadInvoiceCsv(draft)}
              className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2.5 text-sm text-slate-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download size={16} aria-hidden="true" /> Export CSV
            </button>
          </span>
          <span className="inline-flex" {...(exportReason ? { title: exportReason } : {})}>
            <button
              type="button"
              disabled={Boolean(exportReason) || exporting}
              onClick={() => void exportWorkbook()}
              className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2.5 text-sm text-slate-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download size={16} aria-hidden="true" /> {exporting ? 'Preparing…' : 'Export Excel'}
            </button>
          </span>
        </div>
      </div>
    </div>}
  </li>;
}
