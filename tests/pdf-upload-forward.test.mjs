import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { prepareUpstreamBody } from '../lib/server/prepare-upstream-body.ts';

const fixtureUrl = new URL('./fixtures/invoice.pdf', import.meta.url);

function captureInfo(run) {
  const lines = [];
  const original = console.info;
  console.info = (...args) => {
    lines.push(args.map((value) => String(value)).join(' '));
  };
  return Promise.resolve()
    .then(run)
    .finally(() => {
      console.info = original;
    })
    .then((result) => ({ result, lines }));
}

function forwardBody(contentType, body) {
  return new Promise((resolve, reject) => {
    const server = createServer((incoming, response) => {
      const chunks = [];
      incoming.on('data', (chunk) => chunks.push(chunk));
      incoming.on('end', () => {
        response.writeHead(204);
        response.end();
        server.close();
        resolve({
          body: Buffer.concat(chunks),
          contentType: incoming.headers['content-type'] ?? '',
        });
      });
      incoming.on('error', reject);
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Test server did not bind to a port.'));
        return;
      }
      fetch(`http://127.0.0.1:${address.port}/webhooks/process-invoice`, {
        method: 'POST',
        headers: { 'content-type': contentType },
        body,
      }).then((response) => {
        if (!response.ok && response.status !== 204) {
          reject(new Error(`Forward failed with status ${response.status}.`));
        }
      }, (error) => {
        server.close();
        reject(error);
      });
    });
    server.on('error', reject);
  });
}

test('forwards a real PDF fixture with identical bytes', async () => {
  const pdf = await readFile(fixtureUrl);
  assert.equal(pdf.subarray(0, 8).toString('latin1'), '%PDF-1.4');
  assert.equal(pdf.includes(Buffer.from('startxref')), true);
  assert.equal(pdf.subarray(pdf.length - 6).toString('latin1'), '%%EOF\n');
  assert.equal(Buffer.from(pdf.toString('utf8'), 'utf8').equals(pdf), false);

  const form = new FormData();
  form.append('file', new File([pdf], 'invoice.pdf', { type: 'application/pdf' }));
  form.append('note', 'workspace-secret-field');
  const clientRequest = new Request('https://frontend.local/api/backend/webhooks/process-invoice', {
    method: 'POST',
    body: form,
  });
  const originalBody = Buffer.from(await clientRequest.clone().arrayBuffer());
  const originalType = clientRequest.headers.get('content-type');
  assert.equal(originalType?.toLowerCase().startsWith('multipart/form-data'), true);

  const { result: prepared, lines } = await captureInfo(() => prepareUpstreamBody(clientRequest));
  assert.equal(prepared.contentType, originalType);
  assert.equal(Buffer.from(prepared.body).equals(originalBody), true);

  const received = await forwardBody(prepared.contentType, prepared.body);
  assert.equal(received.contentType, originalType);
  assert.equal(received.body.equals(originalBody), true);

  const forwarded = new Request('https://backend.local/webhooks/process-invoice', {
    method: 'POST',
    headers: { 'content-type': received.contentType },
    body: received.body,
  });
  const parsed = await forwarded.formData();
  const uploaded = parsed.get('file');
  assert.equal(typeof uploaded, 'object');
  assert.equal(uploaded.name, 'invoice.pdf');
  assert.equal(uploaded.type, 'application/pdf');
  const uploadedBytes = Buffer.from(await uploaded.arrayBuffer());
  assert.equal(uploadedBytes.equals(pdf), true);
  assert.equal(parsed.get('note'), 'workspace-secret-field');

  const log = lines.join('\n');
  assert.match(log, new RegExp(`bytes=${pdf.length}`));
  assert.match(log, /prefix=37,80,68,70,45/);
  assert.match(log, /filename="invoice.pdf"/);
  assert.match(log, /content-type="application\/pdf"/);
  assert.equal(log.includes('DO_NOT_LOG_PDF_BODY'), false);
  assert.equal(log.includes('workspace-secret-field'), false);
  assert.equal(log.includes(pdf.toString('latin1')), false);
});

test('upload proxy does not rebuild multipart bodies or read them as text', async () => {
  const route = await readFile(new URL('../app/api/backend/[...segments]/route.ts', import.meta.url), 'utf8');
  const helper = await readFile(new URL('../lib/server/prepare-upstream-body.ts', import.meta.url), 'utf8');
  assert.match(route, /prepareUpstreamBody\(request\)/);
  assert.match(route, /body: upstreamBody\.body/);
  assert.doesNotMatch(route, /new FormData|\.text\(|toString\('utf8'\)/);
  assert.doesNotMatch(helper, /\.text\(|toString\('utf8'\)|TextEncoder|TextDecoder/);
});
