import type {
  FieldMeta,
  InvoiceLineItem,
  InvoiceReviewStatus,
  LineItemCategory,
  VendorInvoice,
} from '@/lib/invoice-review/types';

const STATUSES: InvoiceReviewStatus[] = ['needs_review', 'approved', 'rejected'];
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

export function parseInvoiceReview(value: unknown, index = 0): VendorInvoice {
  const record = asRecord(value, `Invoice ${index + 1}`);
  const status = record.status;
  if (typeof status !== 'string' || !STATUSES.includes(status as InvoiceReviewStatus)) {
    throw new Error('Invoice status must be needs_review, approved, or rejected.');
  }
  if (record.document_type !== 'vendor_invoice') {
    throw new Error('Invoice document_type must be vendor_invoice.');
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

export function parseInvoiceReviews(payload: unknown): VendorInvoice[] {
  if (Array.isArray(payload)) {
    return payload.map((item, index) => parseInvoiceReview(item, index));
  }
  if (payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown }).data)) {
    return (payload as { data: unknown[] }).data.map((item, index) => parseInvoiceReview(item, index));
  }
  if (payload && typeof payload === 'object' && 'document_id' in payload) {
    return [parseInvoiceReview(payload)];
  }
  throw new Error('The invoice response was not a list of invoices.');
}
