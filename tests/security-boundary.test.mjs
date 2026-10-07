import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const browserFiles = [
  'app/page.tsx',
  'app/upload/page.tsx',
  'app/invoices/page.tsx',
  'components/app-frame.tsx',
  'components/layout.tsx',
  'components/workspace-setup-notice.tsx',
  'components/workspace-provider.tsx',
  'app/login/page.tsx',
  'app.js',
  'index.html',
];

const source = await Promise.all(browserFiles.map(file => readFile(new URL(`../${file}`, import.meta.url), 'utf8')));
const browserSource = source.join('\n');

test('browser-facing source uses only the same-origin backend-for-frontend', () => {
  assert.match(source[1], /fetch\('\/api\/backend\/webhooks\/process-invoice'/);
  assert.match(source[2], /fetch\(`\/api\/backend\/documents/);
  assert.match(browserSource, /\/api\/organizations/);
  assert.doesNotMatch(browserSource, /https?:\/\/|XMLHttpRequest|axios\./i);
  assert.doesNotMatch(browserSource, /ghost-business\.onrender\.com|localhost:3000|ngrok/i);
});

test('browser-facing source never collects or sends organization API keys', () => {
  assert.doesNotMatch(browserSource, /x-api-key|api-key|NEXT_PUBLIC_API_BASE_URL/i);
  assert.match(browserSource, /type="password"/);
  assert.doesNotMatch(browserSource, /BACKEND_ORG_API_KEYS|SUPABASE_SERVICE_ROLE_KEY/i);
});

test('server-side proxy authorizes organization membership before attaching its backend key', async () => {
  const proxy = await readFile(new URL('../app/api/backend/[...segments]/route.ts', import.meta.url), 'utf8');
  const access = await readFile(new URL('../lib/server/organization-access.ts', import.meta.url), 'utf8');
  assert.match(proxy, /authorizeOrganization\(user\.id, organizationId\)/);
  assert.match(proxy, /headers\.set\('x-api-key', apiKey\)/);
  assert.match(access, /\.eq\('user_id', userId\)/);
  assert.match(access, /\.eq\('organization_id', organizationId\)/);
  assert.match(access, /process\.env\.BACKEND_ORG_API_KEYS/);
});

test('production client bundles contain no backend URLs or API-key configuration', async context => {
  const staticDirectory = new URL('../.next/static/', import.meta.url);
  try {
    await access(staticDirectory);
  } catch {
    context.skip('Run npm run build first to inspect production client bundles.');
    return;
  }

  async function collectFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(entries.map(entry => {
      const path = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory);
      return entry.isDirectory() ? collectFiles(path) : [path];
    }));
    return nested.flat();
  }

  const bundles = await Promise.all((await collectFiles(staticDirectory)).map(file => readFile(file, 'utf8')));
  assert.doesNotMatch(bundles.join('\n'), /ghost-business\.onrender\.com|x-api-key|NEXT_PUBLIC_API_BASE_URL|localhost:3000|ngrok/i);
});

test('upload and archive are gated on verified organization access', () => {
  assert.match(source[1], /status === 'ready'/);
  assert.match(source[1], /form\.append\('file'/);
  assert.match(source[2], /workspaceStatus === 'ready'/);
  assert.match(source[2], /x-organization-id/);
  assert.doesNotMatch(source[1] + source[2], /<input[^>]*(organization|org.?id)/i);
});

test('invite acceptance sets a password only after a verified Supabase session', async () => {
  const callback = await readFile(new URL('../app/auth/callback/route.ts', import.meta.url), 'utf8');
  const setPassword = await readFile(new URL('../app/api/auth/set-password/route.ts', import.meta.url), 'utf8');
  const passwordPage = await readFile(new URL('../app/set-password/page.tsx', import.meta.url), 'utf8');
  const middleware = await readFile(new URL('../middleware.ts', import.meta.url), 'utf8');
  assert.match(callback, /exchangeCodeForSession\(code\)/);
  assert.match(callback, /verifyOtp\([\s\S]*type: 'invite'/);
  assert.match(callback, /new URL\('\/set-password'/);
  assert.match(setPassword, /supabase\.auth\.getUser\(\)/);
  assert.match(setPassword, /supabase\.auth\.updateUser\(\{\s*password:/);
  assert.match(passwordPage, /\/api\/auth\/set-password/);
  assert.match(middleware, /hasInviteCallback/);
});
