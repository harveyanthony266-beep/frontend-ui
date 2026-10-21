'use client';

import { useCallback, useEffect, useState } from 'react';
import { InvoiceReviewList } from '@/components/invoice-review/invoice-review-list';
import { useWorkspace } from '@/components/workspace-provider';
import { USE_INVOICE_REVIEW_MOCK, fetchInvoiceReviews } from '@/lib/invoice-review/load';
import type { VendorInvoice } from '@/lib/invoice-review/types';

export default function InvoiceReviewPage() {
  const { organizationId, status: workspaceStatus } = useWorkspace();
  const ready = workspaceStatus === 'ready' && Boolean(organizationId);
  const [invoices, setInvoices] = useState<VendorInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const blocked = !USE_INVOICE_REVIEW_MOCK && !ready && workspaceStatus !== 'loading' && workspaceStatus !== 'verifying';

  const load = useCallback(async () => {
    if (!USE_INVOICE_REVIEW_MOCK && (workspaceStatus === 'loading' || workspaceStatus === 'verifying')) {
      setLoading(true);
      return;
    }
    if (!USE_INVOICE_REVIEW_MOCK && !ready) {
      setInvoices([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      setInvoices(await fetchInvoiceReviews(organizationId));
    } catch (loadError) {
      setInvoices([]);
      setError(loadError instanceof Error ? loadError.message : 'Could not load invoices.');
    } finally {
      setLoading(false);
    }
  }, [organizationId, ready, workspaceStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  return <div className="mx-auto max-w-6xl space-y-7">
    <div>
      <p className="text-xs uppercase tracking-[.25em] text-mint">Review</p>
      <h1 className="mt-2 text-3xl font-semibold">Invoice review</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-400">
        Open an invoice to check the extracted fields, resolve anything flagged, then approve or reject it.
      </p>
      {USE_INVOICE_REVIEW_MOCK && (
        <p className="mt-2 text-xs text-slate-500">Showing sample invoices until the review API is connected.</p>
      )}
    </div>
    <InvoiceReviewList
      invoices={invoices}
      loading={loading}
      error={error}
      blocked={blocked}
      organizationId={organizationId}
    />
  </div>;
}
