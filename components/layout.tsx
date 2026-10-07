'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Archive, LayoutDashboard, LockKeyhole, UploadCloud, X } from 'lucide-react';

const links = [
  ['/', 'Overview', LayoutDashboard],
  ['/upload', 'Upload documents', UploadCloud],
  ['/invoices', 'Document archive', Archive],
] as const;

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const path = usePathname();
  return <>
    <div className={`fixed inset-0 z-30 bg-black/60 lg:hidden ${open ? 'block' : 'hidden'}`} onClick={onClose} />
    <aside className={`fixed z-40 flex h-screen w-72 flex-col border-r border-line bg-ink p-5 transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="mb-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald text-ink font-black">M</div>
          <div><div className="font-semibold tracking-tight">MagicHeart</div><div className="text-[10px] uppercase tracking-[.24em] text-mint/60">Nexus</div></div>
        </div>
        <button className="lg:hidden" onClick={onClose} aria-label="Close navigation"><X size={18} /></button>
      </div>
      <nav className="space-y-2" aria-label="Main navigation">{links.map(([href, label, Icon]) =>
        <Link key={href} href={href} onClick={onClose} aria-current={path === href ? 'page' : undefined} className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition ${path === href ? 'bg-emerald/15 text-mint' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>
          <Icon size={18} />{label}{path === href && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald" />}
        </Link>,
      )}</nav>
      <div className="mt-auto rounded-xl border border-line bg-panel/80 p-4">
        <div className="flex items-center gap-2 text-xs text-slate-300"><LockKeyhole size={15} className="text-amber-300" /> Secure setup pending</div>
        <p className="mt-2 text-xs leading-5 text-slate-500">Organization data stays disconnected until server-side sign-in and authorization are configured.</p>
      </div>
    </aside>
  </>;
}
