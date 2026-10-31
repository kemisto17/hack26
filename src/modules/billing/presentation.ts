/**
 * Exact money presentation. Amounts stay bigint/strings end to end; no
 * floating-point conversion is ever used to display or collect money.
 */
import { invalid, parseMinor } from "./domain";
import type { InvoiceStatus, Minor, PaymentMethod } from "./contracts";
import { INVOICE_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "./contracts";

/**
 * ISO 4217 minor-unit exponents used for display/entry. The database stores
 * minor units; an unsupported code defaults to two decimals and is labelled
 * with its own currency code. This is formatting, not a pricing engine.
 */
const EXPONENTS: Record<string, number> = {
  BHD: 3,
  BIF: 0,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  IQD: 3,
  ISK: 0,
  JOD: 3,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  PYG: 0,
  RWF: 0,
  TND: 3,
  UGX: 0,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
};

export function currencyExponent(currency: string): number {
  if (!/^[A-Z]{3}$/.test(currency)) invalid("Invalid currency.");
  return EXPONENTS[currency] ?? 2;
}

export function formatMoney(value: Minor, currency: string): string {
  const exponent = currencyExponent(currency);
  const amount = parseMinor(value, { allowZero: true, field: "amount_minor" });
  const digits = amount.toString().padStart(exponent + 1, "0");
  const whole = digits.slice(0, digits.length - exponent);
  const fraction = exponent === 0 ? "" : `.${digits.slice(-exponent)}`;
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction} ${currency}`;
}

/**
 * Convert an operator-entered decimal amount to an integer minor-unit string.
 * Rejects precision the currency cannot represent instead of rounding money
 * silently. Use this only for form input; the server revalidates everything.
 */
export function parseMoneyToMinor(value: string, currency: string): Minor {
  const exponent = currencyExponent(currency);
  const text = value.trim();
  const match = /^(\d{1,19})(?:\.(\d{0,9}))?$/.exec(text);
  if (!match) invalid("Enter a nonnegative amount with a decimal point.");
  const whole = match[1];
  const fraction = match[2] ?? "";
  if (fraction.length > exponent) {
    invalid(`${currency} amounts support at most ${exponent} decimal place${exponent === 1 ? "" : "s"}.`);
  }
  const padded = fraction.padEnd(exponent, "0");
  const minor = parseMinor(`${whole}${padded}`, { allowZero: true, field: "amount_minor" });
  return minor.toString();
}

export function invoiceStatusLabel(status: InvoiceStatus): string {
  return INVOICE_STATUS_LABELS[status];
}

export function paymentMethodLabel(method: PaymentMethod): string {
  return PAYMENT_METHOD_LABELS[method];
}

export function formatUtcDate(value: string): string {
  if (!/^\d{4}-\d\d-\d\d$/.test(value)) return value;
  return value;
}

export function formatUtcInstant(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? `${date.toISOString().slice(0, 19).replace("T", " ")} UTC` : value;
}
