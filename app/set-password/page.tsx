'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { LockKeyhole } from 'lucide-react';

export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Your password must be at least 8 characters.');
      return;
    }

    setBusy(true);
    try {
      const response = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        setError(result?.message ?? 'Could not set your password.');
        return;
      }
      router.replace('/');
      router.refresh();
    } catch {
      setError('Password setup is temporarily unavailable. Try again.');
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
            <h1 className="text-xl font-semibold">Create your password</h1>
            <p className="text-sm text-slate-400">Finish setting up your invited account.</p>
          </div>
        </div>
        <form className="space-y-4" onSubmit={submit}>
          <label className="block text-sm text-slate-300">
            New password
            <input
              autoComplete="new-password"
              className="mt-2 w-full rounded-lg border border-line bg-ink px-3 py-2.5 text-white outline-none focus:border-mint"
              type="password"
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <label className="block text-sm text-slate-300">
            Confirm password
            <input
              autoComplete="new-password"
              className="mt-2 w-full rounded-lg border border-line bg-ink px-3 py-2.5 text-white outline-none focus:border-mint"
              type="password"
              minLength={8}
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </label>
          {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
          <button
            className="w-full rounded-lg bg-emerald px-4 py-3 text-sm font-semibold text-ink disabled:opacity-50"
            type="submit"
            disabled={busy}
          >
            {busy ? 'Saving password…' : 'Set password'}
          </button>
        </form>
      </section>
    </main>
  );
}
