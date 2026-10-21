import { formatDate, formatMoney } from '@/lib/invoice-review/format';
import type { VendorInvoice } from '@/lib/invoice-review/types';

export function SourcePreview({ invoice }: { invoice: VendorInvoice }) {
  const currency = invoice.totals.currency || 'USD';
  return <aside className="border-t border-line bg-ink/30 lg:sticky lg:top-24 lg:self-start lg:border-l lg:border-t-0" aria-label="Source document preview">
    <div className="p-4 sm:p-5">
      <h3 className="text-xs font-semibold uppercase tracking-[.18em] text-mint">Source document</h3>
      <p className="mt-2 text-xs leading-5 text-slate-500">
        {invoice.source_file} · {invoice.page_count} {invoice.page_count === 1 ? 'page' : 'pages'}
      </p>
      <div className="mt-4 rounded-md bg-[#f4f0e6] p-4 text-[#1d1914] shadow-lg">
        <div className="flex items-start justify-between gap-3 border-b border-[#ddd4c4] pb-3">
          <div>
            <p className="text-sm font-semibold">{invoice.vendor.name || 'Vendor'}</p>
            <p className="mt-1 whitespace-pre-wrap text-[11px] leading-4 text-[#5c564c]">{invoice.vendor.address}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-[.16em] text-[#8a8172]">Invoice</p>
            <p className="text-sm font-semibold">{invoice.invoice.number}</p>
            <p className="mt-1 text-[11px] text-[#5c564c]">{formatDate(invoice.invoice.invoice_date)}</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-[11px] leading-4">
          <div>
            <p className="uppercase tracking-wide text-[#8a8172]">Bill to</p>
            <p className="mt-1 font-medium">{invoice.bill_to.name}</p>
            <p>{invoice.bill_to.attention}</p>
            <p className="whitespace-pre-wrap text-[#5c564c]">{invoice.bill_to.address}</p>
          </div>
          <div>
            <p className="uppercase tracking-wide text-[#8a8172]">Property</p>
            <p className="mt-1 font-medium">{invoice.property.name}</p>
            <p>Unit {invoice.property.unit}</p>
            <p className="whitespace-pre-wrap text-[#5c564c]">{invoice.property.address}</p>
          </div>
        </div>
        <table className="mt-4 w-full text-left text-[11px]">
          <thead className="border-b border-[#ddd4c4] text-[#8a8172]">
            <tr>
              <th className="py-1 font-medium">Description</th>
              <th className="py-1 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.line_items.map((item, index) => (
              <tr key={`${item.description}-${index}`} className="border-b border-[#eee6d8]">
                <td className="py-1 pr-2">{item.description}</td>
                <td className="py-1 text-right tabular-nums">{formatMoney(item.amount, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 flex items-center justify-between text-sm font-semibold">
          <span>Total due</span>
          <span className="tabular-nums">{formatMoney(invoice.totals.total_due, currency)}</span>
        </div>
      </div>
    </div>
  </aside>;
}
