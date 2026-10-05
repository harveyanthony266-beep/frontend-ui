import type { Invoice } from '@/lib/api';

const columns = ['Invoice ID', 'Vendor', 'Date', 'Amount', 'Status', 'Line items (JSON)', 'Extracted data (JSON)'];

function invoiceRow(invoice: Invoice): (string | number)[] {
  return [
    invoice.id,
    invoice.vendor,
    invoice.date,
    invoice.amount,
    invoice.status,
    JSON.stringify(invoice.items),
    JSON.stringify(invoice.raw),
  ];
}

function saveFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function csvCell(value: string | number): string {
  let text = String(value);
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function downloadInvoicesCsv(invoices: Invoice[]) {
  const csv = [columns, ...invoices.map(invoiceRow)]
    .map(row => row.map(csvCell).join(','))
    .join('\r\n');
  saveFile(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }), 'invoices.csv');
}

export async function downloadInvoicesXlsx(invoices: Invoice[]) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Magicheart Nexus';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Invoices', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.addRow(columns);
  sheet.addRows(invoices.map(invoiceRow));
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF167A5A' } };
  sheet.autoFilter = { from: 'A1', to: 'G1' };
  sheet.columns = [
    { width: 20 },
    { width: 28 },
    { width: 18 },
    { width: 16, style: { numFmt: '#,##0.00' } },
    { width: 14 },
    { width: 48 },
    { width: 60 },
  ];

  const content = await workbook.xlsx.writeBuffer();
  saveFile(
    new Blob([new Uint8Array(content)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    'invoices.xlsx',
  );
}
