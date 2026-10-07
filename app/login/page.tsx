'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { LockKeyhole } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        setError(result?.message ?? 'Sign-in failed. Try again.');
        return;
      }
      router.replace('/');
      router.refresh();
    } catch {
      setError('Sign-in is unavailable right now. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-ink px-5 text-slate-100">
      <section className="w-full max-w-md rounded-2xl border border-line bg-panel p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald text-ink">
            <LockKeyhole size={20} aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Sign in to MagicHeart</h1>
            <p className="text-sm text-slate-400">Use your invited workspace account.</p>
          </div>
        </div>
        <form className="space-y-4" onSubmit={submit}>
          <label className="block text-sm text-slate-300">
            Email
            <input
              autoComplete="username"
              className="mt-2 w-full rounded-lg border border-line bg-ink px-3 py-2.5 text-white outline-none focus:border-mint"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="block text-sm text-slate-300">
            Password
            <input
              autoComplete="current-password"
              className="mt-2 w-full rounded-lg border border-line bg-ink px-3 py-2.5 text-white outline-none focus:border-mint"
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-rose-300">{error}</p>
          )}
          <button
            className="w-full rounded-lg bg-emerald px-4 py-3 text-sm font-semibold text-ink disabled:opacity-50"
            type="submit"
            disabled={busy}
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="mt-5 text-xs leading-5 text-slate-500">
          Accounts are provisioned by your workspace administrator. No API key is entered or stored in this browser.
        </p>
      </section>
    </main>
  );
}
