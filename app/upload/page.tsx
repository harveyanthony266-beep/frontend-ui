'use client';

import { useRef, useState } from 'react';
import { FileUp, LoaderCircle, LockKeyhole, X } from 'lucide-react';
import { WorkspaceSetupNotice } from '@/components/workspace-setup-notice';
import { useWorkspace } from '@/components/workspace-provider';

type UploadOutcome = {
  filename: string;
  success: boolean;
  statusCode?: number;
  message?: string;
  data?: Record<string, unknown>;
};

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_FILES = 10;

async function responseMessage(response: Response) {
  try {
    const result = await response.json();
    return typeof result.message === 'string' ? result.message : 'Upload failed.';
  } catch {
    return 'Upload failed.';
  }
}

export default function UploadPage() {
  const { organizationId, organization, status } = useWorkspace();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [outcomes, setOutcomes] = useState<UploadOutcome[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const ready = status === 'ready' && Boolean(organizationId);

  function selectFiles(selected: FileList | null) {
    const nextFiles = Array.from(selected ?? []);
    setError('');
    setOutcomes([]);
    if (nextFiles.length > MAX_FILES) {
      setFiles([]);
      setError(`Choose no more than ${MAX_FILES} files at a time.`);
      return;
    }
    const tooLarge = nextFiles.find((file) => file.size > MAX_FILE_BYTES);
    if (tooLarge) {
      setFiles([]);
      setError(`${tooLarge.name} exceeds the 25 MB per-file limit.`);
      return;
    }
    setFiles(nextFiles);
  }

  async function pollJob(jobId: string): Promise<UploadOutcome[]> {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const response = await fetch(`/api/backend/jobs/${encodeURIComponent(jobId)}`, {
        headers: { 'x-organization-id': organizationId },
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const job = await response.json();
      if (job.status === 'failed') {
        throw new Error(job.error ?? 'The document batch failed.');
      }
      if (job.status === 'completed' || job.status === 'completed_with_errors') {
        return Array.isArray(job.results) ? job.results : [];
      }
    }
    throw new Error('Processing is taking longer than expected. Check the archive later.');
  }

  async function upload() {
    if (!ready || !files.length || busy) return;
    setBusy(true);
    setError('');
    setOutcomes([]);
    const form = new FormData();
    files.forEach((file) => form.append('file', file, file.name));
    try {
      const response = await fetch('/api/backend/webhooks/process-invoice', {
        method: 'POST',
        headers: {
          'x-organization-id': organizationId,
          'idempotency-key': crypto.randomUUID(),
        },
        body: form,
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const result = await response.json();
      if (result.job_id) {
        setOutcomes(await pollJob(result.job_id));
      } else if (Array.isArray(result.results)) {
        setOutcomes(result.results);
      } else if (result.success) {
        const rows = Array.isArray(result.data) ? result.data : [result.data];
        setOutcomes(rows.map((row: Record<string, unknown>) => ({
          filename: String(row.original_filename ?? files[0]?.name ?? 'Uploaded file'),
          success: true,
          data: row,
        })));
      } else {
        throw new Error('The backend returned an unexpected upload response.');
      }
      setFiles([]);
      if (inputRef.current) inputRef.current.value = '';
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="mx-auto max-w-4xl space-y-8">
    <div>
      <p className="text-xs uppercase tracking-[.25em] text-mint">Document intake</p>
      <h1 className="mt-2 text-3xl font-semibold">Upload documents</h1>
      <p className="mt-2 text-sm text-slate-400">
        {organization ? `Files will be added to ${organization.name}.` : 'Select an authorized organization to begin.'}
      </p>
    </div>

    {!ready ? <WorkspaceSetupNotice /> : (
      <section className="rounded-2xl border border-dashed border-line bg-panel p-7 sm:p-10" aria-labelledby="upload-title">
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          multiple
          disabled={!ready || busy}
          onChange={(event) => selectFiles(event.target.files)}
          aria-label="Choose documents to upload"
        />
        <div className="text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white/5 text-mint"><FileUp size={26} aria-hidden="true" /></div>
          <h2 id="upload-title" className="mt-5 text-lg font-semibold text-white">Add documents to this workspace</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-400">Choose up to 10 files, each no larger than 25 MB. Supported formats include PDF, PNG, JPG, WEBP, HEIC, XLSX, XLS, CSV, DOCX, TXT, and EML.</p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white/10 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-50"
          >
            Choose files
          </button>
        </div>

        {files.length > 0 && (
          <div className="mx-auto mt-7 max-w-2xl space-y-2">
            {files.map((file, index) => (
              <div key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-ink/60 px-3 py-2 text-sm">
                <span className="truncate text-slate-200">{file.name} <span className="text-xs text-slate-500">({(file.size / 1024 / 1024).toFixed(2)} MB)</span></span>
                <button type="button" disabled={busy} aria-label={`Remove ${file.name}`} onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded p-1 text-slate-500 hover:text-white disabled:opacity-40"><X size={16} /></button>
              </div>
            ))}
            <button type="button" onClick={() => void upload()} disabled={busy} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald px-5 py-3 text-sm font-semibold text-ink disabled:opacity-50">
              {busy ? <><LoaderCircle size={16} className="animate-spin" /> Processing securely…</> : <><LockKeyhole size={16} /> Upload {files.length} file{files.length === 1 ? '' : 's'}</>}
            </button>
          </div>
        )}
      </section>
    )}

    {error && <p role="alert" className="rounded-lg border border-rose-900/50 bg-rose-950/20 p-4 text-sm text-rose-200">{error}</p>}
    {outcomes.length > 0 && (
      <section aria-live="polite" className="space-y-2">
        <h2 className="font-semibold text-white">Upload results</h2>
        {outcomes.map((outcome, index) => (
          <div key={`${outcome.filename}-${index}`} className={`rounded-lg border p-4 text-sm ${outcome.success ? 'border-emerald-900/50 bg-emerald-950/20 text-mint' : 'border-amber-900/50 bg-amber-950/20 text-amber-200'}`}>
            <p className="font-medium">{outcome.success ? 'Processed' : 'Needs attention'}: {outcome.filename}</p>
            {!outcome.success && outcome.message && <p className="mt-1 text-slate-300">{outcome.message}</p>}
          </div>
        ))}
      </section>
    )}
  </div>;
}
