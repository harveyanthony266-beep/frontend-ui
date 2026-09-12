export type Invoice = { id:string; vendor:string; date:string; amount:number; status:'Processed'|'Review'|'Failed'; items:{description:string; quantity:number; price:number}[]; raw:Record<string, unknown> };
export const mockInvoices: Invoice[] = [
 {id:'INV-2409-001',vendor:'Northstar Logistics',date:'Sep 11, 2026',amount:8420.5,status:'Processed',items:[{description:'Freight services',quantity:1,price:8420.5}],raw:{invoice_number:'INV-2409-001',currency:'USD'}},
 {id:'INV-2409-002',vendor:'Greenfield Supply Co.',date:'Sep 10, 2026',amount:1299,status:'Review',items:[{description:'Industrial supplies',quantity:3,price:433}],raw:{invoice_number:'INV-2409-002',currency:'USD'}},
 {id:'INV-2409-003',vendor:'Apex Cloud Systems',date:'Sep 09, 2026',amount:3240,status:'Processed',items:[{description:'Cloud platform',quantity:1,price:3240}],raw:{invoice_number:'INV-2409-003',currency:'USD'}},
 {id:'INV-2409-004',vendor:'Lumen Office Group',date:'Sep 08, 2026',amount:688.25,status:'Failed',items:[{description:'Office equipment',quantity:2,price:344.125}],raw:{invoice_number:'INV-2409-004',currency:'USD'}}
];
const API_BASE = 'https://ghost-business.onrender.com';

export async function fetchInvoices(): Promise<{ invoices: Invoice[]; mocked: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/invoices`, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
    if (!res.ok) throw new Error(`API returned ${res.status}`);
    const data: unknown = await res.json();
    const records = Array.isArray(data) ? data : (typeof data === 'object' && data !== null && Array.isArray((data as { invoices?: unknown }).invoices) ? (data as { invoices: unknown[] }).invoices : []);
    const invoices = records.map((record, index) => {
      const item = typeof record === 'object' && record !== null ? record as Record<string, unknown> : {};
      return {
        ...mockInvoices[index % mockInvoices.length],
        id: String(item.invoice_number ?? item.id ?? `INV-LIVE-${index + 1}`),
        vendor: String(item.vendor ?? item.supplier ?? 'Unknown vendor'),
        amount: Number(item.total ?? item.amount ?? 0),
        raw: item,
      };
    });
    return { invoices, mocked: false };
  } catch (error) {
    return { invoices: mockInvoices, mocked: true, error: error instanceof Error ? error.message : 'Invoice API unavailable' };
  }
}

export async function checkBackend(): Promise<boolean> {
  try {
    const res = await fetch(API_BASE, { method: 'HEAD', signal: AbortSignal.timeout(5000), cache: 'no-store' });
    return res.status < 500;
  } catch {
    return false;
  }
}

export async function processInvoice(file: File): Promise<{invoice: Invoice; mocked: boolean}> { const body = new FormData(); body.append('file', file); try { const res = await fetch('https://ghost-business.onrender.com/webhooks/process-invoice',{method:'POST',body,signal:AbortSignal.timeout(12000)}); if (!res.ok) throw new Error(`API returned ${res.status}`); const data: unknown = await res.json(); const record = (typeof data === 'object' && data !== null) ? data as Record<string, unknown> : {}; return { invoice: { ...mockInvoices[0], id:String(record.invoice_number ?? 'INV-LIVE'), vendor:String(record.vendor ?? file.name.replace(/\.pdf$/i,'')), amount:Number(record.total ?? 0), raw:record }, mocked:false }; } catch { return { invoice: {...mockInvoices[0], id:`MOCK-${Date.now()}`, vendor:file.name.replace(/\.pdf$/i,''), date:'Just now'}, mocked:true }; } }
