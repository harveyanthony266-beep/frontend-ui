import type {
  FieldMeta,
  InvoiceExtractionError,
  InvoiceLineItem,
  InvoiceReviewStatus,
  LineItemCategory,
  VendorInvoice,
} from '@/lib/invoice-review/types';

const STATUSES: InvoiceReviewStatus[] = ['needs_review', 'approved', 'rejected', 'failed', 'processing'];
const CATEGORIES: LineItemCategory[] = ['labor', 'parts', 'fee', 'other'];

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} is missing from the invoice response.`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, label: string) {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  throw new Error(`${label} must be text.`);
}

function asNumber(value: unknown, label: string) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  if (value == null || value === '') return 0;
  throw new Error(`${label} must be a number.`);
}

function parseFieldMeta(value: unknown): Record<string, FieldMeta> {
  const record = asRecord(value, 'field_meta');
  const meta: Record<string, FieldMeta> = {};
  for (const [path, entry] of Object.entries(record)) {
    const item = asRecord(entry, `field_meta.${path}`);
    if (typeof item.needs_review !== 'boolean') {
      throw new Error(`field_meta.${path}.needs_review must be true or false.`);
    }
    meta[path] = {
      confidence: asNumber(item.confidence, `field_meta.${path}.confidence`),
      source_page: asNumber(item.source_page, `field_meta.${path}.source_page`),
      needs_review: item.needs_review,
    };
  }
  return meta;
}

function parseLineItem(value: unknown, index: number): InvoiceLineItem {
  const item = asRecord(value, `line_items[${index}]`);
  const category = item.category;
  if (typeof category !== 'string' || !CATEGORIES.includes(category as LineItemCategory)) {
    throw new Error(`line_items[${index}].category must be labor, parts, fee, or other.`);
  }
  return {
    description: asString(item.description, `line_items[${index}].description`),
    quantity: asNumber(item.quantity, `line_items[${index}].quantity`),
    unit_price: asNumber(item.unit_price, `line_items[${index}].unit_price`),
    amount: asNumber(item.amount, `line_items[${index}].amount`),
    category: category as LineItemCategory,
  };
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

export function normalizeInvoiceRecord(value: unknown) {
  const record = asRecord(value, 'Invoice');
  const normalized = { ...record };
  if (typeof normalized.document_id !== 'string' && typeof normalized.id === 'string') {
    normalized.document_id = normalized.id;
  }
  if (typeof normalized.source_file !== 'string') {
    const filename = normalized.original_filename ?? normalized.filename;
    if (typeof filename === 'string') normalized.source_file = filename;
  }
  return normalized;
}

function parseError(value: unknown): InvoiceExtractionError | null {
  if (typeof value === 'string' && value.trim()) return { message: value };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const message = textValue(record.message);
  const reason = textValue(record.reason);
  const retryable = typeof record.retryable === 'boolean' ? record.retryable : undefined;
  if (!message && !reason && retryable === undefined) return null;
  return {
    message,
    ...(reason ? { reason } : {}),
    ...(retryable === undefined ? {} : { retryable }),
  };
}

function parsePartialInvoice(record: Record<string, unknown>, status: 'failed' | 'processing'): VendorInvoice {
  const vendor = asRecord(record.vendor ?? {}, 'vendor');
  const billTo = asRecord(record.bill_to ?? {}, 'bill_to');
  const invoice = asRecord(record.invoice ?? {}, 'invoice');
  const property = asRecord(record.property ?? {}, 'property');
  const totals = asRecord(record.totals ?? {}, 'totals');
  const remitTo = asRecord(record.remit_to ?? {}, 'remit_to');
  const validation = asRecord(record.validation ?? { checks: [] }, 'validation');
  const checks = Array.isArray(validation.checks) ? validation.checks : [];
  const lineItems = Array.isArray(record.line_items) ? record.line_items : [];
  const documentId = textValue(record.document_id);
  if (!documentId) throw new Error('document_id is missing from the invoice response.');
  return {
    document_id: documentId,
    document_type: 'vendor_invoice',
    source_file: textValue(record.source_file),
    page_count: asNumber(record.page_count, 'page_count'),
    processed_at: textValue(record.processed_at),
    status,
    processing: record.processing === true || status === 'processing',
    error: parseError(record.error),
    vendor: {
      name: textValue(vendor.name),
      address: textValue(vendor.address),
      phone: textValue(vendor.phone),
      email: textValue(vendor.email),
    },
    bill_to: {
      name: textValue(billTo.name),
      attention: textValue(billTo.attention),
      address: textValue(billTo.address),
    },
    invoice: {
      number: textValue(invoice.number),
      invoice_date: textValue(invoice.invoice_date),
      due_date: textValue(invoice.due_date),
      terms: textValue(invoice.terms),
      work_order_number: textValue(invoice.work_order_number),
      po_number: textValue(invoice.po_number),
      service_date: textValue(invoice.service_date),
    },
    property: {
      name: textValue(property.name),
      address: textValue(property.address),
      unit: textValue(property.unit),
    },
    work_description: textValue(record.work_description),
    line_items: lineItems.map((item, itemIndex) => parseLineItem(item, itemIndex)),
    totals: {
      currency: textValue(totals.currency) || 'USD',
      subtotal: asNumber(totals.subtotal, 'totals.subtotal'),
      tax_description: textValue(totals.tax_description),
      tax_amount: asNumber(totals.tax_amount, 'totals.tax_amount'),
      total_due: asNumber(totals.total_due, 'totals.total_due'),
    },
    remit_to: {
      name: textValue(remitTo.name),
      address: textValue(remitTo.address),
      payment_notes: textValue(remitTo.payment_notes),
    },
    late_fee_terms: textValue(record.late_fee_terms),
    validation: {
      checks: checks.map((check, checkIndex) => {
        const item = asRecord(check, `validation.checks[${checkIndex}]`);
        return {
          name: textValue(item.name),
          passed: item.passed === true,
          message: textValue(item.message),
        };
      }),
    },
    field_meta: record.field_meta ? parseFieldMeta(record.field_meta) : {},
  };
}

function nestedRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function mapStatus(value: unknown): InvoiceReviewStatus {
  if (typeof value === 'string' && STATUSES.includes(value as InvoiceReviewStatus)) {
    return value as InvoiceReviewStatus;
  }
  return 'needs_review';
}

function looseLineItem(value: unknown): InvoiceLineItem {
  const item = nestedRecord(value);
  const category = typeof item.category === 'string' && CATEGORIES.includes(item.category as LineItemCategory)
    ? item.category as LineItemCategory
    : 'other';
  const amount = asNumber(item.amount, 'amount');
  return {
    description: textValue(item.description),
    quantity: asNumber(item.quantity ?? 1, 'quantity'),
    unit_price: asNumber(item.unit_price ?? item.price ?? amount, 'unit_price'),
    amount,
    category,
  };
}

function safeFieldMeta(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  try {
    return parseFieldMeta(value);
  } catch {
    return {};
  }
}

function looseInvoice(record: Record<string, unknown>): VendorInvoice {
  const status = mapStatus(record.status);
  const vendor = nestedRecord(record.vendor);
  const billTo = nestedRecord(record.bill_to);
  const invoice = nestedRecord(record.invoice);
  const property = nestedRecord(record.property);
  const totals = nestedRecord(record.totals);
  const remitTo = nestedRecord(record.remit_to);
  const validation = nestedRecord(record.validation);
  const checks = Array.isArray(validation.checks) ? validation.checks : [];
  const reasons = Array.isArray(record.review_reasons)
    ? record.review_reasons.filter((reason): reason is string => typeof reason === 'string').join('; ')
    : '';
  const error = parseError(record.error) ?? (status === 'failed' && reasons ? { message: reasons, retryable: true } : null);
  const documentId = textValue(record.document_id);
  if (!documentId) throw new Error('document_id is missing from the invoice response.');
  return {
    document_id: documentId,
    document_type: 'vendor_invoice',
    source_file: textValue(record.source_file),
    page_count: asNumber(record.page_count, 'page_count'),
    processed_at: textValue(record.processed_at) || textValue(record.created_at),
    status,
    processing: record.processing === true || status === 'processing',
    error,
    vendor: {
      name: textValue(vendor.name) || textValue(record.vendor_name),
      address: textValue(vendor.address),
      phone: textValue(vendor.phone),
      email: textValue(vendor.email),
    },
    bill_to: {
      name: textValue(billTo.name),
      attention: textValue(billTo.attention),
      address: textValue(billTo.address),
    },
    invoice: {
      number: textValue(invoice.number) || textValue(record.invoice_number) || textValue(record.document_number),
      invoice_date: textValue(invoice.invoice_date) || textValue(record.invoice_date) || textValue(record.document_date),
      due_date: textValue(invoice.due_date) || textValue(record.due_date),
      terms: textValue(invoice.terms),
      work_order_number: textValue(invoice.work_order_number),
      po_number: textValue(invoice.po_number),
      service_date: textValue(invoice.service_date),
    },
    property: {
      name: textValue(property.name),
      address: textValue(property.address),
      unit: textValue(property.unit),
    },
    work_description: textValue(record.work_description),
    line_items: Array.isArray(record.line_items) ? record.line_items.map((item) => looseLineItem(item)) : [],
    totals: {
      currency: textValue(totals.currency) || textValue(record.currency) || 'USD',
      subtotal: asNumber(totals.subtotal, 'subtotal'),
      tax_description: textValue(totals.tax_description),
      tax_amount: asNumber(totals.tax_amount, 'tax_amount'),
      total_due: asNumber(totals.total_due ?? record.total_amount, 'total_due'),
    },
    remit_to: {
      name: textValue(remitTo.name),
      address: textValue(remitTo.address),
      payment_notes: textValue(remitTo.payment_notes),
    },
    late_fee_terms: textValue(record.late_fee_terms),
    validation: {
      checks: checks.map((check) => {
        const item = nestedRecord(check);
        return {
          name: textValue(item.name),
          passed: item.passed === true,
          message: textValue(item.message),
        };
      }),
    },
    field_meta: safeFieldMeta(record.field_meta),
  };
}

function parseKnownInvoice(value: unknown, index = 0): VendorInvoice {
  const record = normalizeInvoiceRecord(value);
  const status = record.status;
  if (typeof status !== 'string' || !STATUSES.includes(status as InvoiceReviewStatus)) {
    throw new Error('Invoice status must be needs_review, approved, rejected, failed, or processing.');
  }
  if (status === 'failed' || status === 'processing') {
    return parsePartialInvoice(record, status);
  }
  const vendor = asRecord(record.vendor, 'vendor');
  const billTo = asRecord(record.bill_to, 'bill_to');
  const invoice = asRecord(record.invoice, 'invoice');
  const property = asRecord(record.property, 'property');
  const totals = asRecord(record.totals, 'totals');
  const remitTo = asRecord(record.remit_to, 'remit_to');
  const validation = asRecord(record.validation, 'validation');
  if (!Array.isArray(record.line_items)) {
    throw new Error('line_items is missing from the invoice response.');
  }
  if (!Array.isArray(validation.checks)) {
    throw new Error('validation.checks is missing from the invoice response.');
  }

  return {
    document_id: asString(record.document_id, 'document_id'),
    document_type: 'vendor_invoice',
    source_file: asString(record.source_file, 'source_file'),
    page_count: asNumber(record.page_count, 'page_count'),
    processed_at: asString(record.processed_at, 'processed_at'),
    status: status as InvoiceReviewStatus,
    processing: record.processing === true,
    error: parseError(record.error),
    vendor: {
      name: asString(vendor.name, 'vendor.name'),
      address: asString(vendor.address, 'vendor.address'),
      phone: asString(vendor.phone, 'vendor.phone'),
      email: asString(vendor.email, 'vendor.email'),
    },
    bill_to: {
      name: asString(billTo.name, 'bill_to.name'),
      attention: asString(billTo.attention, 'bill_to.attention'),
      address: asString(billTo.address, 'bill_to.address'),
    },
    invoice: {
      number: asString(invoice.number, 'invoice.number'),
      invoice_date: asString(invoice.invoice_date, 'invoice.invoice_date'),
      due_date: asString(invoice.due_date, 'invoice.due_date'),
      terms: asString(invoice.terms, 'invoice.terms'),
      work_order_number: asString(invoice.work_order_number, 'invoice.work_order_number'),
      po_number: asString(invoice.po_number, 'invoice.po_number'),
      service_date: asString(invoice.service_date, 'invoice.service_date'),
    },
    property: {
      name: asString(property.name, 'property.name'),
      address: asString(property.address, 'property.address'),
      unit: asString(property.unit, 'property.unit'),
    },
    work_description: asString(record.work_description, 'work_description'),
    line_items: record.line_items.map((item, itemIndex) => parseLineItem(item, itemIndex)),
    totals: {
      currency: asString(totals.currency, 'totals.currency') || 'USD',
      subtotal: asNumber(totals.subtotal, 'totals.subtotal'),
      tax_description: asString(totals.tax_description, 'totals.tax_description'),
      tax_amount: asNumber(totals.tax_amount, 'totals.tax_amount'),
      total_due: asNumber(totals.total_due, 'totals.total_due'),
    },
    remit_to: {
      name: asString(remitTo.name, 'remit_to.name'),
      address: asString(remitTo.address, 'remit_to.address'),
      payment_notes: asString(remitTo.payment_notes, 'remit_to.payment_notes'),
    },
    late_fee_terms: asString(record.late_fee_terms, 'late_fee_terms'),
    validation: {
      checks: validation.checks.map((check, checkIndex) => {
        const item = asRecord(check, `validation.checks[${checkIndex}]`);
        if (typeof item.passed !== 'boolean') {
          throw new Error(`validation.checks[${checkIndex}].passed must be true or false.`);
        }
        return {
          name: asString(item.name, `validation.checks[${checkIndex}].name`),
          passed: item.passed,
          message: asString(item.message, `validation.checks[${checkIndex}].message`),
        };
      }),
    },
    field_meta: parseFieldMeta(record.field_meta),
  };
}

export function parseInvoiceReview(value: unknown, index = 0): VendorInvoice {
  try {
    return parseKnownInvoice(value, index);
  } catch (error) {
    if (!value || typeof value !== 'object') throw error;
    return looseInvoice(normalizeInvoiceRecord(value));
  }
}

export function parseInvoiceReviews(payload: unknown): VendorInvoice[] {
  if (Array.isArray(payload)) {
    return payload.map((item, index) => parseInvoiceReview(item, index));
  }
  if (payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown }).data)) {
    return (payload as { data: unknown[] }).data.map((item, index) => parseInvoiceReview(item, index));
  }
  if (payload && typeof payload === 'object' && ('document_id' in payload || 'id' in payload)) {
    return [parseInvoiceReview(payload)];
  }
  throw new Error('The invoice response was not a list of invoices.');
}
