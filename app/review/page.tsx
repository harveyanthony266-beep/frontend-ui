'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { InvoiceReviewList } from '@/components/invoice-review/invoice-review-list';
import { useWorkspace } from '@/components/workspace-provider';
import { USE_INVOICE_REVIEW_MOCK, fetchInvoiceReviews } from '@/lib/invoice-review/load';
import { removeUploadedReviews, replaceUploadedReview, useUploadedReviews } from '@/lib/invoice-review/session';
import type { VendorInvoice } from '@/lib/invoice-review/types';

function mergeReviews(fetched: VendorInvoice[], uploaded: VendorInvoice[]) {
  const ids = new Set(fetched.map((invoice) => invoice.document_id));
  return [...uploaded.filter((invoice) => !ids.has(invoice.document_id)), ...fetched];
}

export default function InvoiceReviewPage() {
  const { organizationId, status: workspaceStatus } = useWorkspace();
  const ready = workspaceStatus === 'ready' && Boolean(organizationId);
  const [invoices, setInvoices] = useState<VendorInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const uploaded = useUploadedReviews(organizationId);
  const visible = useMemo(() => mergeReviews(invoices, uploaded), [invoices, uploaded]);
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
      invoices={visible}
      loading={loading}
      error={error}
      blocked={blocked}
      organizationId={organizationId}
      onRemove={(ids) => {
        const removed = new Set(ids);
        setInvoices((current) => current.filter((invoice) => !removed.has(invoice.document_id)));
        removeUploadedReviews(organizationId, ids);
      }}
      onUpdated={(invoice) => {
        setInvoices((current) => current.map((item) => item.document_id === invoice.document_id ? invoice : item));
        replaceUploadedReview(organizationId, invoice);
      }}
    />
  </div>;
}
