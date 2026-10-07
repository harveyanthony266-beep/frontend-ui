'use client';

import { useCallback, useEffect, useState } from 'react';
import { Archive, Download, Search } from 'lucide-react';
import { WorkspaceSetupNotice } from '@/components/workspace-setup-notice';
import { useWorkspace } from '@/components/workspace-provider';
import type { InvoiceDocument } from '@/lib/api';

type ArchiveResponse = {
  data: InvoiceDocument[];
  total: number;
  page: number;
  limit: number;
};

function amount(value: number | null, currency: string | null) {
  if (value === null) return '—';
  return new Intl.NumberFormat(undefined, {
    style: currency ? 'currency' : 'decimal',
    currency: currency ?? undefined,
  }).format(value);
}

export default function Invoices() {
  const { organizationId, status: workspaceStatus } = useWorkspace();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [archive, setArchive] = useState<ArchiveResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const ready = workspaceStatus === 'ready' && Boolean(organizationId);

  const loadDocuments = useCallback(async () => {
    if (!ready) {
      setArchive(null);
      return;
    }
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (query.trim()) params.set('search', query.trim());
    if (status) params.set('status', status);
    try {
      const response = await fetch(`/api/backend/documents?${params}`, {
        headers: { 'x-organization-id': organizationId },
        cache: 'no-store',
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.message ?? 'Could not load the document archive.');
      }
      setArchive(await response.json());
    } catch (loadError) {
      setArchive(null);
      setError(loadError instanceof Error ? loadError.message : 'Could not load the document archive.');
    } finally {
      setLoading(false);
    }
  }, [organizationId, page, query, ready, status]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  async function exportXlsx() {
    if (!ready) return;
    setExporting(true);
    setError('');
    try {
      const filters: Record<string, string> = {};
      if (query.trim()) filters.search = query.trim();
      if (status) filters.status = status;
      const response = await fetch('/api/backend/documents/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': organizationId,
        },
        body: JSON.stringify({
          filters,
          format: 'xlsx',
          layout: 'invoice_totals',
        }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.message ?? 'Export failed.');
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = 'documents.xlsx';
      link.click();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Export failed.');
    } finally {
      setExporting(false);
    }
  }

  return <div className="mx-auto max-w-6xl space-y-7">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs uppercase tracking-[.25em] text-mint">Documents</p>
        <h1 className="mt-2 text-3xl font-semibold">Organization archive</h1>
        <p className="mt-2 text-sm text-slate-400">Only documents belonging to your authorized organization are shown.</p>
      </div>
      <button
        type="button"
        disabled={!ready || exporting}
        onClick={() => void exportXlsx()}
        className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2.5 text-sm text-slate-200 hover:bg-white/5 disabled:opacity-50"
      >
        <Download size={16} aria-hidden="true" /> {exporting ? 'Preparing…' : 'Export XLSX'}
      </button>
    </div>

    <section className="rounded-xl border border-line bg-panel p-4" aria-label="Archive filters">
      <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
        <label className="text-xs text-slate-400">Search
          <div className="relative mt-2">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => { setQuery(event.target.value); setPage(1); }}
              placeholder="Vendor or document number"
              disabled={!ready}
              className="w-full rounded-lg border border-line bg-ink py-2 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-600 disabled:opacity-50"
            />
          </div>
        </label>
        <label className="text-xs text-slate-400">Status
          <select
            value={status}
            onChange={(event) => { setStatus(event.target.value); setPage(1); }}
            disabled={!ready}
            className="mt-2 w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm text-slate-100 disabled:opacity-50"
          >
            <option value="">All statuses</option>
            <option value="processed">Processed</option>
            <option value="needs_review">Needs review</option>
            <option value="approved">Approved</option>
            <option value="failed">Failed</option>
            <option value="duplicate">Duplicate</option>
          </select>
        </label>
        <button
          type="button"
          disabled={!ready || loading}
          onClick={() => void loadDocuments()}
          className="self-end rounded-lg bg-white/5 px-4 py-2.5 text-sm text-slate-200 hover:bg-white/10 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>
    </section>

    {error && <p role="alert" className="rounded-lg border border-rose-900/50 bg-rose-950/20 p-4 text-sm text-rose-200">{error}</p>}
    {!ready ? (
      <WorkspaceSetupNotice />
    ) : loading ? (
      <p role="status" className="py-12 text-center text-sm text-slate-400">Loading archive…</p>
    ) : archive?.data.length ? (
      <>
        <div className="overflow-x-auto rounded-xl border border-line bg-panel">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3">Document</th><th className="px-4 py-3">Vendor</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-line/70">
              {archive.data.map((document) => (
                <tr key={document.id} className="align-top hover:bg-white/[.02]">
                  <td className="px-4 py-4">
                    <div className="font-medium text-slate-100">{document.document_number ?? document.invoice_number ?? document.original_filename ?? 'Untitled document'}</div>
                    <div className="mt-1 text-xs text-slate-500">{document.document_type ?? 'document'}</div>
                  </td>
                  <td className="px-4 py-4 text-slate-300">{document.vendor_name ?? '—'}</td>
                  <td className="px-4 py-4 text-slate-300">{document.document_date ?? document.invoice_date ?? '—'}</td>
                  <td className="px-4 py-4 tabular-nums text-slate-200">{amount(document.total_amount, document.currency)}</td>
                  <td className="px-4 py-4">
                    <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs">{document.status}</span>
                    {document.status === 'needs_review' && Boolean(document.review_reasons?.length) && (
                      <p className="mt-2 max-w-56 text-xs leading-5 text-amber-300">{document.review_reasons?.join('; ')}</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between text-sm text-slate-400">
          <span>{archive.total} document{archive.total === 1 ? '' : 's'}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-line px-3 py-2 disabled:opacity-40">Previous</button>
            <span className="px-2 py-2">Page {archive.page}</span>
            <button disabled={page * archive.limit >= archive.total || loading} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-line px-3 py-2 disabled:opacity-40">Next</button>
          </div>
        </div>
      </>
    ) : ready ? (
      <section className="rounded-xl border border-line bg-panel p-10 text-center" aria-live="polite">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-white/5 text-slate-400"><Archive size={22} aria-hidden="true" /></div>
        <h2 className="mt-4 text-lg font-semibold text-white">No documents found</h2>
        <p className="mt-2 text-sm text-slate-400">Try changing your filters or upload a document.</p>
      </section>
    ) : null}
  </div>;
}
