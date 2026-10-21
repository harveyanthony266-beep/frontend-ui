import { scalarReviewFields } from '@/lib/invoice-review/fields';
import { readPath } from '@/lib/invoice-review/edit';
import type { VendorInvoice } from '@/lib/invoice-review/types';

function csvCell(value: string | number) {
  const text = String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  if (/[",\n]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

function fileBase(invoice: VendorInvoice) {
  const raw = invoice.invoice.number || invoice.document_id || 'invoice';
  return raw.replace(/[^a-zA-Z0-9._-]+/g, '-') || 'invoice';
}

export function invoiceToCsv(invoice: VendorInvoice) {
  const header = ['field', 'value'];
  const scalars: [string, string][] = [
    ['document_id', invoice.document_id],
    ['status', invoice.status],
    ['source_file', invoice.source_file],
    ['totals.currency', invoice.totals.currency],
    ...scalarReviewFields.map((field): [string, string] => [field.path, readPath(invoice, field.path)]),
  ];
  const lines = [
    header.join(','),
    ...scalars.map((row) => row.map(csvCell).join(',')),
    '',
    ['description', 'category', 'quantity', 'unit_price', 'amount'].join(','),
    ...invoice.line_items.map((item) => [
      item.description,
      item.category,
      item.quantity,
      item.unit_price,
      item.amount,
    ].map(csvCell).join(',')),
  ];
  return `${lines.join('\n')}\n`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadInvoiceCsv(invoice: VendorInvoice) {
  downloadBlob(new Blob([invoiceToCsv(invoice)], { type: 'text/csv;charset=utf-8' }), `${fileBase(invoice)}.csv`);
}

export async function downloadInvoiceWorkbook(invoice: VendorInvoice) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();
  const details = [
    ['field', 'value'],
    ['document_id', invoice.document_id],
    ['status', invoice.status],
    ['source_file', invoice.source_file],
    ['totals.currency', invoice.totals.currency],
    ...scalarReviewFields.map((field) => [field.path, readPath(invoice, field.path)]),
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(details), 'Invoice');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(invoice.line_items), 'Line items');
  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  downloadBlob(
    new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${fileBase(invoice)}.xlsx`,
  );
}
