import sampleInvoices from '@/lib/invoice-review/invoice-review.mock.json';
import { parseInvoiceReviews } from '@/lib/invoice-review/parse';
import type { VendorInvoice } from '@/lib/invoice-review/types';

/**
 * The review screen reads sample invoices until this flag is turned off.
 *
 * To use the backend response:
 * 1. Set USE_INVOICE_REVIEW_MOCK to false.
 * 2. The screen then calls GET /api/backend/invoices with the x-organization-id
 *    header. The BFF allowlists that path and attaches the organization API key
 *    on the server. The body may be one invoice, an array, or { data: [...] }
 *    using the same field names as invoice-review.mock.json.
 * 3. Approve calls POST /api/backend/documents/:document_id/approve.
 *    Reject and inline edits stay in this review session. Persist an edit with
 *    PATCH /api/backend/documents/:document_id once that payload is defined.
 *    Excel and CSV are built in the browser from the reviewed invoice, and
 *    only after Approve.
 */
export const USE_INVOICE_REVIEW_MOCK = true;

async function readError(response: Response) {
  try {
    const result = await response.json();
    return typeof result.message === 'string' ? result.message : 'Could not load invoices.';
  } catch {
    return 'Could not load invoices.';
  }
}

export async function fetchInvoiceReviews(organizationId: string): Promise<VendorInvoice[]> {
  if (USE_INVOICE_REVIEW_MOCK) {
    return parseInvoiceReviews(sampleInvoices);
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
