import type { FieldKind } from '@/lib/invoice-review/fields';
import type { FieldMeta, InvoiceReviewStatus } from '@/lib/invoice-review/types';

const STATUS_LABELS: Record<InvoiceReviewStatus, string> = {
  needs_review: 'Needs review',
  approved: 'Approved',
  rejected: 'Rejected',
};

export function confidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 0.85) return 'high';
  if (confidence >= 0.6) return 'medium';
  return 'low';
}

export function flaggedFieldCount(fieldMeta: Record<string, FieldMeta>) {
  return Object.values(fieldMeta).filter((meta) => meta.needs_review).length;
}

export function statusLabel(status: InvoiceReviewStatus) {
  return STATUS_LABELS[status];
}

export function formatDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || '—';
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatMoney(value: number, currency = 'USD') {
  const amount = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(amount);
  }
}

export function formatNumber(value: number) {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

export function formatFieldValue(kind: FieldKind, raw: string, currency: string) {
  if (raw === '') return '—';
  if (kind === 'date') return formatDate(raw);
  if (kind === 'money') return formatMoney(Number(raw), currency);
  if (kind === 'number') return formatNumber(Number(raw));
  return raw;
}
