import { applyRetryResponse, parseDeleteResult, type DeleteResult } from '@/lib/invoice-review/actions';
import { parseInvoiceReviews } from '@/lib/invoice-review/parse';
import type { VendorInvoice } from '@/lib/invoice-review/types';

/**
 * The review list loads GET /api/backend/invoices. Set this to true only to
 * read invoice-review.mock.json instead of that response.
 *
 * Retry calls POST /api/backend/documents/:document_id/retry.
 * One delete calls DELETE /api/backend/documents/:document_id.
 * Bulk delete calls DELETE /api/backend/documents with { ids }.
 * Approve calls POST /api/backend/documents/:document_id/approve.
 * The browser sends x-organization-id. The BFF attaches the organization API key.
 */
export const USE_INVOICE_REVIEW_MOCK = false;

async function readError(response: Response, fallback = 'Could not load invoices.') {
  try {
    const result = await response.json();
    return typeof result.message === 'string' ? result.message : fallback;
  } catch {
    return fallback;
  }
}

export async function fetchInvoiceReviews(organizationId: string): Promise<VendorInvoice[]> {
  if (USE_INVOICE_REVIEW_MOCK) {
    const sample = await import('@/lib/invoice-review/invoice-review.mock.json');
    return parseInvoiceReviews(sample.default);
  }
  const response = await fetch('/api/backend/invoices', {
    headers: { 'x-organization-id': organizationId },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(await readError(response));
  return parseInvoiceReviews(await response.json());
}

export async function approveInvoiceReview(organizationId: string, documentId: string) {
  if (USE_INVOICE_REVIEW_MOCK) return;
  const response = await fetch(`/api/backend/documents/${encodeURIComponent(documentId)}/approve`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-organization-id': organizationId,
    },
    body: '{}',
  });
  if (!response.ok) throw new Error(await readError(response));
}

export async function retryInvoiceReview(organizationId: string, invoice: VendorInvoice) {
  const response = await fetch(`/api/backend/documents/${encodeURIComponent(invoice.document_id)}/retry`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-organization-id': organizationId,
    },
    body: '{}',
  });
  if (!response.ok) throw new Error(await readError(response));
  return applyRetryResponse(invoice, await response.json());
}

export async function deleteInvoiceReviews(organizationId: string, ids: string[]): Promise<DeleteResult> {
  const single = ids.length === 1;
  const response = await fetch(
    single ? `/api/backend/documents/${encodeURIComponent(ids[0] ?? '')}` : '/api/backend/documents',
    {
      method: 'DELETE',
      headers: {
        ...(single ? {} : { 'content-type': 'application/json' }),
        'x-organization-id': organizationId,
      },
      body: single ? undefined : JSON.stringify({ ids }),
    },
  );
  if (!response.ok) {
    const message = await readError(response, 'Could not delete this invoice review.');
    return { deletedIds: [], failed: ids.map((id) => ({ id, message })) };
  }
  const body = await response.text();
  if (!body) return { deletedIds: ids, failed: [] };
  try {
    return parseDeleteResult(ids, JSON.parse(body), 'Could not delete this invoice review.');
  } catch {
    return { deletedIds: ids, failed: [] };
  }
}
