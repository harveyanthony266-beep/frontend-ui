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

export const mockInvoices: Invoice[] = [
  { id: 'INV-2409-001', vendor: 'Northstar Logistics', date: 'Sep 11, 2026', amount: 8420.5, status: 'Processed', items: [{ description: 'Freight services', quantity: 1, price: 8420.5 }], raw: { invoice_number: 'INV-2409-001', currency: 'USD' } },
  { id: 'INV-2409-002', vendor: 'Greenfield Supply Co.', date: 'Sep 10, 2026', amount: 1299, status: 'Review', items: [{ description: 'Industrial supplies', quantity: 3, price: 433 }], raw: { invoice_number: 'INV-2409-002', currency: 'USD' } },
  { id: 'INV-2409-003', vendor: 'Apex Cloud Systems', date: 'Sep 09, 2026', amount: 3240, status: 'Processed', items: [{ description: 'Cloud platform', quantity: 1, price: 3240 }], raw: { invoice_number: 'INV-2409-003', currency: 'USD' } },
  { id: 'INV-2409-004', vendor: 'Lumen Office Group', date: 'Sep 08, 2026', amount: 688.25, status: 'Failed', items: [{ description: 'Office equipment', quantity: 2, price: 344.125 }], raw: { invoice_number: 'INV-2409-004', currency: 'USD' } },
];

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://ghost-business.onrender.com';

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function checkBackend(): Promise<boolean> {
  try {
    const response = await fetch(API_BASE, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });
    return response.status < 500;
  } catch {
    return false;
  }
}

async function requireSuccessfulResponse(response: Response): Promise<Response> {
  if (!response.ok) {
    throw new ApiError(response.status, `The backend returned ${response.status}.`);
  }
  return response;
}

export async function fetchInvoices(): Promise<{ invoices: Invoice[]; error?: string; status?: number }> {
  try {
    const response = await requireSuccessfulResponse(await fetch(`${API_BASE}/invoices`, {
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    }));
    const data: unknown = await response.json();
    const records = Array.isArray(data)
      ? data
      : typeof data === 'object' && data !== null && Array.isArray((data as { invoices?: unknown }).invoices)
        ? (data as { invoices: unknown[] }).invoices
        : [];

    return {
      invoices: records.map((record, index) => {
        const item = typeof record === 'object' && record !== null ? record as Record<string, unknown> : {};
        return {
          ...mockInvoices[index % mockInvoices.length],
          id: String(item.invoice_number ?? item.id ?? `INV-LIVE-${index + 1}`),
          vendor: String(item.vendor ?? item.supplier ?? 'Unknown vendor'),
          amount: Number(item.total ?? item.amount ?? 0),
          raw: item,
        };
      }),
    };
  } catch (error) {
    return {
      invoices: [],
      error: error instanceof Error ? error.message : 'Unable to load invoices.',
      status: error instanceof ApiError ? error.status : undefined,
    };
  }
}

export async function processInvoice(files: File[]): Promise<ProcessedDocument[]> {
  const body = new FormData();
  files.forEach(file => body.append('file', file));
  const response = await fetch(`${API_BASE}/webhooks/process-invoice`, {
    method: 'POST',
    body,
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    let message = 'Unable to upload the selected files. Please try again.';
    if (response.status === 413 || response.status === 422) {
      const responseText = await response.text();
      try {
        const errorData: unknown = JSON.parse(responseText);
        if (typeof errorData === 'object' && errorData !== null && 'message' in errorData) {
          const backendMessage = (errorData as { message: unknown }).message;
          if (typeof backendMessage === 'string') message = backendMessage;
          else if (Array.isArray(backendMessage)) message = backendMessage.join(', ');
        } else if (responseText) {
          message = responseText;
        }
      } catch {
        if (responseText) message = responseText;
      }
    }
    throw new ApiError(response.status, message);
  }

  const data: unknown = await response.json();
  const records = Array.isArray(data)
    ? data
    : typeof data === 'object' && data !== null && Array.isArray((data as { invoices?: unknown }).invoices)
      ? (data as { invoices: unknown[] }).invoices
      : [data];

  const optionalInvoiceFields = ['po_number', 'subtotal', 'discount', 'freight', 'tax'];
  const optionalLineFields = ['quantity', 'unit_price'];
  return records.map((record, index) => {
    const item = typeof record === 'object' && record !== null ? record as Record<string, unknown> : {};
    const file = files[index] ?? files[0];
    const lineItems = Array.isArray(item.line_items) ? item.line_items : [];
    const optionalFields: Record<string, unknown> = {};
    optionalInvoiceFields.forEach(field => {
      if (Object.prototype.hasOwnProperty.call(item, field)) optionalFields[field] = item[field];
    });
    const processedLineItems: ProcessedDocument['line_items'] = lineItems.map(line => {
      const source = typeof line === 'object' && line !== null ? line as Record<string, unknown> : {};
      const processedLine: ProcessedDocument['line_items'][number] = {
        description: String(source.description ?? ''),
        amount: typeof source.amount === 'number' ? source.amount : Number(source.amount ?? 0),
      };
      optionalLineFields.forEach(field => {
        if (Object.prototype.hasOwnProperty.call(source, field)) processedLine[field] = source[field];
      });
      return processedLine;
    });

    return {
      key: `${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
      filename: file?.name ?? 'Uploaded document',
      id: typeof item.id === 'string' || typeof item.id === 'number' ? item.id : 'unknown',
      created_at: typeof item.created_at === 'string' ? item.created_at : undefined,
      vendor_name: String(item.vendor_name ?? ''),
      invoice_date: String(item.invoice_date ?? ''),
      invoice_number: typeof item.invoice_number === 'string' || typeof item.invoice_number === 'number' ? item.invoice_number : '',
      total_amount: typeof item.total_amount === 'number' ? item.total_amount : Number(item.total_amount ?? 0),
      line_items: processedLineItems,
      status: String(item.status ?? ''),
      organization_id: typeof item.organization_id === 'string' || typeof item.organization_id === 'number' ? item.organization_id : undefined,
      processed_at: typeof item.processed_at === 'string' ? item.processed_at : undefined,
      optional_fields: optionalFields,
    };
  });
}
