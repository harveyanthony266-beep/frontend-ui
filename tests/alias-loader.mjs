const root = new URL('../', import.meta.url);

const stubs = new Map([
  ['server-only', new URL('./stubs/empty.mjs', import.meta.url)],
  ['@/lib/supabase/server', new URL('./stubs/supabase-server.mjs', import.meta.url)],
  ['@/lib/server/organization-access', new URL('./stubs/organization-access.mjs', import.meta.url)],
]);

export async function resolve(specifier, context, nextResolve) {
  const stub = stubs.get(specifier);
  if (stub) {
    return { url: stub.href, shortCircuit: true };
  }

  if (specifier === 'next/server') {
    return nextResolve('next/server.js', context);
  }

  if (specifier.startsWith('@/')) {
    const relative = specifier.slice(2);
    for (const suffix of ['.ts', '.tsx', '.mjs', '.js', '']) {
      const candidate = new URL(`${relative}${suffix}`, root);
      try {
        return await nextResolve(candidate.href, context);
      } catch {
        // Try the next extension.
      }
    }
  }

  return nextResolve(specifier, context);
}
