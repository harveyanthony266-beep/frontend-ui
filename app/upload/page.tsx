'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UploadCloud, AlertTriangle, X, Download, FileSpreadsheet } from 'lucide-react';
import { ApiError, processInvoice, ProcessedDocument } from '@/lib/api';
import { downloadProcessedInvoicesCsv, downloadProcessedInvoicesXlsx } from '@/lib/invoice-export';
import { toast } from 'sonner';

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const GENERIC_UPLOAD_ERROR = 'Unable to upload the selected files. Please try again.';
const STORAGE_KEY = 'processed-invoices';

function readStoredDocuments(): ProcessedDocument[] {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(value)
      ? value.filter((document): document is ProcessedDocument =>
        typeof document === 'object' && document !== null &&
        'key' in document && typeof document.key === 'string' &&
        'filename' in document && typeof document.filename === 'string' &&
        'line_items' in document && Array.isArray(document.line_items))
      : [];
  } catch {
    return [];
  }
}

export default function UploadPage() {
  const ref = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [drag, setDrag] = useState(false);
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState<ProcessedDocument[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [format, setFormat] = useState<'xlsx' | 'csv'>('xlsx');
  const [storageLoaded, setStorageLoaded] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setDocuments(readStoredDocuments());
    setStorageLoaded(true);
  }, []);

  useEffect(() => {
    if (storageLoaded) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(documents));
  }, [documents, storageLoaded]);

  const selectedDocuments = documents.filter(document => selectedKeys.includes(document.key));
  const allSelected = documents.length > 0 && selectedDocuments.length === documents.length;

  async function exportSelected() {
    if (!selectedDocuments.length) return;
    setExporting(true);
    try {
      if (format === 'csv') downloadProcessedInvoicesCsv(selectedDocuments);
      else await downloadProcessedInvoicesXlsx(selectedDocuments);
    } catch {
      setError(`Unable to create the ${format.toUpperCase()} download. Please try again.`);
    } finally {
      setExporting(false);
    }
  }

  async function handle(files: File[]) {
    if (!files.length) return;
    if (files.some(file => file.size > MAX_FILE_SIZE)) {
      setError('Each file must be 25 MB or smaller.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const invoices = await processInvoice(files);
      setDocuments(current => [...current, ...invoices]);
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

  function toggleSelected(key: string) {
    setSelectedKeys(current => current.includes(key) ? current.filter(item => item !== key) : [...current, key]);
  }

  function toggleAll() {
    setSelectedKeys(allSelected ? [] : documents.map(document => document.key));
  }

  function removeSelected() {
    setDocuments(current => current.filter(document => !selectedKeys.includes(document.key)));
    setSelectedKeys([]);
  }

  return <div className="mx-auto max-w-6xl space-y-8">
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
      <button disabled={loading || !storageLoaded} onClick={() => ref.current?.click()} className="mt-6 rounded-lg bg-emerald px-5 py-2.5 text-sm font-semibold text-ink disabled:opacity-50">
        {loading ? 'Uploading files…' : 'Choose files'}
      </button>
    </div>
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Processed documents ({documents.length})</h2>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-slate-400">{selectedKeys.length} selected</span>
          <select value={format} onChange={event => setFormat(event.target.value as 'xlsx' | 'csv')} className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-slate-200">
            <option value="xlsx">Excel (.xlsx)</option>
            <option value="csv">CSV</option>
          </select>
          <button onClick={() => void exportSelected()} disabled={!selectedKeys.length || exporting} className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-4 py-2 text-sm text-slate-300 hover:bg-white/5 disabled:opacity-50">
            <Download size={15} />{exporting ? 'Preparing…' : 'Export selected'}
          </button>
          <button onClick={removeSelected} disabled={!selectedKeys.length} className="rounded-lg border border-line px-4 py-2 text-sm text-slate-300 hover:bg-white/5 disabled:opacity-50">
            Remove from list
          </button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-panel">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3"><input type="checkbox" aria-label="Select all documents" checked={allSelected} onChange={toggleAll} /></th>
              <th className="px-4 py-3">Vendor</th>
              <th className="px-4 py-3">Invoice number</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Filename</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {documents.map(document => <tr key={document.key}>
              <td className="px-4 py-3"><input type="checkbox" aria-label={`Select ${document.filename}`} checked={selectedKeys.includes(document.key)} onChange={() => toggleSelected(document.key)} /></td>
              <td className="px-4 py-3">{document.vendor_name || 'Unknown vendor'}</td>
              <td className="px-4 py-3">{document.invoice_number || document.id}</td>
              <td className="px-4 py-3">{document.invoice_date}</td>
              <td className="px-4 py-3">{document.total_amount.toLocaleString()}</td>
              <td className="px-4 py-3">{document.filename}</td>
              <td className="px-4 py-3">{document.status === 'needs_review'
                ? <span className="rounded-full bg-amber-400/10 px-2 py-1 text-xs text-amber-300">Needs review</span>
                : document.status}</td>
            </tr>)}
            {!documents.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No processed documents yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <button onClick={() => router.push('/invoices')} className="rounded-lg px-2 py-2 text-sm text-mint hover:bg-white/5">View invoice archive</button>
    </section>
  </div>;
}
