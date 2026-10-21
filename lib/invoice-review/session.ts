import { useSyncExternalStore } from 'react';
import type { VendorInvoice } from '@/lib/invoice-review/types';

const empty: VendorInvoice[] = [];
let organizationId = '';
let invoices: VendorInvoice[] = [];
let snapshot: VendorInvoice[] = empty;
const listeners = new Set<() => void>();

function emit() {
  snapshot = invoices.length ? invoices.slice() : empty;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

function getOrganization() {
  return organizationId;
}

export function rememberUploadedReviews(nextOrganizationId: string, nextInvoices: VendorInvoice[]) {
  if (!nextInvoices.length) return;
  if (organizationId !== nextOrganizationId) {
    organizationId = nextOrganizationId;
    invoices = [];
  }
  const incomingIds = new Set(nextInvoices.map((invoice) => invoice.document_id));
  invoices = [...nextInvoices, ...invoices.filter((invoice) => !incomingIds.has(invoice.document_id))];
  emit();
}

export function replaceUploadedReview(nextOrganizationId: string, invoice: VendorInvoice) {
  if (organizationId !== nextOrganizationId) return;
  invoices = invoices.map((item) => item.document_id === invoice.document_id ? invoice : item);
  emit();
}

export function removeUploadedReviews(nextOrganizationId: string, ids: string[]) {
  if (organizationId !== nextOrganizationId) return;
  const remove = new Set(ids);
  invoices = invoices.filter((invoice) => !remove.has(invoice.document_id));
  emit();
}

export function useUploadedReviews(activeOrganizationId: string) {
  const storedOrganization = useSyncExternalStore(subscribe, getOrganization, () => '');
  const storedInvoices = useSyncExternalStore(subscribe, getSnapshot, () => empty);
  if (storedOrganization !== activeOrganizationId) return empty;
  return storedInvoices;
}
