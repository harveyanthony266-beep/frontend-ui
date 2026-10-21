'use client';

import { useState } from 'react';
import { FileSearch } from 'lucide-react';
import { InvoiceReviewRow } from '@/components/invoice-review/invoice-review-row';
import { WorkspaceSetupNotice } from '@/components/workspace-setup-notice';
import type { VendorInvoice } from '@/lib/invoice-review/types';

export function InvoiceReviewList({
  invoices,
  loading,
  error,
  blocked,
  organizationId,
}: {
  invoices: VendorInvoice[];
  loading: boolean;
  error: string;
  blocked: boolean;
  organizationId: string;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return <div className="space-y-4">
    {error && <p role="alert" className="rounded-lg border border-rose-900/50 bg-rose-950/20 p-4 text-sm text-rose-200">{error}</p>}
    {blocked ? <WorkspaceSetupNotice /> : loading ? (
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
      <ul className="space-y-3">
        {invoices.map((invoice) => (
          <InvoiceReviewRow
            key={invoice.document_id}
            invoice={invoice}
            expanded={expandedId === invoice.document_id}
            onToggle={() => setExpandedId((current) => current === invoice.document_id ? null : invoice.document_id)}
            organizationId={organizationId}
          />
        ))}
      </ul>
    ) : null}
  </div>;
}
