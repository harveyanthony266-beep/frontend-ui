'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UploadCloud, CheckCircle2, AlertTriangle, X, Download, FileSpreadsheet } from 'lucide-react';
import { ApiError, processInvoice, Invoice } from '@/lib/api';
import { downloadInvoicesCsv, downloadInvoicesXlsx } from '@/lib/invoice-export';
import { toast } from 'sonner';

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const GENERIC_UPLOAD_ERROR = 'Unable to upload the selected files. Please try again.';

export default function UploadPage() {
  const ref = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [drag, setDrag] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Invoice[] | null>(null);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState<'csv' | 'xlsx' | null>(null);

  async function exportResult(format: 'csv' | 'xlsx') {
    if (!result) return;
    setExporting(format);
    try {
      if (format === 'csv') downloadInvoicesCsv(result);
      else await downloadInvoicesXlsx(result);
    } catch {
      setError(`Unable to create the ${format.toUpperCase()} download. Please try again.`);
    } finally {
      setExporting(null);
    }
  }

  async function handle(files: File[]) {
    if (!files.length) return;
    if (files.some(file => file.size > MAX_FILE_SIZE)) {
      setError('Each file must be 25 MB or smaller.');
      return;
    }

    setError('');
    setResult(null);
    setLoading(true);
    try {
      const invoices = await processInvoice(files);
      setResult(invoices);
      toast.success('Files uploaded successfully.');
    } catch (requestError) {
      setError(requestError instanceof ApiError && (requestError.status === 413 || requestError.status === 422)
        ? requestError.message
        : GENERIC_UPLOAD_ERROR);
    } finally {
      setLoading(false);
    }
  }

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    void handle(files);
  }

  return <div className="mx-auto max-w-4xl space-y-8">
    <div>
      <p className="text-xs uppercase tracking-[.25em] text-mint">Document intake</p>
      <h1 className="mt-2 text-3xl font-semibold">Upload documents</h1>
      <p className="mt-2 text-sm text-slate-400">Upload one or more files of any type, up to 25 MB each.</p>
    </div>
    {error && <div role="alert" className="flex items-center gap-3 rounded-lg border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-300">
      <AlertTriangle size={18} />
      <span className="flex-1">{error}</span>
      <button onClick={() => setError('')} aria-label="Dismiss error"><X size={17} /></button>
    </div>}
    <div
      onDragOver={event => { event.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={event => {
        event.preventDefault();
        setDrag(false);
        void handle(Array.from(event.dataTransfer.files));
      }}
      className={`rounded-2xl border-2 border-dashed p-12 text-center transition ${drag ? 'border-emerald bg-emerald/10' : 'border-line bg-panel'}`}
    >
      <input ref={ref} type="file" multiple className="hidden" onChange={handleInputChange} />
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald/10 text-emerald"><UploadCloud size={30} /></div>
      <h2 className="mt-5 font-medium">Drop your files here</h2>
      <p className="mt-2 text-sm text-slate-500">or choose files from your computer · up to 25 MB each</p>
      <button disabled={loading} onClick={() => ref.current?.click()} className="mt-6 rounded-lg bg-emerald px-5 py-2.5 text-sm font-semibold text-ink disabled:opacity-50">
        {loading ? 'Uploading files…' : 'Choose files'}
      </button>
    </div>
    {result && <div className="rounded-xl border border-emerald/30 bg-panel p-6">
      <div className="flex items-start gap-4">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-emerald/15 text-emerald"><CheckCircle2 /></div>
        <div>
          <h2 className="font-semibold">Upload complete</h2>
          <p className="mt-1 text-sm text-slate-400">{result.length} file{result.length === 1 ? '' : 's'} processed. Download the results or view the saved archive.</p>
        </div>
      </div>
      <div className="mt-6 divide-y divide-line border-t border-line">
        {result.map(invoice => <div key={invoice.id} className="grid gap-4 py-4 sm:grid-cols-3">
          <div><div className="text-xs text-slate-500">Vendor / file</div><div className="mt-1 text-sm">{invoice.vendor}</div></div>
          <div><div className="text-xs text-slate-500">Invoice ID</div><div className="mt-1 text-sm">{invoice.id}</div></div>
          <div><div className="text-xs text-slate-500">Total</div><div className="mt-1 text-sm text-mint">${invoice.amount.toLocaleString()}</div></div>
        </div>)}
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <button onClick={() => void exportResult('csv')} disabled={exporting !== null} className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm text-slate-300 hover:bg-white/5 disabled:opacity-50">
          <Download size={15} />{exporting === 'csv' ? 'Preparing CSV…' : 'Download CSV'}
        </button>
        <button onClick={() => void exportResult('xlsx')} disabled={exporting !== null} className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm text-slate-300 hover:bg-white/5 disabled:opacity-50">
          <FileSpreadsheet size={15} />{exporting === 'xlsx' ? 'Preparing Excel…' : 'Download Excel'}
        </button>
        <button onClick={() => router.push('/invoices')} className="rounded-lg px-4 py-2 text-sm text-mint hover:bg-white/5">View invoice archive</button>
      </div>
    </div>}
  </div>;
}
