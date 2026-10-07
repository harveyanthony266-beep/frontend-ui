'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, LockKeyhole, LogOut, Menu } from 'lucide-react';
import { Sidebar } from './layout';
import { useWorkspace } from './workspace-provider';

export function AppFrame({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const router = useRouter();
  const {
    organizations,
    organizationId,
    organization,
    email,
    status,
    error,
    selectOrganization,
  } = useWorkspace();
  const verified = status === 'ready';

  async function signOut() {
    setSigningOut(true);
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
    });
    window.sessionStorage.removeItem('active-organization-id');
    router.replace('/login');
    router.refresh();
  }

  return <div className="min-h-screen bg-ink text-slate-100">
    <Sidebar open={open} onClose={() => setOpen(false)} />
    <div className="lg:pl-72">
      <header className="sticky top-0 z-20 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-line/70 bg-ink/90 px-5 py-3 backdrop-blur lg:px-10">
        <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu /></button>
        <div className="hidden text-xs uppercase tracking-[.2em] text-slate-500 lg:block">MagicHeart Nexus</div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <Building2 size={14} aria-hidden="true" />
            <select
              aria-label="Active organization"
              value={organizationId}
              disabled={!organizations.length}
              onChange={(event) => selectOrganization(event.target.value)}
              className="max-w-48 rounded-lg border border-line bg-panel px-2 py-2 text-sm text-slate-100 disabled:opacity-60"
            >
              {!organizations.length && <option value="">No organizations</option>}
              {organizations.map((item) => (
                <option value={item.id} key={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          <div
            role="status"
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
              verified
                ? 'border-emerald-900/60 bg-emerald-950/20 text-mint'
                : 'border-amber-900/50 bg-amber-950/20 text-amber-200'
            }`}
            title={error || undefined}
          >
            <LockKeyhole size={13} aria-hidden="true" />
            {verified
              ? organization?.name ?? 'Verified'
              : status === 'verifying'
                ? 'Verifying access…'
                : status === 'loading'
                  ? 'Loading workspaces…'
                  : 'Access unavailable'}
          </div>
          {email && <span className="hidden text-xs text-slate-500 md:inline">{email}</span>}
          <button
            type="button"
            onClick={() => void signOut()}
            disabled={signingOut}
            className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-50"
          >
            <LogOut size={14} aria-hidden="true" /> Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-[1440px] p-5 lg:p-10">
        {!verified && status !== 'loading' && status !== 'verifying' && error && (
          <div role="alert" className="mb-6 rounded-xl border border-amber-900/50 bg-amber-950/20 p-4 text-sm text-amber-100">
            {error}
          </div>
        )}
        {children}
      </main>
    </div>
  </div>;
}
