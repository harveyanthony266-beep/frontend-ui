export type Invoice = {
  id: string;
  vendor: string;
  date: string;
  amount: number;
  status: 'Processed' | 'Review' | 'Failed';
  items: { description: string; quantity: number; price: number }[];
  raw: Record<string, unknown>;
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

export async function processInvoice(file: File): Promise<Invoice> {
  const body = new FormData();
  body.append('file', file);
  const response = await requireSuccessfulResponse(await fetch(`${API_BASE}/webhooks/process-invoice`, {
    method: 'POST',
    body,
    signal: AbortSignal.timeout(12000),
  }));
  const data: unknown = await response.json();
  const record = typeof data === 'object' && data !== null ? data as Record<string, unknown> : {};

  return {
    ...mockInvoices[0],
    id: String(record.invoice_number ?? 'INV-LIVE'),
    vendor: String(record.vendor ?? file.name.replace(/\.pdf$/i, '')),
    amount: Number(record.total ?? 0),
    raw: record,
  };
}
