import { parseInvoiceReview } from '@/lib/invoice-review/parse';
import type { VendorInvoice } from '@/lib/invoice-review/types';

export type DeleteFailure = {
  id: string;
  message: string;
};

export type DeleteResult = {
  deletedIds: string[];
  failed: DeleteFailure[];
};

export function isReviewProcessing(invoice: VendorInvoice) {
  return invoice.status === 'processing' || invoice.processing === true;
}

export function canExpandReview(invoice: VendorInvoice) {
  return invoice.status !== 'failed' && !isReviewProcessing(invoice);
}

export function reviewName(invoice: VendorInvoice) {
  if (invoice.status === 'failed' || isReviewProcessing(invoice)) {
    return invoice.source_file || 'Uploaded file';
  }
  const vendor = invoice.vendor.name || 'Unknown vendor';
  return invoice.invoice.number ? `${vendor} ${invoice.invoice.number}` : vendor;
}

export function deletionMessage(count: number) {
  return count === 1 ? '1 invoice review deleted.' : `${count} invoice reviews deleted.`;
}

export function singleDeleteCopy(invoice: VendorInvoice) {
  const subject = invoice.status === 'failed' || isReviewProcessing(invoice)
    ? invoice.source_file || 'this file'
    : `${invoice.vendor.name || 'this vendor'}${invoice.invoice.number ? `, invoice ${invoice.invoice.number}` : ''}`;
  return `Delete the review for ${subject}? The extracted data and the uploaded file will be permanently removed.`;
}

export function bulkDeleteCopy(count: number, approvedOnly = false) {
  const label = approvedOnly ? 'approved invoice review' : 'invoice review';
  const noun = count === 1 ? label : `${label}s`;
  return `Delete ${count} ${noun}? The extracted data and the uploaded files will be permanently removed.`;
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function applyRetryResponse(current: VendorInvoice, payload: unknown): VendorInvoice {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const retryable = typeof record.retryable === 'boolean' ? record.retryable : undefined;
  const reason = textValue(record.reason) || (retryable === false ? textValue(record.message) : '');
  const nested = record.document ?? record.data ?? (
    record.document_id || record.id || record.status ? record : null
  );
  let next = current;
  if (nested && typeof nested === 'object') {
    try {
      next = parseInvoiceReview(nested);
    } catch {
      next = current;
    }
  }
  if (retryable !== false) return next;
  const why = reason || next.error?.reason || 'This document cannot be retried.';
  return {
    ...next,
    error: {
      message: next.error?.message || current.error?.message || why,
      retryable: false,
      reason: why,
    },
  };
}

export function parseDeleteResult(ids: string[], payload: unknown, fallbackMessage: string): DeleteResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { deletedIds: ids, failed: [] };
  }
  const record = payload as Record<string, unknown>;
  const failedRaw = record.failed ?? record.failures ?? record.errors;
  if (!Array.isArray(failedRaw)) {
    const deleted = Array.isArray(record.deleted)
      ? record.deleted.filter((id): id is string => typeof id === 'string')
      : ids;
    return { deletedIds: deleted, failed: [] };
  }
  const failed = failedRaw.flatMap((item): DeleteFailure[] => {
    if (typeof item === 'string') return [{ id: item, message: fallbackMessage }];
    if (!item || typeof item !== 'object') return [];
    const entry = item as Record<string, unknown>;
    const id = textValue(entry.id) || textValue(entry.document_id);
    if (!id) return [];
    return [{ id, message: textValue(entry.message) || fallbackMessage }];
  });
  const failedIds = new Set(failed.map((item) => item.id));
  const deletedIds = Array.isArray(record.deleted)
    ? record.deleted.filter((id): id is string => typeof id === 'string' && !failedIds.has(id))
    : ids.filter((id) => !failedIds.has(id));
  return { deletedIds, failed };
}

const REVIEW_STATUSES = new Set(['needs_review', 'approved', 'rejected', 'failed', 'processing']);

function looksLikeInvoice(record: Record<string, unknown>) {
  const id = textValue(record.document_id) || textValue(record.id);
  if (!id) return false;
  return REVIEW_STATUSES.has(textValue(record.status))
    || 'invoice' in record
    || 'vendor' in record
    || 'error' in record
    || 'source_file' in record
    || 'original_filename' in record
    || 'vendor_name' in record;
}

function withReviewDefaults(record: Record<string, unknown>) {
  const status = textValue(record.status);
  return {
    document_type: 'vendor_invoice',
    page_count: 1,
    processed_at: '',
    vendor: { name: textValue(record.vendor_name), address: '', phone: '', email: '' },
    bill_to: { name: '', attention: '', address: '' },
    invoice: {
      number: textValue(record.invoice_number) || textValue(record.document_number),
      invoice_date: textValue(record.invoice_date) || textValue(record.document_date),
      due_date: textValue(record.due_date),
      terms: '',
      work_order_number: '',
      po_number: '',
      service_date: '',
    },
    property: { name: '', address: '', unit: '' },
    work_description: '',
    line_items: [],
    totals: {
      currency: textValue(record.currency) || 'USD',
      subtotal: 0,
      tax_description: '',
      tax_amount: 0,
      total_due: typeof record.total_amount === 'number' ? record.total_amount : 0,
    },
    remit_to: { name: '', address: '', payment_notes: '' },
    late_fee_terms: '',
    validation: { checks: [] },
    field_meta: {},
    ...record,
    status: REVIEW_STATUSES.has(status) ? status : 'needs_review',
    document_id: textValue(record.document_id) || textValue(record.id),
    source_file: textValue(record.source_file) || textValue(record.original_filename) || textValue(record.filename),
  };
}

function failedOutcome(record: Record<string, unknown>): VendorInvoice | null {
  const data = record.data && typeof record.data === 'object' && !Array.isArray(record.data)
    ? record.data as Record<string, unknown>
    : {};
  const id = textValue(record.document_id) || textValue(record.id) || textValue(data.document_id) || textValue(data.id);
  if (!id) return null;
  const error = data.error && typeof data.error === 'object' ? data.error as Record<string, unknown> : {};
  const message = textValue(record.message) || textValue(error.message) || 'Extraction failed.';
  try {
    return parseInvoiceReview({
      document_id: id,
      document_type: 'vendor_invoice',
      source_file: textValue(record.filename) || textValue(record.source_file) || textValue(data.source_file) || textValue(data.original_filename) || 'Uploaded file',
      status: 'failed',
      error: { message, retryable: typeof error.retryable === 'boolean' ? error.retryable : true },
    });
  } catch {
    return null;
  }
}

export function invoicesFromUploadResponse(payload: unknown): VendorInvoice[] {
  const found: VendorInvoice[] = [];
  const seen = new Set<string>();

  function add(invoice: VendorInvoice | null) {
    if (!invoice?.document_id || seen.has(invoice.document_id)) return;
    seen.add(invoice.document_id);
    found.push(invoice);
  }

  function visit(value: unknown) {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (record.data && record.data !== value) visit(record.data);
    if (Array.isArray(record.results)) visit(record.results);
    if (record.document && record.document !== value) visit(record.document);
    if (looksLikeInvoice(record)) {
      try {
        add(parseInvoiceReview(record));
      } catch {
        try {
          add(parseInvoiceReview(withReviewDefaults(record)));
        } catch {
          if (record.success === false || record.status === 'failed') add(failedOutcome(record));
        }
      }
      return;
    }
    if (record.success === false) add(failedOutcome(record));
  }

  visit(payload);
  return found;
}
