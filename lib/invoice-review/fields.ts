export type FieldKind = 'text' | 'long' | 'date' | 'money' | 'number' | 'category';

export type ReviewFieldDefinition = {
  path: string;
  label: string;
  kind: FieldKind;
  emphasize?: boolean;
};

export const invoiceDetailFields: ReviewFieldDefinition[] = [
  { path: 'invoice.number', label: 'Number', kind: 'text' },
  { path: 'invoice.invoice_date', label: 'Invoice date', kind: 'date' },
  { path: 'invoice.due_date', label: 'Due date', kind: 'date' },
  { path: 'invoice.terms', label: 'Terms', kind: 'text' },
  { path: 'invoice.work_order_number', label: 'Work order #', kind: 'text' },
  { path: 'invoice.po_number', label: 'PO #', kind: 'text' },
  { path: 'invoice.service_date', label: 'Service date', kind: 'date' },
];

export const vendorFields: ReviewFieldDefinition[] = [
  { path: 'vendor.name', label: 'Name', kind: 'text' },
  { path: 'vendor.address', label: 'Address', kind: 'long' },
  { path: 'vendor.phone', label: 'Phone', kind: 'text' },
  { path: 'vendor.email', label: 'Email', kind: 'text' },
];

export const billToFields: ReviewFieldDefinition[] = [
  { path: 'bill_to.name', label: 'Name', kind: 'text' },
  { path: 'bill_to.attention', label: 'Attention', kind: 'text' },
  { path: 'bill_to.address', label: 'Address', kind: 'long' },
];

export const propertyFields: ReviewFieldDefinition[] = [
  { path: 'property.name', label: 'Property name', kind: 'text' },
  { path: 'property.address', label: 'Address', kind: 'long' },
  { path: 'property.unit', label: 'Unit', kind: 'text' },
  { path: 'work_description', label: 'Work description', kind: 'long' },
];

export const totalFields: ReviewFieldDefinition[] = [
  { path: 'totals.subtotal', label: 'Subtotal', kind: 'money' },
  { path: 'totals.tax_description', label: 'Tax description', kind: 'text' },
  { path: 'totals.tax_amount', label: 'Tax amount', kind: 'money' },
  { path: 'totals.total_due', label: 'Total due', kind: 'money', emphasize: true },
];

export const remitFields: ReviewFieldDefinition[] = [
  { path: 'remit_to.name', label: 'Name', kind: 'text' },
  { path: 'remit_to.address', label: 'Address', kind: 'long' },
  { path: 'remit_to.payment_notes', label: 'Payment notes', kind: 'long' },
  { path: 'late_fee_terms', label: 'Late fee terms', kind: 'long' },
];

export const lineItemColumns: ReviewFieldDefinition[] = [
  { path: 'description', label: 'Description', kind: 'text' },
  { path: 'category', label: 'Category', kind: 'category' },
  { path: 'quantity', label: 'Quantity', kind: 'number' },
  { path: 'unit_price', label: 'Unit price', kind: 'money' },
  { path: 'amount', label: 'Amount', kind: 'money' },
];

export const scalarReviewFields: ReviewFieldDefinition[] = [
  ...invoiceDetailFields,
  ...vendorFields,
  ...billToFields,
  ...propertyFields,
  ...totalFields,
  ...remitFields,
];

export function lineItemPath(index: number, key: string) {
  return `line_items.${index}.${key}`;
}
