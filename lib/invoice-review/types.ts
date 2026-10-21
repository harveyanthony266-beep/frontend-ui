export type InvoiceReviewStatus = 'needs_review' | 'approved' | 'rejected';

export type LineItemCategory = 'labor' | 'parts' | 'fee' | 'other';

export type FieldMeta = {
  confidence: number;
  source_page: number;
  needs_review: boolean;
};

export type InvoiceLineItem = {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  category: LineItemCategory;
};

export type VendorInvoice = {
  document_id: string;
  document_type: 'vendor_invoice';
  source_file: string;
  page_count: number;
  processed_at: string;
  status: InvoiceReviewStatus;
  vendor: {
    name: string;
    address: string;
    phone: string;
    email: string;
  };
  bill_to: {
    name: string;
    attention: string;
    address: string;
  };
  invoice: {
    number: string;
    invoice_date: string;
    due_date: string;
    terms: string;
    work_order_number: string;
    po_number: string;
    service_date: string;
  };
  property: {
    name: string;
    address: string;
    unit: string;
  };
  work_description: string;
  line_items: InvoiceLineItem[];
  totals: {
    currency: string;
    subtotal: number;
    tax_description: string;
    tax_amount: number;
    total_due: number;
  };
  remit_to: {
    name: string;
    address: string;
    payment_notes: string;
  };
  late_fee_terms: string;
  validation: {
    checks: { name: string; passed: boolean; message: string }[];
  };
  field_meta: Record<string, FieldMeta>;
};
