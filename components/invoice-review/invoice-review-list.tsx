'use client';

import { useMemo, useState } from 'react';
import { FileSearch } from 'lucide-react';
import { toast } from 'sonner';
import { DeleteReviewDialog } from '@/components/invoice-review/delete-review-dialog';
import { InvoiceReviewRow } from '@/components/invoice-review/invoice-review-row';
import { WorkspaceSetupNotice } from '@/components/workspace-setup-notice';
import { bulkDeleteCopy, deletionMessage, isReviewProcessing, reviewName, singleDeleteCopy } from '@/lib/invoice-review/actions';
import { deleteInvoiceReviews } from '@/lib/invoice-review/load';
import type { VendorInvoice } from '@/lib/invoice-review/types';

type PendingDelete = {
  ids: string[];
  title: string;
  description: string;
};

export function InvoiceReviewList({
  invoices,
  loading,
  error,
  blocked,
  organizationId,
  onRemove,
  onUpdated,
}: {
  invoices: VendorInvoice[];
  loading: boolean;
  error: string;
  blocked: boolean;
  organizationId: string;
  onRemove: (ids: string[]) => void;
  onUpdated: (invoice: VendorInvoice) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const selectableIds = useMemo(
    () => invoices.filter((invoice) => !isReviewProcessing(invoice)).map((invoice) => invoice.document_id),
    [invoices],
  );
  const selected = selectedIds.filter((id) => selectableIds.includes(id));
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.includes(id));
  const approvedIds = invoices.filter((invoice) => invoice.status === 'approved' && !isReviewProcessing(invoice)).map((invoice) => invoice.document_id);

  function namesFor(ids: string[]) {
    return ids.map((id) => {
      const invoice = invoices.find((item) => item.document_id === id);
      return invoice ? reviewName(invoice) : id;
    });
  }

  async function confirmDelete() {
    if (!pending || deleting) return;
    const ids = pending.ids;
    setDeleting(true);
    setDeleteError('');
    const result = await deleteInvoiceReviews(organizationId, ids);
    if (result.deletedIds.length > 0) {
      onRemove(result.deletedIds);
      setSelectedIds((current) => current.filter((id) => !result.deletedIds.includes(id)));
      if (expandedId && result.deletedIds.includes(expandedId)) setExpandedId(null);
      toast(deletionMessage(result.deletedIds.length));
    }
    if (result.failed.length > 0) {
      const failedIds = result.failed.map((item) => item.id);
      const detail = result.failed.map((item) => `${namesFor([item.id])[0]}: ${item.message}`).join(' ');
      setDeleteError(`Could not delete ${failedIds.length === 1 ? 'this invoice review' : 'these invoice reviews'}. ${detail}`);
    }
    setDeleting(false);
    setPending(null);
  }

  return <div className="space-y-4">
    {error && <p role="alert" className="rounded-lg border border-rose-900/50 bg-rose-950/20 p-4 text-sm text-rose-200">{error}</p>}
    {deleteError && <p role="alert" className="rounded-lg border border-rose-900/50 bg-rose-950/20 p-4 text-sm text-rose-200">{deleteError}</p>}
    {blocked ? <WorkspaceSetupNotice /> : loading && invoices.length === 0 ? (
      <div role="status" aria-label="Loading invoices" className="space-y-3">
        <span className="sr-only">Loading invoices</span>
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-[4.5rem] animate-pulse rounded-xl border border-line bg-panel" />
        ))}
      </div>
    ) : invoices.length === 0 && !error ? (
      <section className="rounded-xl border border-line bg-panel p-10 text-center" aria-live="polite">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-white/5 text-slate-400">
          <FileSearch size={22} aria-hidden="true" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-white">No invoices to review</h2>
        <p className="mt-2 text-sm text-slate-400">Processed vendor invoices will show up here.</p>
      </section>
    ) : invoices.length > 0 ? (
      <>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(element) => {
                if (element) element.indeterminate = selected.length > 0 && !allSelected;
              }}
              disabled={deleting || selectableIds.length === 0}
              onChange={(event) => setSelectedIds(event.target.checked ? selectableIds : [])}
              aria-label="Select all invoice reviews"
            />
            Select all
          </label>
          {selected.length > 0 && (
            <button
              type="button"
              disabled={deleting}
              onClick={() => setPending({
                ids: selected,
                title: 'Delete selected reviews',
                description: bulkDeleteCopy(selected.length),
              })}
              className="rounded-lg border border-rose-900/60 px-4 py-2 text-sm text-rose-200 hover:bg-rose-950/30 disabled:opacity-50"
            >
              Delete selected
            </button>
          )}
          {approvedIds.length > 0 && (
            <button
              type="button"
              disabled={deleting}
              onClick={() => setPending({
                ids: approvedIds,
                title: 'Delete all approved',
                description: bulkDeleteCopy(approvedIds.length, true),
              })}
              className="rounded-lg border border-line px-4 py-2 text-sm text-slate-200 hover:bg-white/5 disabled:opacity-50"
            >
              Delete all approved
            </button>
          )}
        </div>
        <ul className="space-y-3">
          {invoices.map((invoice) => (
            <InvoiceReviewRow
              key={`${invoice.document_id}:${invoice.status}:${invoice.processed_at}:${invoice.error?.retryable ?? ''}:${invoice.error?.message ?? ''}:${invoice.error?.reason ?? ''}`}
              invoice={invoice}
              expanded={expandedId === invoice.document_id}
              selected={selected.includes(invoice.document_id)}
              onToggle={() => setExpandedId((current) => current === invoice.document_id ? null : invoice.document_id)}
              onSelectedChange={(checked) => setSelectedIds((current) => (
                checked ? [...current, invoice.document_id] : current.filter((id) => id !== invoice.document_id)
              ))}
              onDelete={() => setPending({
                ids: [invoice.document_id],
                title: 'Delete invoice review',
                description: singleDeleteCopy(invoice),
              })}
              onUpdated={onUpdated}
              organizationId={organizationId}
              deleteDisabled={deleting}
            />
          ))}
        </ul>
      </>
    ) : null}
    <DeleteReviewDialog
      open={pending !== null}
      title={pending?.title ?? 'Delete invoice review'}
      description={pending?.description ?? ''}
      busy={deleting}
      onCancel={() => { if (!deleting) setPending(null); }}
      onConfirm={() => void confirmDelete()}
    />
  </div>;
}
