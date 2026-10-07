import { LockKeyhole } from 'lucide-react';

export function WorkspaceSetupNotice() {
  return <section className="rounded-2xl border border-line bg-panel p-6 sm:p-8" aria-labelledby="workspace-setup-title">
    <div className="flex items-start gap-4">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-400/10 text-amber-300">
        <LockKeyhole size={21} aria-hidden="true" />
      </div>
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-amber-300">Secure access not configured</p>
        <h2 id="workspace-setup-title" className="mt-2 text-xl font-semibold text-white">Your documents are protected while we connect your workspace.</h2>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Sign in and select a verified organization to access its documents. Membership and backend access are checked on the server for every request.
        </p>
        <p className="mt-3 text-xs leading-5 text-slate-500">
          No API key is requested or sent from this browser. Organization access must be verified by the server for every request.
        </p>
      </div>
    </div>
  </section>;
}
