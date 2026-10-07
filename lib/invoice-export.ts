import type { Invoice, ProcessedDocument } from '@/lib/api';

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
  if (typeof value === 'string' && /^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function exportFilename(extension: 'csv' | 'xlsx') {
  const date = new Date();
  const today = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  return `invoices-export-${today}.${extension}`;
}

const archiveColumns = ['Invoice ID', 'Vendor', 'Date', 'Amount', 'Status', 'Line items (JSON)', 'Extracted data (JSON)'];

function archiveRows(invoices: Invoice[]): (string | number)[][] {
  return invoices.map(invoice => [
    invoice.id,
    invoice.vendor,
    invoice.date,
    invoice.amount,
    invoice.status,
    JSON.stringify(invoice.items),
    JSON.stringify(invoice.raw),
  ]);
}

export function downloadInvoicesCsv(invoices: Invoice[]) {
  const csv = [archiveColumns, ...archiveRows(invoices)].map(row => row.map(csvCell).join(',')).join('\r\n');
  saveFile(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }), 'invoices.csv');
}

export async function downloadInvoicesXlsx(invoices: Invoice[]) {
  const { utils, write } = await import('xlsx');
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, utils.aoa_to_sheet([archiveColumns, ...archiveRows(invoices)]), 'Invoices');
  const content = write(workbook, { bookType: 'xlsx', type: 'array' });
  saveFile(new Blob([content], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'invoices.xlsx');
}

type ExportColumn = {
  key: string;
  label: string;
  optional?: boolean;
  invoiceValue?: (document: ProcessedDocument) => string | number;
  lineValue?: (document: ProcessedDocument, line: ProcessedDocument['line_items'][number]) => string | number;
};

function optionalValue(value: unknown): string | number {
  return typeof value === 'number' || typeof value === 'string' ? value : '';
}

const exportColumns: ExportColumn[] = [
  { key: 'invoice_number', label: 'Invoice number', invoiceValue: document => document.invoice_number },
  { key: 'vendor_name', label: 'Vendor', invoiceValue: document => document.vendor_name },
  { key: 'invoice_date', label: 'Invoice date', invoiceValue: document => document.invoice_date },
  { key: 'source_filename', label: 'Source filename', invoiceValue: document => document.filename },
  { key: 'line_description', label: 'Line description', lineValue: (_document, line) => line.description },
  { key: 'line_amount', label: 'Line amount', lineValue: (_document, line) => line.amount },
  { key: 'total_amount', label: 'Invoice total', invoiceValue: document => document.total_amount },
  { key: 'status', label: 'Status', invoiceValue: document => document.status },
  { key: 'po_number', label: 'PO number', optional: true, invoiceValue: document => optionalValue(document.optional_fields.po_number) },
  { key: 'subtotal', label: 'Subtotal', optional: true, invoiceValue: document => optionalValue(document.optional_fields.subtotal) },
  { key: 'discount', label: 'Discount', optional: true, invoiceValue: document => optionalValue(document.optional_fields.discount) },
  { key: 'freight', label: 'Freight', optional: true, invoiceValue: document => optionalValue(document.optional_fields.freight) },
  { key: 'tax', label: 'Tax', optional: true, invoiceValue: document => optionalValue(document.optional_fields.tax) },
  { key: 'quantity', label: 'Quantity', optional: true, lineValue: (_document, line) => optionalValue(line.quantity) },
  { key: 'unit_price', label: 'Unit price', optional: true, lineValue: (_document, line) => optionalValue(line.unit_price) },
];

function includesOptionalColumn(documents: ProcessedDocument[], key: string) {
  return documents.some(document =>
    document.optional_fields[key] !== undefined ||
    document.line_items.some(line => line[key] !== undefined),
  );
}

function columnsFor(documents: ProcessedDocument[], key: 'invoiceValue' | 'lineValue') {
  return exportColumns.filter(column =>
    Boolean(column[key]) && (!column.optional || includesOptionalColumn(documents, column.key)),
  );
}

function documentRows(documents: ProcessedDocument[], columns: ExportColumn[]): (string | number)[][] {
  return documents.flatMap(document => {
    const lines = document.line_items.length ? document.line_items : [null];
    return lines.map(line => columns.map(column =>
      line && column.lineValue
        ? column.lineValue(document, line)
        : column.invoiceValue?.(document) ?? '',
    ));
  });
}

export function downloadProcessedInvoicesCsv(documents: ProcessedDocument[]) {
  const columns = columnsFor(documents, 'lineValue');
  const csv = [columns.map(column => column.label), ...documentRows(documents, columns)]
    .map(row => row.map(csvCell).join(','))
    .join('\r\n');
  saveFile(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }), exportFilename('csv'));
}

export async function downloadProcessedInvoicesXlsx(documents: ProcessedDocument[]) {
  const { utils, write } = await import('xlsx');
  const workbook = utils.book_new();
  const lineColumns = columnsFor(documents, 'lineValue');
  utils.book_append_sheet(workbook, utils.aoa_to_sheet([
    lineColumns.map(column => column.label),
    ...documentRows(documents, lineColumns),
  ]), 'Line items');

  const totalColumns = columnsFor(documents, 'invoiceValue');
  utils.book_append_sheet(workbook, utils.aoa_to_sheet([
    totalColumns.map(column => column.label),
    ...documents.map(document => totalColumns.map(column => column.invoiceValue?.(document) ?? '')),
  ]), 'Invoice totals');

  const content = write(workbook, { bookType: 'xlsx', type: 'array' });
  saveFile(
    new Blob([content], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    exportFilename('xlsx'),
  );
}
