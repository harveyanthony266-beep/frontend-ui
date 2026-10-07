export type Invoice = {
  id: string;
  vendor: string;
  date: string;
  amount: number;
  status: 'Processed' | 'Review' | 'Failed';
  items: { description: string; quantity: number; price: number }[];
  raw: Record<string, unknown>;
};

export type ProcessedDocument = {
  key: string;
  filename: string;
  id: string | number;
  created_at?: string;
  vendor_name: string;
  invoice_date: string;
  invoice_number: string | number;
  total_amount: number;
  line_items: { description: string; amount: number; [key: string]: unknown }[];
  status: string;
  organization_id?: string | number;
  processed_at?: string;
  optional_fields: Record<string, unknown>;
};

export type InvoiceDocument = {
  id: string;
  created_at?: string | null;
  vendor_name: string | null;
  document_type?: string | null;
  document_number?: string | null;
  document_date?: string | null;
  due_date?: string | null;
  invoice_date?: string | null;
  invoice_number?: string | null;
  total_amount: number | null;
  currency: string | null;
  status: 'processed' | 'needs_review' | 'approved' | 'failed' | 'duplicate' | string;
  review_reasons?: string[] | null;
  original_filename?: string | null;
  line_items?: { description: string; amount: number | null; [key: string]: unknown }[] | null;
};
