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

export async function verifyApiKey(apiKey: string): Promise<string> {
  const response = await fetch(`${API_BASE}/me`, {
    headers: { 'x-api-key': apiKey },
    signal: AbortSignal.timeout(60000),
    cache: 'no-store',
  });
  if (response.status === 401) throw new ApiError(401, "That access key isn't valid. Check it and try again.");
  if (response.status === 429) throw new ApiError(429, 'Too many attempts, wait a minute and try again.');
  if (!response.ok) throw new ApiError(response.status, 'Unable to verify access key. Please try again.');
  const data: unknown = await response.json();
  if (typeof data !== 'object' || data === null || !('organization_name' in data) || typeof data.organization_name !== 'string') {
    throw new ApiError(response.status, 'The backend returned an invalid organization response.');
  }
  return data.organization_name;
}

export async function checkBackend(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/health`, {
      method: 'GET',
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

export async function fetchInvoices(organizationId = ''): Promise<{ invoices: Invoice[]; error?: string; status?: number }> {
  try {
    const query = new URLSearchParams();
    if (organizationId.trim()) query.set('organization_id', organizationId.trim());
    const url = `${API_BASE}/invoices${query.size ? `?${query.toString()}` : ''}`;
    const response = await requireSuccessfulResponse(await fetch(url, {
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

export async function processInvoice(file: File, apiKey: string, profile = ''): Promise<ProcessedDocument[]> {
  const body = new FormData();
  body.append('file', file);
  body.append('profile', profile);
  const response = await fetch(`${API_BASE}/webhooks/process-invoice`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Idempotency-Key': crypto.randomUUID(),
    },
    body,
    signal: AbortSignal.timeout(5 * 60 * 1000),
  });
  if (!response.ok) {
    throw await uploadError(response);
  }

  const responseData: unknown = await response.json();
  let envelope = typeof responseData === 'object' && responseData !== null
    ? responseData as Record<string, unknown>
    : {};
  if (typeof envelope.job_id === 'string' && envelope.data === undefined) {
    envelope = await pollInvoiceJob(envelope.job_id, apiKey);
  }
  if (envelope.success === false) {
    throw new ApiError(response.status, typeof envelope.message === 'string' ? envelope.message : 'The backend could not process this file.');
  }
  const data = Object.prototype.hasOwnProperty.call(envelope, 'data') ? envelope.data : responseData;
  const records = Array.isArray(data) ? data : data && typeof data === 'object' ? [data] : [];

  const optionalInvoiceFields = ['po_number', 'subtotal', 'discount', 'freight', 'tax'];
  const optionalLineFields = ['quantity', 'unit_price'];
  return records.map((record, index) => {
    const item = typeof record === 'object' && record !== null ? record as Record<string, unknown> : {};
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
      filename: file.name,
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

async function uploadError(response: Response): Promise<ApiError> {
  const defaults: Record<number, string> = {
    400: 'Unable to process this file. Please check it and try again.',
    401: "That access key isn't valid. Check it and try again.",
    413: 'File too large.',
    422: 'Unsupported or unreadable file.',
    429: 'Too many requests. Wait a minute and retry.',
  };
  let message = defaults[response.status] ?? 'Unable to upload this file. Please try again.';
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && 'message' in body) {
      const value = (body as { message: unknown }).message;
      if (typeof value === 'string' && value.trim()) message = value;
      else if (Array.isArray(value) && value.length) message = value.join(', ');
    }
  } catch {
    // Use the status-specific message when the backend response has no JSON body.
  }
  return new ApiError(response.status, message);
}

async function pollInvoiceJob(jobId: string, apiKey: string): Promise<Record<string, unknown>> {
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    const response = await fetch(`${API_BASE}/jobs/${encodeURIComponent(jobId)}`, {
      headers: { 'x-api-key': apiKey },
      cache: 'no-store',
    });
    if (!response.ok) throw await uploadError(response);
    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null) continue;
    const job = body as Record<string, unknown>;
    if (job.data !== undefined) return job;
    const status = String(job.status ?? '').toLowerCase();
    if (['done', 'complete', 'completed', 'success', 'succeeded'].includes(status)) {
      const data = job.result ?? job.output ?? job.documents;
      if (data !== undefined) return { data };
      throw new ApiError(response.status, 'The job completed without returning document data.');
    }
    if (['failed', 'error'].includes(status)) {
      throw new ApiError(response.status, typeof job.message === 'string' ? job.message : 'Document processing failed.');
    }
  }
  throw new ApiError(408, 'Document processing timed out. Please try again.');
}
