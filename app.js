const API_BASE = 'https://ghost-business.onrender.com';
const USE_MOCK = true;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = new Set(['pdf', 'png', 'jpg', 'jpeg', 'webp', 'xlsx', 'xls', 'csv', 'docx', 'txt', 'eml']);
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_TIME_MS = 5 * 60 * 1000;
const DEFAULT_PROFILE = '';

let apiKey = '';
let verifiedKey = '';
let isVerifying = false;
let verificationSequence = 0;
let verificationController = null;
let queuedFiles = [];
let results = [];
let mockRequestIndex = 0;
let requestSequence = 0;
let activeRequests = 0;

// In production, route requests through a server-side proxy instead of exposing the API key to the browser.
const elements = {};

document.addEventListener('DOMContentLoaded', initialize);

function initialize() {
  [
    'api-key', 'verify-key', 'verification-message', 'verification-waking', 'organization-header',
    'profile', 'drop-zone', 'file-input', 'file-list', 'extract-button',
    'validation-message', 'results-section', 'results-table-wrap', 'results-empty',
    'document-count', 'export-section', 'export-excel', 'export-csv', 'empty-state',
    'waking-message', 'mock-hint',
  ].forEach(id => { elements[id] = document.getElementById(id); });

  elements.profile.value = DEFAULT_PROFILE;
  elements['mock-hint'].textContent = USE_MOCK
    ? 'Demo mode: add four files to preview clean, review, multi-document, and error results.'
    : '';

  elements['api-key'].addEventListener('input', event => {
    apiKey = event.target.value;
    resetVerification();
    updateExtractButton();
  });
  elements['api-key'].addEventListener('blur', () => verifyAccessKey());
  elements['api-key'].addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      verifyAccessKey();
    }
  });
  elements['verify-key'].addEventListener('click', () => verifyAccessKey());
  elements['file-input'].addEventListener('change', event => {
    addFiles(Array.from(event.target.files || []));
    event.target.value = '';
  });
  elements['drop-zone'].addEventListener('click', () => elements['file-input'].click());
  elements['drop-zone'].addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      elements['file-input'].click();
    }
  });
  ['dragenter', 'dragover'].forEach(name => elements['drop-zone'].addEventListener(name, event => {
    event.preventDefault();
    elements['drop-zone'].classList.add('is-dragging');
  }));
  ['dragleave', 'drop'].forEach(name => elements['drop-zone'].addEventListener(name, event => {
    event.preventDefault();
    elements['drop-zone'].classList.remove('is-dragging');
  }));
  elements['drop-zone'].addEventListener('drop', event => addFiles(Array.from(event.dataTransfer.files || [])));
  elements['extract-button'].addEventListener('click', extractQueuedFiles);
  elements['file-list'].addEventListener('click', handleFileListClick);
  elements['results-table-wrap'].addEventListener('input', handleResultEdit);
  elements['results-table-wrap'].addEventListener('change', handleResultEdit);
  elements['results-table-wrap'].addEventListener('click', handleResultAction);
  elements['export-excel'].addEventListener('click', () => exportResults('xlsx'));
  elements['export-csv'].addEventListener('click', () => exportResults('csv'));
  renderAll();
}

function addFiles(files) {
  const accepted = [];
  const rejected = [];
  files.forEach(file => {
    const extension = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';
    if (!ACCEPTED_EXTENSIONS.has(extension)) {
      rejected.push(`${file.name}: unsupported file type.`);
    } else if (file.size > MAX_FILE_BYTES) {
      rejected.push(`${file.name}: file exceeds the 25 MB limit.`);
    } else {
      accepted.push({ id: `file-${Date.now()}-${++requestSequence}`, file, status: 'queued', error: '', results: [] });
    }
  });
  queuedFiles = [...queuedFiles, ...accepted];
  showValidation(rejected.join(' '));
  renderFiles();
  updateExtractButton();
}

function showValidation(message) {
  elements['validation-message'].textContent = message;
  elements['validation-message'].hidden = !message;
}

function renderAll() {
  renderFiles();
  renderResults();
  updateExtractButton();
}

function renderFiles() {
  elements['file-list'].innerHTML = queuedFiles.map(item => {
    const extension = item.file.name.includes('.') ? item.file.name.split('.').pop().toUpperCase() : 'FILE';
    const status = statusPresentation(item.status);
    return `<div class="file-row">
      <span class="file-icon" aria-hidden="true">${escapeHtml(extension.slice(0, 4))}</span>
      <div class="file-info">
        <div class="file-name" title="${escapeHtml(item.file.name)}">${escapeHtml(item.file.name)}</div>
        <div class="file-meta">${formatBytes(item.file.size)}${item.error ? ` · ${escapeHtml(item.error)}` : ''}</div>
      </div>
      <span class="status-chip status-${status.className}">${item.status === 'processing' ? '<span class="spinner" aria-hidden="true"></span>' : ''}${status.label}</span>
      ${item.status === 'failed' ? `<button class="retry-button" type="button" data-retry="${escapeHtml(item.id)}">Retry</button>` : ''}
      ${item.status !== 'processing' ? `<button class="remove-file" type="button" aria-label="Remove ${escapeHtml(item.file.name)}" data-remove-file="${escapeHtml(item.id)}">Remove</button>` : ''}
    </div>`;
  }).join('');
}

function statusPresentation(status) {
  const values = {
    queued: ['Queued', 'queued'],
    processing: ['Processing', 'processing'],
    needs_review: ['Needs review', 'needs-review'],
    done: ['Done', 'done'],
    failed: ['Failed', 'failed'],
    duplicate: ['Duplicate', 'duplicate'],
  };
  return values[status] || values.queued;
}

function updateExtractButton() {
  elements['extract-button'].disabled = !apiKey.trim() || verifiedKey !== apiKey ||
    !queuedFiles.some(item => item.status === 'queued') || activeRequests > 0;
}

function resetVerification() {
  verificationSequence += 1;
  if (verificationController) verificationController.abort();
  verificationController = null;
  verifiedKey = '';
  isVerifying = false;
  elements['verify-key'].disabled = false;
  elements['verify-key'].textContent = 'Verify';
  elements['verification-message'].textContent = '';
  elements['verification-message'].hidden = true;
  elements['verification-message'].classList.remove('is-error');
  elements['verification-waking'].hidden = true;
  elements['organization-header'].textContent = '';
  elements['organization-header'].hidden = true;
}

function setVerificationMessage(message, isError = false) {
  const target = elements['verification-message'];
  target.textContent = message;
  target.classList.toggle('is-error', isError);
  target.hidden = !message;
}

async function verifyAccessKey() {
  const key = apiKey.trim();
  if (!key || isVerifying || verifiedKey === key) return;

  const sequence = ++verificationSequence;
  isVerifying = true;
  const controller = new AbortController();
  verificationController = controller;
  elements['verify-key'].disabled = true;
  elements['verify-key'].textContent = 'Verifying…';
  setVerificationMessage('');
  elements['verification-waking'].hidden = true;
  updateExtractButton();

  let wakingTimer;
  const timeoutTimer = window.setTimeout(() => controller.abort(), 60 * 1000);
  wakingTimer = window.setTimeout(() => {
    if (sequence === verificationSequence) elements['verification-waking'].hidden = false;
  }, 8000);

  try {
    let name;
    if (USE_MOCK) {
      name = 'Demo Organization';
    } else {
      const response = await fetch(`${API_BASE}/me`, {
        method: 'GET',
        headers: { 'x-api-key': key },
        signal: controller.signal,
      });
      if (response.status === 401) {
        if (sequence === verificationSequence) setVerificationMessage("That access key isn't valid. Check it and try again.", true);
        return;
      }
      if (response.status === 429) {
        if (sequence === verificationSequence) setVerificationMessage('Too many attempts, wait a minute and try again.', true);
        return;
      }
      if (!response.ok) {
        if (sequence === verificationSequence) setVerificationMessage('Unable to verify access key. Please try again.', true);
        return;
      }
      const data = await response.json();
      if (!data || typeof data.organization_name !== 'string' || !data.organization_name.trim()) {
        if (sequence === verificationSequence) setVerificationMessage('Unable to verify access key. Please try again.', true);
        return;
      }
      name = data.organization_name;
    }

    if (sequence !== verificationSequence) return;
    verifiedKey = apiKey;
    setVerificationMessage(`Connected as ${name}`);
    elements['organization-header'].textContent = `Connected as ${name}`;
    elements['organization-header'].hidden = false;
  } catch (error) {
    if (sequence !== verificationSequence) return;
    setVerificationMessage("Couldn't reach the server. It may be waking up, try again in a moment.", true);
  } finally {
    window.clearTimeout(timeoutTimer);
    window.clearTimeout(wakingTimer);
    if (sequence === verificationSequence) {
      isVerifying = false;
      verificationController = null;
      elements['verify-key'].disabled = false;
      elements['verify-key'].textContent = 'Verify';
      elements['verification-waking'].hidden = true;
      updateExtractButton();
    }
  }
}

function handleFileListClick(event) {
  const retry = event.target.closest('[data-retry]');
  const remove = event.target.closest('[data-remove-file]');
  if (retry) {
    const item = queuedFiles.find(file => file.id === retry.dataset.retry);
    if (item) processFile(item);
  } else if (remove) {
    queuedFiles = queuedFiles.filter(file => file.id !== remove.dataset.removeFile);
    renderFiles();
    updateExtractButton();
  }
}

async function extractQueuedFiles() {
  if (!apiKey.trim()) {
    elements['api-key'].focus();
    return;
  }
  const files = queuedFiles.filter(item => item.status === 'queued');
  await Promise.allSettled(files.map(processFile));
}

async function processFile(item) {
  if (item.status === 'processing') return;
  item.status = 'processing';
  item.error = '';
  activeRequests += 1;
  renderFiles();
  updateExtractButton();

  let wakeTimer;
  let elapsedTimer;
  let wakeShown = false;
  const startedAt = Date.now();
  elapsedTimer = window.setTimeout(() => {
    wakeShown = true;
    elements['waking-message'].hidden = false;
  }, 8000);
  wakeTimer = setInterval(() => {
    if (wakeShown && Date.now() - startedAt > 8000) elements['waking-message'].hidden = false;
  }, 1000);

  try {
    const profile = elements.profile.value.trim();
    const docs = USE_MOCK
      ? normalizeResponse(await mockRequest(item), item.file.name)
      : await sendDocument(item.file, profile);
    item.results = docs;
    results.push(...docs);
    const statuses = docs.map(document => normalizeStatus(document.status));
    item.status = statuses.includes('needs_review') ? 'needs_review'
      : statuses.includes('duplicate') ? 'duplicate'
        : 'done';
    renderResults();
  } catch (error) {
    item.status = 'failed';
    item.error = error.message || 'Unable to process this file.';
  } finally {
    window.clearTimeout(elapsedTimer);
    clearInterval(wakeTimer);
    activeRequests -= 1;
    elements['waking-message'].hidden = activeRequests === 0;
    renderFiles();
    updateExtractButton();
  }
}

// All backend-specific field names are centralized here to simplify adapting the contract.
function mapDocument(source, filename, index) {
  const value = source && typeof source === 'object' ? source : {};
  return {
    row_id: `result-${Date.now()}-${++requestSequence}-${index}`,
    source_filename: filename,
    vendor_name: value.vendor_name ?? '',
    document_type: value.document_type ?? '',
    document_number: value.document_number ?? '',
    document_date: value.document_date ?? '',
    due_date: value.due_date ?? '',
    po_number: value.po_number ?? '',
    currency: value.currency ?? '',
    subtotal: numericOrBlank(value.subtotal),
    tax: numericOrBlank(value.tax),
    total_amount: numericOrBlank(value.total_amount),
    balance_due: numericOrBlank(value.balance_due),
    status: value.status ?? '',
    review_reasons: Array.isArray(value.review_reasons) ? value.review_reasons : [],
    line_items: Array.isArray(value.line_items) ? value.line_items.map(mapLineItem) : [],
  };
}

function mapLineItem(source, index) {
  const value = source && typeof source === 'object' ? source : {};
  return {
    line_number: numericOrBlank(value.line_number),
    item_code: value.item_code ?? '',
    description: value.description ?? '',
    quantity: numericOrBlank(value.quantity),
    unit_price: numericOrBlank(value.unit_price),
    unit_of_measure: value.unit_of_measure ?? '',
    amount: numericOrBlank(value.amount),
    tax_amount: numericOrBlank(value.tax_amount),
    _key: `line-${index}`,
  };
}

function normalizeResponse(body, filename) {
  if (Array.isArray(body.data)) return body.data.map((document, index) => mapDocument(document, filename, index));
  if (body.data && typeof body.data === 'object') return [mapDocument(body.data, filename, 0)];
  throw new Error(body.message || 'The service returned no document data.');
}

async function sendDocument(file, profile) {
  const form = new FormData();
  form.append('file', file);
  form.append('profile', profile);
  const response = await fetch(`${API_BASE}/webhooks/process-invoice`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Idempotency-Key': generateUUID(),
    },
    body: form,
  });
  const body = await readResponseBody(response);

  if (!response.ok) throw apiError(response.status, body);
  if (body && typeof body === 'object' && body.job_id && !('data' in body)) {
    const completed = await pollJob(body.job_id);
    return normalizeResponse(completed, file.name);
  }
  return normalizeResponse(body || {}, file.name);
}

async function readResponseBody(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function apiError(status, body) {
  const messages = {
    401: 'Invalid access key',
    413: 'File too large',
    422: 'Unsupported or unreadable file',
    429: 'Too many requests, wait a minute and retry',
    400: 'Unable to process this file. Please check it and retry.',
  };
  const message = messages[status] || 'Unable to process this file. Please try again.';
  const detail = body && typeof body.message === 'string' ? body.message
    : body && Array.isArray(body.message) ? body.message.filter(Boolean).join(', ')
      : '';
  return new Error(detail && ![401, 413, 422, 429].includes(status) ? `${message} ${detail}` : message);
}

async function pollJob(jobId) {
  const startedAt = Date.now();
  // TODO: Adapt terminal-state detection and result extraction once the job polling response schema is confirmed.
  while (Date.now() - startedAt < MAX_POLL_TIME_MS) {
    await delay(POLL_INTERVAL_MS);
    const response = await fetch(`${API_BASE}/jobs/${encodeURIComponent(jobId)}`, {
      headers: { 'x-api-key': apiKey },
    });
    const body = await readResponseBody(response);
    if (!response.ok) throw apiError(response.status, body);
    if (body.data !== undefined) return body;
    const status = String(body.status || '').toLowerCase();
    if (['failed', 'error'].includes(status)) {
      throw new Error(body.message || 'Document processing failed.');
    }
    if (['done', 'complete', 'completed', 'success', 'succeeded'].includes(status)) {
      const data = body.result ?? body.output ?? body.documents;
      if (data !== undefined) return { data };
      throw new Error('The job finished but returned no document data.');
    }
  }
  throw new Error('Document processing timed out after 5 minutes.');
}

function generateUUID() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return Array.from(bytes, (byte, index) =>
    ([4, 6, 8, 10].includes(index) ? '-' : '') + byte.toString(16).padStart(2, '0'),
  ).join('');
}

async function mockRequest(item) {
  const scenario = mockRequestIndex++ % 4;
  await delay(1500);
  if (scenario === 3) throw new Error(apiError(422, { message: 'Simulated unsupported or unreadable file.' }).message);
  const clean = sampleDocument('Northstar Office Supply', 'INV-2026-1042', '2026-09-18', 1284.5);
  if (scenario === 0) return { data: clean };
  if (scenario === 1) {
    return { data: {
      ...sampleDocument('Harbor & Pine Services', 'HP-8821', '2026-09-12', 928.75),
      status: 'needs_review',
      review_reasons: ['Invoice date is faint and may need confirmation.', 'Tax amount differs from the line item total.'],
    } };
  }
  return { data: [
    sampleDocument('Cedarstone Materials', 'CS-24019', '2026-09-15', 643.2),
    sampleDocument('Cedarstone Materials', 'CS-24020', '2026-09-16', 211.6),
  ] };
}

function sampleDocument(vendor, number, date, total) {
  return {
    vendor_name: vendor,
    document_type: 'Invoice',
    document_number: number,
    document_date: date,
    due_date: '',
    po_number: '',
    currency: 'USD',
    subtotal: total,
    tax: 0,
    total_amount: total,
    balance_due: total,
    status: 'processed',
    review_reasons: [],
    line_items: [
      { line_number: 1, item_code: 'SVC-01', description: 'Professional services', quantity: 1, unit_price: total, unit_of_measure: 'service', amount: total, tax_amount: 0 },
    ],
  };
}

function normalizeStatus(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'needs_review') return 'needs_review';
  if (value === 'duplicate') return 'duplicate';
  if (value === 'failed' || value === 'error') return 'failed';
  return 'done';
}

function renderResults() {
  const visible = results.length > 0;
  elements['results-section'].hidden = !visible;
  elements['export-section'].hidden = !visible;
  elements['empty-state'].hidden = visible;
  elements['document-count'].textContent = `${results.length} document${results.length === 1 ? '' : 's'}`;
  elements['results-empty'].hidden = visible;

  if (!visible) {
    elements['results-table-wrap'].innerHTML = '';
    return;
  }

  const columns = [
    ['vendor_name', 'Vendor', 'text'],
    ['document_type', 'Type', 'text'],
    ['document_number', 'Number', 'text'],
    ['document_date', 'Date', 'date'],
    ['due_date', 'Due date', 'date'],
    ['po_number', 'PO', 'text'],
    ['currency', 'Currency', 'text'],
    ['subtotal', 'Subtotal', 'number'],
    ['tax', 'Tax', 'number'],
    ['total_amount', 'Total', 'number'],
    ['balance_due', 'Balance due', 'number'],
    ['status', 'Status', 'text'],
  ];

  elements['results-table-wrap'].innerHTML = `<table class="documents-table">
    <thead><tr>${columns.map(([, label]) => `<th>${label}</th>`).join('')}<th>Details</th></tr></thead>
    <tbody>${results.map((document, index) => renderDocumentRows(document, index, columns)).join('')}</tbody>
  </table>`;
}

function renderDocumentRows(document, index, columns) {
  const needsReview = normalizeStatus(document.status) === 'needs_review';
  const reasonText = document.review_reasons.join(' · ');
  const main = `<tr class="document-row ${needsReview ? 'needs-review' : ''}">
    ${columns.map(([field, , type]) => {
      const value = document[field];
      const emptyHighlight = (field === 'total_amount' || field === 'document_date') && (value === '' || value === null || value === undefined);
      const shown = value === null || value === undefined ? '' : value;
      return `<td><input class="cell-input ${type === 'number' ? 'numeric' : ''} ${emptyHighlight ? 'is-empty' : ''}" type="${type}" ${type === 'number' ? 'step="any"' : ''} aria-label="${fieldLabel(field)}" data-doc-index="${index}" data-doc-field="${field}" value="${escapeHtml(shown)}"></td>`;
    }).join('')}
    <td class="row-tools"><button class="row-tool" type="button" data-toggle-lines="${index}" aria-expanded="false">Line items</button>${needsReview ? `<button class="row-tool" type="button" data-toggle-reasons="${index}" aria-expanded="false" title="${escapeHtml(reasonText)}">Review notes</button>` : ''}</td>
  </tr>`;
  const reasons = needsReview
    ? `<tr class="detail-row reasons-row" data-reasons-row="${index}" hidden><td colspan="${columns.length + 1}"><div class="row-note"><strong>Review reasons:</strong> ${escapeHtml(reasonText || 'No review reasons provided.')}</div></td></tr>`
    : '';
  const lines = `<tr class="detail-row line-row" data-lines-row="${index}" hidden><td colspan="${columns.length + 1}">${renderLineItems(document.line_items)}</td></tr>`;
  return main + reasons + lines;
}

function renderLineItems(lines) {
  const fields = [
    ['line_number', 'Line #'], ['item_code', 'Item code'], ['description', 'Description'],
    ['quantity', 'Quantity'], ['unit_price', 'Unit price'], ['unit_of_measure', 'Unit'],
    ['amount', 'Amount'], ['tax_amount', 'Tax amount'],
  ];
  if (!lines.length) return '<p class="row-note">No line items returned.</p>';
  return `<table class="line-table"><thead><tr>${fields.map(([, label]) => `<th>${label}</th>`).join('')}</tr></thead><tbody>
    ${lines.map(line => `<tr>${fields.map(([field]) => `<td>${escapeHtml(line[field] === null || line[field] === undefined ? '' : line[field])}</td>`).join('')}</tr>`).join('')}
  </tbody></table>`;
}

function handleResultEdit(event) {
  const input = event.target.closest('[data-doc-index][data-doc-field]');
  if (!input) return;
  const index = Number(input.dataset.docIndex);
  const field = input.dataset.docField;
  if (!results[index]) return;
  results[index][field] = input.type === 'number'
    ? (input.value === '' ? '' : Number(input.value))
    : input.value;
  if (field === 'status') renderResults();
}

function handleResultAction(event) {
  const lines = event.target.closest('[data-toggle-lines]');
  const reasons = event.target.closest('[data-toggle-reasons]');
  if (lines) {
    const row = document.querySelector(`[data-lines-row="${lines.dataset.toggleLines}"]`);
    row.hidden = !row.hidden;
    lines.setAttribute('aria-expanded', String(!row.hidden));
  } else if (reasons) {
    const row = document.querySelector(`[data-reasons-row="${reasons.dataset.toggleReasons}"]`);
    row.hidden = !row.hidden;
    reasons.setAttribute('aria-expanded', String(!row.hidden));
  }
}

function exportResults(format) {
  if (!results.length || !window.XLSX) {
    showValidation('Spreadsheet export is unavailable. Check your internet connection and try again.');
    return;
  }
  const documentRows = results.map(document => ({
    Vendor: valueOrBlank(document.vendor_name),
    Type: valueOrBlank(document.document_type),
    Number: valueOrBlank(document.document_number),
    Date: valueOrBlank(document.document_date),
    'Due date': valueOrBlank(document.due_date),
    PO: valueOrBlank(document.po_number),
    Currency: valueOrBlank(document.currency),
    Subtotal: numericOrBlank(document.subtotal),
    Tax: numericOrBlank(document.tax),
    Total: numericOrBlank(document.total_amount),
    'Balance due': numericOrBlank(document.balance_due),
    Status: valueOrBlank(document.status),
    'Source filename': valueOrBlank(document.source_filename),
  }));

  const lineRows = results.flatMap(document => document.line_items.map(line => ({
    'Document number': valueOrBlank(document.document_number),
    'Source filename': valueOrBlank(document.source_filename),
    'Line number': numericOrBlank(line.line_number),
    'Item code': valueOrBlank(line.item_code),
    Description: valueOrBlank(line.description),
    Quantity: numericOrBlank(line.quantity),
    'Unit price': numericOrBlank(line.unit_price),
    'Unit of measure': valueOrBlank(line.unit_of_measure),
    Amount: numericOrBlank(line.amount),
    'Tax amount': numericOrBlank(line.tax_amount),
  })));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(documentRows), 'Documents');
  if (format === 'xlsx') XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(lineRows), 'Line items');
  downloadWorkbook(workbook, format);
}

function downloadWorkbook(workbook, format) {
  const content = XLSX.write(workbook, { bookType: format, type: 'array' });
  const blob = new Blob([content], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `magicheart-nexus-${new Date().toISOString().slice(0, 10)}.${format}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function valueOrBlank(value) {
  return value === null || value === undefined ? '' : value;
}

function numericOrBlank(value) {
  return value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? '' : Number(value);
}

function fieldLabel(field) {
  return field.replaceAll('_', ' ');
}

function formatBytes(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function delay(milliseconds) {
  return new Promise(resolve => window.setTimeout(resolve, milliseconds));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}
