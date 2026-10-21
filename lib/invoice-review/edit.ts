import type { VendorInvoice } from '@/lib/invoice-review/types';

const NUMERIC_FIELDS = new Set(['quantity', 'unit_price', 'amount', 'subtotal', 'tax_amount', 'total_due']);

export function readPath(invoice: VendorInvoice, path: string) {
  const value = path.split('.').reduce<unknown>((current, part) => {
    if (current == null || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[part];
  }, invoice);
  if (value == null) return '';
  return String(value);
}

export function valuesMatch(path: string, next: string, original: string) {
  const leaf = path.split('.').pop() ?? '';
  if (!NUMERIC_FIELDS.has(leaf)) return next === original;
  const parsed = Number(next);
  return Number.isFinite(parsed) && String(parsed) === original;
}

export function writePath(invoice: VendorInvoice, path: string, raw: string): VendorInvoice {
  const next = structuredClone(invoice);
  const parts = path.split('.');
  let current: unknown = next;
  for (let index = 0; index < parts.length - 1; index += 1) {
    if (current == null || typeof current !== 'object') {
      throw new Error(`Cannot edit ${path}.`);
    }
    current = (current as Record<string, unknown>)[parts[index]];
  }
  if (current == null || typeof current !== 'object') {
    throw new Error(`Cannot edit ${path}.`);
  }
  const leaf = parts[parts.length - 1];
  const target = current as Record<string, unknown>;
  if (NUMERIC_FIELDS.has(leaf)) {
    const parsed = Number(raw);
    target[leaf] = Number.isFinite(parsed) ? parsed : 0;
  } else {
    target[leaf] = raw;
  }
  return next;
}
