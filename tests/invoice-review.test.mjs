import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { applyRetryResponse, invoicesFromUploadResponse, parseDeleteResult } from '@/lib/invoice-review/actions.ts';
import { readPath, valuesMatch, writePath } from '@/lib/invoice-review/edit.ts';
import { invoiceToCsv } from '@/lib/invoice-review/export.ts';
import { confidenceLevel, flaggedFieldCount, formatMoney } from '@/lib/invoice-review/format.ts';
import { parseInvoiceReviews } from '@/lib/invoice-review/parse.ts';

const mock = JSON.parse(await readFile(new URL('../lib/invoice-review/invoice-review.mock.json', import.meta.url), 'utf8'));
const invoices = parseInvoiceReviews(mock);
const riverbend = invoices[0];

test('sample list includes the Riverbend invoice and the other review states', () => {
  assert.equal(riverbend.vendor.name, 'Riverbend Plumbing & Drain LLC');
  assert.equal(riverbend.invoice.number, 'RB-20418');
  assert.equal(riverbend.invoice.invoice_date, '2026-10-14');
  assert.equal(riverbend.invoice.due_date, '2026-11-13');
  assert.equal(riverbend.invoice.terms, 'Net 30');
  assert.equal(riverbend.invoice.work_order_number, 'WO-77316');
  assert.equal(riverbend.invoice.po_number, 'PO-5521');
  assert.equal(riverbend.invoice.service_date, '2026-10-13');
  assert.equal(riverbend.property.name, 'Willowbrook Apartments');
  assert.equal(riverbend.property.unit, '2B');
  assert.equal(riverbend.status, 'needs_review');
  assert.equal(riverbend.line_items.length, 6);
  assert.equal(riverbend.totals.subtotal, 492.55);
  assert.equal(riverbend.totals.tax_amount, 3.5);
  assert.equal(riverbend.totals.total_due, 496.05);
  assert.equal(riverbend.totals.currency, 'USD');
  const sum = riverbend.line_items.reduce((total, item) => total + item.amount, 0);
  assert.ok(Math.abs(sum - 492.55) < 0.001);
  assert.deepEqual(invoices.map((invoice) => invoice.status), ['needs_review', 'approved', 'rejected']);
});

test('two low-confidence fields are flagged and a medium score stays unflagged', () => {
  const flagged = Object.entries(riverbend.field_meta).filter(([, meta]) => meta.needs_review);
  assert.deepEqual(flagged.map(([path]) => path).sort(), ['invoice.po_number', 'vendor.phone']);
  assert.equal(flaggedFieldCount(riverbend.field_meta), 2);
  assert.equal(confidenceLevel(riverbend.field_meta['vendor.phone'].confidence), 'low');
  assert.equal(confidenceLevel(riverbend.field_meta['invoice.po_number'].confidence), 'low');
  assert.equal(confidenceLevel(riverbend.field_meta['invoice.work_order_number'].confidence), 'medium');
  assert.equal(riverbend.field_meta['invoice.work_order_number'].needs_review, false);
  assert.equal(confidenceLevel(0.85), 'high');
  assert.equal(confidenceLevel(0.6), 'medium');
  assert.equal(confidenceLevel(0.59), 'low');
  const others = invoices.slice(1).flatMap((invoice) => Object.values(invoice.field_meta));
  assert.equal(others.some((meta) => meta.needs_review), false);
});

test('parser accepts one invoice or a data envelope', () => {
  assert.equal(parseInvoiceReviews(riverbend)[0].document_id, riverbend.document_id);
  assert.equal(parseInvoiceReviews({ data: [riverbend] })[0].document_id, riverbend.document_id);
  assert.throws(() => parseInvoiceReviews({ invoices: [] }), /not a list of invoices/);
});

test('inline edits keep the original value and currency export includes the sample', () => {
  const edited = writePath(riverbend, 'vendor.phone', '(503) 555-0199');
  assert.equal(edited.vendor.phone, '(503) 555-0199');
  assert.equal(riverbend.vendor.phone, '(503) 555-0148');
  assert.equal(valuesMatch('vendor.phone', '(503) 555-0148', readPath(riverbend, 'vendor.phone')), true);
  assert.equal(valuesMatch('totals.tax_amount', '3.50', readPath(riverbend, 'totals.tax_amount')), true);
  const priced = writePath(riverbend, 'line_items.2.unit_price', '50');
  assert.equal(priced.line_items[2].unit_price, 50);
  assert.equal(riverbend.line_items[2].unit_price, 48.55);
  const csv = invoiceToCsv(edited);
  assert.match(csv, /Riverbend Plumbing & Drain LLC/);
  assert.match(csv, /RB-20418/);
  assert.match(csv, /496\.05/);
  assert.match(csv, /Wax ring kit,parts,1,48\.55,48\.55/);
  assert.match(formatMoney(496.05, 'USD'), /496\.05/);
});

test('review screen keeps the mock switch and the backend route notes', async () => {
  const loader = await readFile(new URL('../lib/invoice-review/load.ts', import.meta.url), 'utf8');
  const page = await readFile(new URL('../app/review/page.tsx', import.meta.url), 'utf8');
  const layout = await readFile(new URL('../components/layout.tsx', import.meta.url), 'utf8');
  const row = await readFile(new URL('../components/invoice-review/invoice-review-row.tsx', import.meta.url), 'utf8');
  assert.match(loader, /export const USE_INVOICE_REVIEW_MOCK = false/);
  assert.match(loader, /\/api\/backend\/invoices/);
  assert.match(loader, /\/api\/backend\/documents\/\$\{encodeURIComponent\(documentId\)\}\/approve/);
  assert.match(loader, /\/retry/);
  assert.match(loader, /JSON\.stringify\(\{ ids \}\)/);
  assert.match(loader, /x-organization-id/);
  assert.match(page, /workspaceStatus === 'ready'/);
  assert.match(layout, /\['\/review', 'Invoice review'/);
  assert.match(row, /aria-expanded=\{expanded\}/);
  assert.match(row, /aria-controls=\{panelId\}/);
  assert.match(row, /Review each flagged field before approving\./);
  const headings = [
    'Invoice details',
    'Vendor',
    'Bill to',
    'Property and work',
    'Line items',
    'Totals',
    'Remit to and late fee terms',
    'Validation checks',
    'Source document',
  ];
  const sourcePreview = await readFile(new URL('../components/invoice-review/source-preview.tsx', import.meta.url), 'utf8');
  const combined = `${row}\n${sourcePreview}`;
  let cursor = -1;
  for (const heading of headings) {
    const next = combined.indexOf(heading, cursor + 1);
    assert.notEqual(next, -1, heading);
    cursor = next;
  }
});

test('failed extractions keep the source file and error message', () => {
  const [failed] = parseInvoiceReviews({
    document_id: 'doc_failed',
    source_file: 'unreadable.pdf',
    status: 'failed',
    error: { message: 'The page could not be read.', retryable: true },
  });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.source_file, 'unreadable.pdf');
  assert.equal(failed.error?.message, 'The page could not be read.');
  assert.equal(failed.error?.retryable, true);
});

test('a retry response can stop further retries and explain why', () => {
  const [failed] = parseInvoiceReviews({
    document_id: 'doc_failed',
    source_file: 'unreadable.pdf',
    status: 'failed',
    error: { message: 'The page could not be read.', retryable: true },
  });
  const stopped = applyRetryResponse(failed, { retryable: false, reason: 'This file type is not supported.' });
  assert.equal(stopped.error?.retryable, false);
  assert.equal(stopped.error?.reason, 'This file type is not supported.');
  const recovered = applyRetryResponse(failed, { ...riverbend, document_id: 'doc_failed' });
  assert.equal(recovered.status, 'needs_review');
  assert.equal(recovered.invoice.number, 'RB-20418');
});

test('an upload response is added from the API body', () => {
  const uploaded = invoicesFromUploadResponse({
    results: [{ success: true, data: riverbend }],
  });
  assert.equal(uploaded.length, 1);
  assert.equal(uploaded[0].document_id, riverbend.document_id);
  const failedUpload = invoicesFromUploadResponse({
    results: [{ success: false, id: 'doc_bad', filename: 'scan.pdf', message: 'Extraction failed.' }],
  });
  assert.equal(failedUpload[0].status, 'failed');
  assert.equal(failedUpload[0].source_file, 'scan.pdf');
  assert.equal(failedUpload[0].error?.message, 'Extraction failed.');
});

test('bulk delete keeps failed ids and drops the ones that succeeded', () => {
  const result = parseDeleteResult(['a', 'b'], {
    deleted: ['a'],
    failed: [{ id: 'b', message: 'Still processing.' }],
  }, 'Could not delete this invoice review.');
  assert.deepEqual(result.deletedIds, ['a']);
  assert.deepEqual(result.failed, [{ id: 'b', message: 'Still processing.' }]);
});
