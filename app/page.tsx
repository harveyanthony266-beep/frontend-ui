'use client';

import Link from 'next/link';
import { Archive, FileCheck2, FileUp, ShieldCheck } from 'lucide-react';
import { WorkspaceSetupNotice } from '@/components/workspace-setup-notice';
import { useWorkspace } from '@/components/workspace-provider';

const steps = [
  { number: '01', title: 'Choose an organization', description: 'See only workspaces your signed-in account is allowed to access.', Icon: ShieldCheck },
  { number: '02', title: 'Process and review', description: 'Upload documents, inspect extracted fields, and resolve review flags.', Icon: FileCheck2 },
  { number: '03', title: 'Keep your archive', description: 'Find documents and export records for your authorized organization.', Icon: Archive },
];

export default function Dashboard() {
  const { status, organization } = useWorkspace();
  const ready = status === 'ready';
  return <div className="mx-auto max-w-5xl space-y-8">
    <section className="grid-bg relative overflow-hidden rounded-2xl border border-line p-7 shadow-glow lg:p-10">
      <div className="relative z-10 max-w-2xl">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[.25em] text-mint">MagicHeart Nexus</p>
        <h1 className="text-3xl font-semibold tracking-tight text-white lg:text-5xl">Paperwork, made clear<span className="text-mint">.</span></h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-slate-400">
          {ready && organization
            ? `You are working in ${organization.name}. Upload documents, review extracted fields, and keep organization records in order.`
            : 'A secure workspace for processing documents, reviewing extracted fields, and keeping organization records in order.'}
        </p>
        {ready && <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/upload" className="inline-flex items-center gap-2 rounded-lg bg-emerald px-4 py-2.5 text-sm font-semibold text-ink"><FileUp size={16} aria-hidden="true" /> Upload documents</Link>
          <Link href="/invoices" className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-white hover:bg-white/5"><Archive size={16} aria-hidden="true" /> Open archive</Link>
        </div>}
      </div>
      <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-emerald/10 blur-3xl" />
    </section>

    {!ready && status !== 'loading' && <WorkspaceSetupNotice />}

    <section aria-label="How MagicHeart Nexus works" className="grid gap-4 md:grid-cols-3">
      {steps.map(({ number, title, description, Icon }) => <article key={number} className="rounded-xl border border-line bg-panel p-5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold tracking-[.16em] text-mint">{number}</span>
          <Icon size={18} className="text-slate-400" aria-hidden="true" />
        </div>
        <h2 className="mt-5 text-base font-semibold text-white">{title}</h2>
        <p className="mt-2 text-sm leading-5 text-slate-400">{description}</p>
      </article>)}
    </section>
    {!ready && <div className="flex items-center gap-2 text-xs text-slate-500"><FileUp size={15} aria-hidden="true" /> Upload and archive actions become available after organization access is verified.</div>}
  </div>;
}
