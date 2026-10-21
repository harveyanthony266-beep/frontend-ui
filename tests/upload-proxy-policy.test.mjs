import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { POST } from '../app/api/backend/[...segments]/route.ts';
import { AUTHORIZED_ORGANIZATION_ID, SERVER_ORG_API_KEY } from './stubs/organization-access.mjs';

process.env.BACKEND_API_URL = 'http://127.0.0.1:9';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const uploadUrl = 'http://localhost/api/backend/webhooks/process-invoice';
const uploadContext = { params: { segments: ['webhooks', 'process-invoice'] } };
const browserFiles = [
  'app/page.tsx',
  'app/upload/page.tsx',
  'app/invoices/page.tsx',
  'app/review/page.tsx',
  'components/invoice-review/invoice-review-list.tsx',
  'components/invoice-review/invoice-review-row.tsx',
  'components/invoice-review/review-field.tsx',
  'components/invoice-review/source-preview.tsx',
  'lib/invoice-review/load.ts',
  'components/app-frame.tsx',
  'components/layout.tsx',
  'components/workspace-setup-notice.tsx',
  'components/workspace-provider.tsx',
  'app/login/page.tsx',
  'app.js',
  'index.html',
];

function copyBody(body) {
  if (body == null) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return Buffer.from(body);
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  }
  throw new Error(`Unexpected forwarded body type: ${typeof body}`);
}

async function callProxy(request, context, { allowNetwork = false } = {}) {
  const originalFetch = globalThis.fetch;
  const originalInfo = console.info;
  const calls = [];
  const logs = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({
      url: String(url),
      method: init.method,
      headers: new Headers(init.headers),
      body: copyBody(init.body),
    });
    if (!allowNetwork) {
      return new Response(JSON.stringify({ success: true, results: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return originalFetch(url, init);
  };
  console.info = (...args) => {
    logs.push(args.map((value) => String(value)).join(' '));
  };
  try {
    const response = await POST(request, context);
    const text = await response.text();
    return { response, text, calls, logs };
  } finally {
    globalThis.fetch = originalFetch;
    console.info = originalInfo;
  }
}

function jsonError(text) {
  const body = JSON.parse(text);
  assert.equal(typeof body.message, 'string');
  assert.equal(body.message.length > 0, true);
  assert.equal(body.details, null);
  return body;
}

async function multipartUpload(form, extraHeaders = {}) {
  const draft = new Request(uploadUrl, { method: 'POST', body: form });
  const contentType = draft.headers.get('content-type');
  const body = Buffer.from(await draft.arrayBuffer());
  return {
    body,
    contentType,
    request: new Request(uploadUrl, {
      method: 'POST',
      headers: {
        'content-type': contentType,
        'x-organization-id': AUTHORIZED_ORGANIZATION_ID,
        ...extraHeaders,
      },
      body,
    }),
  };
}

function rawMultipart(filename, type, contents) {
  const boundary = '----policy-boundary';
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body: Buffer.concat([head, contents, tail]),
  };
}

test('rejects a file over 25 MB and an upload of 11 files with a clear error', async () => {
  const page = await readFile(new URL('../app/upload/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /MAX_FILE_BYTES = 25 \* 1024 \* 1024/);
  assert.match(page, /MAX_FILES = 10/);
  assert.match(page, /exceeds the 25 MB per-file limit/);
  assert.match(page, /Choose no more than/);

  const oversized = rawMultipart(
    'huge.pdf',
    'application/pdf',
    Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(MAX_UPLOAD_BYTES + 1 - 5)]),
  );
  const tooBig = await callProxy(new Request(uploadUrl, {
    method: 'POST',
    headers: {
      'content-type': oversized.contentType,
      'x-organization-id': AUTHORIZED_ORGANIZATION_ID,
    },
    body: oversized.body,
  }), uploadContext);
  assert.equal(tooBig.response.status, 413);
  const tooBigBody = jsonError(tooBig.text);
  assert.equal(tooBigBody.error, 'Payload Too Large');
  assert.equal(tooBigBody.message, 'huge.pdf exceeds the 25 MB per-file limit.');
  assert.equal(tooBig.calls.length, 0);
  assert.equal(tooBig.logs.some((line) => line.includes('forwarding upload')), false);
  assert.equal(tooBig.text.includes(SERVER_ORG_API_KEY), false);

  const exact = rawMultipart('exact.pdf', 'application/pdf', Buffer.alloc(MAX_UPLOAD_BYTES, 0x25));
  const atLimit = await callProxy(new Request(uploadUrl, {
    method: 'POST',
    headers: {
      'content-type': exact.contentType,
      'x-organization-id': AUTHORIZED_ORGANIZATION_ID,
    },
    body: exact.body,
  }), uploadContext);
  assert.equal(atLimit.response.status, 200);
  assert.equal(atLimit.calls.length, 1);
  assert.equal(atLimit.logs.join('\n').includes('bytes=26214400'), true);

  const many = new FormData();
  for (let index = 0; index < 11; index += 1) {
    many.append('file', new File([`doc-${index}`], `doc-${index}.txt`, { type: 'text/plain' }));
  }
  const tooManyUpload = await multipartUpload(many);
  const tooMany = await callProxy(tooManyUpload.request, uploadContext);
  assert.equal(tooMany.response.status, 400);
  const tooManyBody = jsonError(tooMany.text);
  assert.equal(tooManyBody.error, 'Bad Request');
  assert.equal(tooManyBody.message, 'Choose no more than 10 files at a time.');
  assert.equal(tooMany.calls.length, 0);
  assert.equal(tooMany.text.includes(SERVER_ORG_API_KEY), false);

  const ten = new FormData();
  for (let index = 0; index < 10; index += 1) {
    ten.append('file', new File([`ok-${index}`], `ok-${index}.txt`, { type: 'text/plain' }));
  }
  const tenUpload = await multipartUpload(ten);
  const accepted = await callProxy(tenUpload.request, uploadContext);
  assert.equal(accepted.response.status, 200);
  assert.equal(accepted.calls.length, 1);
});

test('attaches the organization backend key server-side and keeps it out of the browser', async () => {
  const pdf = await readFile(new URL('./fixtures/invoice.pdf', import.meta.url));
  const form = new FormData();
  form.append('file', new File([pdf], 'invoice.pdf', { type: 'application/pdf' }));
  const upload = await multipartUpload(form, {
    'idempotency-key': 'idem-123',
    'x-api-key': 'browser-supplied-key',
  });
  const { response, text, calls } = await callProxy(upload.request, uploadContext);
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://127.0.0.1:9/webhooks/process-invoice');
  assert.equal(calls[0].headers.get('x-api-key'), SERVER_ORG_API_KEY);
  assert.equal(calls[0].headers.get('idempotency-key'), 'idem-123');
  assert.equal(calls[0].headers.get('x-organization-id'), null);
  assert.equal(calls[0].body.equals(upload.body), true);
  assert.equal(response.headers.get('x-api-key'), null);
  assert.equal(text.includes(SERVER_ORG_API_KEY), false);
  assert.equal(text.includes('browser-supplied-key'), false);

  const missingOrganization = await callProxy(new Request(uploadUrl, {
    method: 'POST',
    headers: { 'content-type': upload.contentType },
    body: upload.body,
  }), uploadContext);
  assert.equal(missingOrganization.response.status, 400);
  assert.equal(jsonError(missingOrganization.text).message, 'Select an organization first.');
  assert.equal(missingOrganization.calls.length, 0);

  const forbidden = await callProxy(new Request(uploadUrl, {
    method: 'POST',
    headers: {
      'content-type': upload.contentType,
      'x-organization-id': '22222222-2222-4222-8222-222222222222',
    },
    body: upload.body,
  }), uploadContext);
  assert.equal(forbidden.response.status, 403);
  assert.equal(forbidden.calls.length, 0);
  assert.equal(forbidden.text.includes(SERVER_ORG_API_KEY), false);

  const browserSource = (await Promise.all(browserFiles.map((file) => (
    readFile(new URL(`../${file}`, import.meta.url), 'utf8')
  )))).join('\n');
  assert.match(browserSource, /x-organization-id/);
  assert.doesNotMatch(browserSource, /x-api-key|BACKEND_ORG_API_KEYS|SUPABASE_SERVICE_ROLE_KEY|server-org-key-do-not-leak/i);
});

test('forwards a PDF, PNG, and XLSX upstream without changing their bytes', async () => {
  const pdf = await readFile(new URL('./fixtures/invoice.pdf', import.meta.url));
  const png = await readFile(new URL('./fixtures/pixel.png', import.meta.url));
  const xlsx = await readFile(new URL('./fixtures/ledger.xlsx', import.meta.url));
  assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-');
  assert.equal(png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), true);
  assert.equal(xlsx.subarray(0, 2).toString('latin1'), 'PK');

  const form = new FormData();
  form.append('file', new File([pdf], 'invoice.pdf', { type: 'application/pdf' }));
  form.append('file', new File([png], 'receipt.png', { type: 'image/png' }));
  form.append('file', new File([xlsx], 'ledger.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }));
  const upload = await multipartUpload(form, { 'idempotency-key': 'batch-1' });
  const { response, text, calls, logs } = await callProxy(upload.request, uploadContext);
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].headers.get('x-api-key'), SERVER_ORG_API_KEY);
  assert.equal(calls[0].headers.get('content-type'), upload.contentType);
  assert.equal(calls[0].body.equals(upload.body), true);
  assert.equal(text.includes(SERVER_ORG_API_KEY), false);

  const forwarded = new Request('http://backend.local/webhooks/process-invoice', {
    method: 'POST',
    headers: { 'content-type': calls[0].headers.get('content-type') },
    body: calls[0].body,
  });
  const parsed = await forwarded.formData();
  const files = parsed.getAll('file');
  assert.equal(files.length, 3);
  const expected = [
    ['invoice.pdf', 'application/pdf', pdf],
    ['receipt.png', 'image/png', png],
    ['ledger.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xlsx],
  ];
  for (let index = 0; index < expected.length; index += 1) {
    const [name, type, bytes] = expected[index];
    assert.equal(files[index].name, name);
    assert.equal(files[index].type, type);
    assert.equal(Buffer.from(await files[index].arrayBuffer()).equals(bytes), true);
  }

  const log = logs.join('\n');
  assert.match(log, new RegExp(`filename="invoice.pdf"[\\s\\S]*bytes=${pdf.length} prefix=37,80,68,70,45`));
  assert.match(log, new RegExp(`filename="receipt.png"[\\s\\S]*bytes=${png.length} prefix=137,80,78,71,13`));
  assert.match(log, new RegExp(`filename="ledger.xlsx"[\\s\\S]*bytes=${xlsx.length} prefix=80,75,3,4`));
  assert.equal(log.includes('DO_NOT_LOG_PDF_BODY'), false);
  assert.equal(log.includes('DO_NOT_LOG_XLSX_BODY'), false);
  assert.equal(log.includes(SERVER_ORG_API_KEY), false);
});

test('returns a clear 400 when an upload content type is missing or not multipart', async () => {
  const missingHeaders = new Request(uploadUrl, {
    method: 'POST',
    headers: { 'x-organization-id': AUTHORIZED_ORGANIZATION_ID },
    body: new Uint8Array([1, 2, 3, 4]),
  });
  assert.equal(missingHeaders.headers.get('content-type'), null);
  const missing = await callProxy(missingHeaders, uploadContext);
  assert.equal(missing.response.status, 400);
  const missingBody = jsonError(missing.text);
  assert.equal(missingBody.error, 'Bad Request');
  assert.equal(missingBody.message, 'Upload must use multipart form data.');
  assert.equal(missing.calls.length, 0);

  for (const contentType of ['application/json', 'text/plain', 'application/x-www-form-urlencoded']) {
    const rejected = await callProxy(new Request(uploadUrl, {
      method: 'POST',
      headers: {
        'content-type': contentType,
        'x-organization-id': AUTHORIZED_ORGANIZATION_ID,
      },
      body: contentType === 'application/json' ? '{"file":"invoice.pdf"}' : 'file=invoice.pdf',
    }), uploadContext);
    assert.equal(rejected.response.status, 400, contentType);
    assert.equal(jsonError(rejected.text).message, 'Upload must use multipart form data.');
    assert.equal(rejected.calls.length, 0, contentType);
  }

  const exportBody = JSON.stringify({ ids: ['doc-1'] });
  const exported = await callProxy(new Request('http://localhost/api/backend/documents/export', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-organization-id': AUTHORIZED_ORGANIZATION_ID,
    },
    body: exportBody,
  }), { params: { segments: ['documents', 'export'] } });
  assert.equal(exported.response.status, 200);
  assert.equal(exported.calls.length, 1);
  assert.equal(exported.calls[0].headers.get('content-type'), 'application/json');
  assert.equal(exported.calls[0].headers.get('x-api-key'), SERVER_ORG_API_KEY);
  assert.equal(exported.calls[0].body.toString('utf8'), exportBody);
});
