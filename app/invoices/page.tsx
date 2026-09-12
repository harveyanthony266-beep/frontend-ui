'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, FileJson, RefreshCw, Search, X } from 'lucide-react';
import { fetchInvoices, Invoice, mockInvoices } from '@/lib/api';

const PAGE_SIZE = 4;

function TableSkeleton() {
  return <div className="space-y-3 p-5" aria-label="Loading invoices">{[1, 2, 3, 4].map(row => <div key={row} className="h-12 animate-pulse rounded-lg bg-white/5" />)}</div>;
}

export default function Invoices() {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'date' | 'amount'>('date');
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>(mockInvoices);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState('');

  const loadInvoices = useCallback(async (refresh = false) => {
    setRefreshing(refresh);
    if (!refresh) setLoading(true);
    const result = await fetchInvoices();
    setInvoices(result.invoices);
    setNotice(result.error ? result.error : 'Archive synced with the processing backend.');
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { void loadInvoices(); }, [loadInvoices]);

  const filtered = useMemo(() => invoices.filter(invoice => `${invoice.vendor} ${invoice.id}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => sort === 'amount' ? b.amount - a.amount : b.date.localeCompare(a.date)), [invoices, q, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { if (page > pages) setPage(pages); }, [page, pages]);

  return <div className="space-y-7">
    <div><p className="text-xs uppercase tracking-[.25em] text-mint">Operations</p><h1 className="mt-2 text-3xl font-semibold">Invoice archive</h1><p className="mt-2 text-sm text-slate-400">Search, review and export every processed document.</p></div>
    {notice && <div role="alert" className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-xs ${notice.startsWith('The backend') || notice.startsWith('Unable') ? 'border-red-900/60 bg-red-950/20 text-red-200' : 'border-line bg-panel text-slate-400'}`}><span className={`h-2 w-2 rounded-full ${notice.startsWith('The backend') || notice.startsWith('Unable') ? 'bg-red-400' : 'bg-emerald'}`} />{notice}<button onClick={() => setNotice('')} className="ml-auto text-slate-500 hover:text-white" aria-label="Dismiss status"><X size={15} /></button></div>}
    <div className="flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><input value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder="Search vendor or invoice ID..." className="w-full rounded-lg border border-line bg-panel py-2.5 pl-10 pr-3 text-sm outline-none focus:border-emerald" /></div><label className="flex items-center gap-2 rounded-lg border border-line bg-panel px-3 text-sm text-slate-400">Sort by <select value={sort} onChange={e => { setSort(e.target.value as 'date' | 'amount'); setPage(1); }} className="bg-transparent py-2 text-slate-200 outline-none"><option value="date">Recent</option><option value="amount">Amount</option></select><ChevronDown size={14} /></label><button onClick={() => void loadInvoices(true)} disabled={refreshing} className="inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-panel px-4 py-2 text-sm text-slate-300 hover:bg-white/5 disabled:opacity-50" aria-label="Refresh invoice archive"><RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} /> Refresh</button></div>
    <div className="overflow-hidden rounded-xl border border-line bg-panel"><div className="hidden grid-cols-[1.4fr_1fr_1fr_1fr_auto] gap-4 border-b border-line px-5 py-3 text-[11px] uppercase tracking-wider text-slate-500 md:grid"><span>Invoice</span><span>Vendor</span><span>Date</span><span>Amount</span><span /></div>{loading ? <TableSkeleton /> : visible.map(invoice => <button key={invoice.id} onClick={() => setSelected(invoice)} className="grid w-full gap-2 border-b border-line px-5 py-4 text-left transition last:border-0 hover:bg-white/[.03] md:grid-cols-[1.4fr_1fr_1fr_1fr_auto] md:items-center md:gap-4"><div><div className="text-sm text-slate-200">{invoice.id}</div><div className="mt-1 text-xs text-slate-500 md:hidden">{invoice.vendor} · {invoice.date}</div></div><div className="hidden text-sm text-slate-300 md:block">{invoice.vendor}</div><div className="hidden text-sm text-slate-400 md:block">{invoice.date}</div><div className="flex items-center justify-between"><span className="text-sm">${invoice.amount.toLocaleString()}</span><span className={`rounded-full px-2 py-1 text-[10px] ${invoice.status === 'Processed' ? 'bg-emerald/10 text-emerald' : invoice.status === 'Review' ? 'bg-amber-400/10 text-amber-300' : 'bg-red-400/10 text-red-300'}`}>{invoice.status}</span></div><span className="hidden text-slate-600 md:block">›</span></button>)}{!loading && !visible.length && <div className="p-12 text-center text-sm text-slate-500"><AlertTriangle className="mx-auto mb-3 text-slate-600" size={22} />No invoices match your search.</div>}<div className="flex items-center justify-between border-t border-line px-5 py-3 text-xs text-slate-500"><span>{filtered.length ? `${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, filtered.length)} of ${filtered.length}` : '0 invoices'}</span><div className="flex gap-1"><button onClick={() => setPage(value => Math.max(1, value - 1))} disabled={page === 1} className="rounded p-1.5 hover:bg-white/5 disabled:opacity-30" aria-label="Previous page"><ChevronLeft size={16} /></button><button onClick={() => setPage(value => Math.min(pages, value + 1))} disabled={page === pages} className="rounded p-1.5 hover:bg-white/5 disabled:opacity-30" aria-label="Next page"><ChevronRight size={16} /></button></div></div></div>
    {selected && <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={() => setSelected(null)}><div role="dialog" aria-modal="true" aria-label={`Details for ${selected.id}`} onClick={e => e.stopPropagation()} className="scrollbar h-full w-full max-w-lg overflow-y-auto border-l border-line bg-panel p-6 shadow-2xl"><div className="flex items-center justify-between"><div><p className="text-xs text-mint">Invoice details</p><h2 className="mt-1 text-xl font-semibold">{selected.id}</h2></div><button onClick={() => setSelected(null)} aria-label="Close details"><X /></button></div><div className="mt-8 grid grid-cols-2 gap-5"><div><div className="text-xs text-slate-500">Vendor</div><div className="mt-1 text-sm">{selected.vendor}</div></div><div><div className="text-xs text-slate-500">Total</div><div className="mt-1 text-sm text-mint">${selected.amount.toLocaleString()}</div></div></div><h3 className="mb-3 mt-8 text-sm font-medium">Line items</h3><div className="rounded-lg border border-line">{selected.items.map(item => <div key={item.description} className="flex justify-between border-b border-line p-3 text-sm last:border-0"><span className="text-slate-300">{item.description} x {item.quantity}</span><span>${item.price.toLocaleString()}</span></div>)}</div><h3 className="mb-3 mt-8 flex items-center gap-2 text-sm font-medium"><FileJson size={16} className="text-emerald" /> Raw JSON</h3><pre className="overflow-auto rounded-lg bg-ink p-4 text-xs leading-5 text-slate-400">{JSON.stringify(selected.raw, null, 2)}</pre></div></div>}
  </div>;
}
