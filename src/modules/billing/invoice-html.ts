/** Escaped, self-contained printable invoice. No scripts or external assets. */
import type { InvoiceDTO } from "./contracts";
import { invoiceStatusLabel, formatMoney, formatUtcInstant } from "./presentation";
import { validateInvoice } from "./domain";

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, character => HTML_ESCAPES[character]);
}

function row(label: string, value: string, className = ""): string {
  return `<div class="row ${className}"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

/**
 * Render a historical invoice snapshot. Callers must authorize visibility; the
 * service does that. Printing never changes status or issued_at.
 */
export function renderInvoiceHtml(invoice: InvoiceDTO): string {
  validateInvoice(invoice, invoice.lines);
  const status = invoiceStatusLabel(invoice.status);
  // A cancelled draft is staff-only history: show CANCELLED alone rather than a
  // misleading second DRAFT banner. Printing never changes status.
  const draft = invoice.status === "draft";
  const title = `Invoice ${invoice.number}`;
  const billTo = invoice.customer_snapshot
    ? `<p>${escapeHtml(invoice.customer_snapshot.display_name)}<br>${escapeHtml(invoice.customer_snapshot.email)}</p>`
    : '<p class="muted">Billing contact is frozen when this invoice is confirmed.</p>';
  const lines = invoice.lines
    .map(
      line => `<tr>
        <td>${escapeHtml(line.description)}${line.variant_label ? `<span class="muted"><br>${escapeHtml(line.variant_label)}</span>` : ""}</td>
        <td class="numeric">${escapeHtml(line.quantity)}</td>
        <td class="numeric">${escapeHtml(formatMoney(line.unit_price_minor, invoice.currency))}</td>
        <td class="numeric">${escapeHtml(formatMoney(line.discount_minor, invoice.currency))}</td>
        <td class="numeric">${escapeHtml(line.tax_rate_bps / 100)}%</td>
        <td class="numeric">${escapeHtml(formatMoney(line.tax_minor, invoice.currency))}</td>
        <td class="numeric">${escapeHtml(formatMoney(line.amount_minor, invoice.currency))}</td>
      </tr>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light; }
  body { font-family: system-ui, sans-serif; margin: 2rem auto; max-width: 60rem; color: #111; line-height: 1.45; }
  header { display: flex; justify-content: space-between; gap: 2rem; border-bottom: 2px solid #111; padding-bottom: 1rem; }
  h1 { font-size: 2rem; margin: 0; }
  h2 { font-size: 1.1rem; margin: 1.5rem 0 .5rem; }
  .muted { color: #555; font-size: .9em; }
  .banner { border: 2px solid #8a4b00; background: #fff4e5; padding: .75rem 1rem; margin: 1rem 0; font-weight: 700; }
  .row { display: flex; gap: 1rem; justify-content: space-between; }
  dt { font-weight: 600; }
  dd { margin: 0; text-align: right; }
  table { width: 100%; border-collapse: collapse; margin-top: .5rem; }
  caption { text-align: left; font-weight: 700; padding-bottom: .4rem; }
  th, td { border-bottom: 1px solid #ccc; padding: .45rem .35rem; vertical-align: top; }
  th { text-align: left; background: #f4f4f4; }
  .numeric { text-align: right; white-space: nowrap; }
  tfoot th { text-align: right; }
  tfoot td { font-weight: 700; }
  .total { border-top: 2px solid #111; }
  footer { margin-top: 2rem; border-top: 1px solid #999; padding-top: .75rem; }
  @media print { body { margin: 0; max-width: none; } .no-print { display: none; } }
</style>
</head>
<body>
<header>
  <div>
    <h1>${escapeHtml(title)}</h1>
    <p class="muted">Issued by Brightloop</p>
  </div>
  <div>
    <div class="row"><dt>Status</dt><dd>${escapeHtml(status)}</dd></div>
    <div class="row"><dt>Invoice date</dt><dd>${escapeHtml(invoice.issued_at ? formatUtcInstant(invoice.issued_at) : "Not issued")}</dd></div>
    <div class="row"><dt>Due</dt><dd>${escapeHtml(invoice.due_on)}</dd></div>
  </div>
</header>
${draft ? '<p class="banner" role="note">DRAFT — not issued. Printing does not issue this invoice.</p>' : ""}
${invoice.status === "cancelled" ? '<p class="banner" role="note">CANCELLED — retained for the record. No payment is due.</p>' : ""}
<section aria-label="Billing details">
  <h2>Bill to</h2>
  ${billTo}
  <h2>Billing period</h2>
  <p><time datetime="${escapeHtml(invoice.period_start)}">${escapeHtml(formatUtcInstant(invoice.period_start))}</time>
    to <time datetime="${escapeHtml(invoice.period_end)}">${escapeHtml(formatUtcInstant(invoice.period_end))}</time></p>
</section>
<section aria-label="Invoice lines">
  <table>
    <caption>Invoice lines</caption>
    <thead><tr><th scope="col">Description</th><th scope="col" class="numeric">Qty</th><th scope="col" class="numeric">Unit price</th><th scope="col" class="numeric">Discount</th><th scope="col" class="numeric">Tax rate</th><th scope="col" class="numeric">Tax</th><th scope="col" class="numeric">Amount</th></tr></thead>
    <tbody>
${lines}
    </tbody>
    <tfoot>
      <tr><th scope="row" colspan="6">Subtotal</th><td class="numeric">${escapeHtml(formatMoney(invoice.subtotal_minor, invoice.currency))}</td></tr>
      <tr><th scope="row" colspan="6">Discount</th><td class="numeric">−${escapeHtml(formatMoney(invoice.discount_minor, invoice.currency))}</td></tr>
      <tr><th scope="row" colspan="6">Tax</th><td class="numeric">${escapeHtml(formatMoney(invoice.tax_minor, invoice.currency))}</td></tr>
      <tr class="total"><th scope="row" colspan="6">Total</th><td class="numeric">${escapeHtml(formatMoney(invoice.total_minor, invoice.currency))}</td></tr>
      <tr><th scope="row" colspan="6">Payments recorded</th><td class="numeric">${escapeHtml(formatMoney(invoice.paid_minor, invoice.currency))}</td></tr>
      <tr><th scope="row" colspan="6">Outstanding</th><td class="numeric">${escapeHtml(formatMoney(invoice.outstanding_minor, invoice.currency))}</td></tr>
    </tfoot>
  </table>
</section>
<section aria-label="Invoice details">
  <h2>Details</h2>
  ${row("Invoice number", invoice.number)}
  ${row("Subscription", invoice.subscription_id)}
  ${row("Currency", invoice.currency)}
  ${invoice.sent_at ? row("Delivery recorded", formatUtcInstant(invoice.sent_at)) : ""}
</section>
<footer>
  <p class="muted">This printable document is a snapshot of the recorded invoice. Later catalog or profile edits do not change these lines.</p>
</footer>
</body>
</html>`;
}
