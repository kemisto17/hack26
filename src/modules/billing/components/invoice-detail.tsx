"use client";

import { useRef, useState, type FormEvent } from "react";
import type {
  Actor,
  Creation,
  InvoiceDTO,
  InvoiceSummaryDTO,
  Mutation,
  PaymentDTO,
  PaymentMethod,
  RecordPaymentInput,
} from "../contracts";
import { PAYMENT_METHODS, SEND_UNAVAILABLE_MESSAGE } from "../contracts";
import { normalizeInstant } from "../domain";
import { formatMoney, formatUtcInstant, invoiceStatusLabel, paymentMethodLabel, parseMoneyToMinor } from "../presentation";
import { AppError } from "@/lib/api/errors";

export type InvoiceActionHandler = (input: Mutation) => Promise<InvoiceDTO>;
export type PaymentHandler = (
  input: RecordPaymentInput & Mutation & Creation,
) => Promise<{ payment: PaymentDTO; invoice: InvoiceSummaryDTO }>;

type PendingPayment = { input: RecordPaymentInput & Mutation & Creation };

function messageFor(error: unknown): string {
  if (error instanceof AppError) return error.message;
  return "The action could not be confirmed. Refresh to check the current state before retrying.";
}

function samePayment(a: RecordPaymentInput, b: RecordPaymentInput): boolean {
  return (
    a.amount_minor === b.amount_minor &&
    a.currency === b.currency &&
    a.method === b.method &&
    a.paid_at === b.paid_at &&
    (a.note ?? "") === (b.note ?? "") &&
    (a.external_reference ?? "") === (b.external_reference ?? "")
  );
}

/**
 * Invoice detail with staff-only actions. Customer callbacks are ignored, so a
 * client cannot turn a read-only portal view into a mutation surface merely by
 * passing handlers. Every command is reauthorized by the service/RPC.
 */
export function InvoiceDetail({
  invoice,
  role,
  onConfirm,
  onCancel,
  onRecordPayment,
  printHref,
}: {
  invoice: InvoiceDTO;
  role: Actor["role"];
  onConfirm?: InvoiceActionHandler;
  onCancel?: InvoiceActionHandler;
  onRecordPayment?: PaymentHandler;
  printHref?: string;
}) {
  const staff = role === "admin" || role === "internal";
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);
  const pendingPayment = useRef<PendingPayment | null>(null);

  async function run(handler: InvoiceActionHandler | undefined) {
    if (!handler || inFlight.current || done) return;
    inFlight.current = true;
    setPending(true);
    setMessage("");
    try {
      await handler({ expected_version: invoice.version });
      setDone(true);
      setMessage("Invoice updated. Refresh to see its current state.");
    } catch (error) {
      setMessage(messageFor(error));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  async function pay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onRecordPayment || inFlight.current || done) return;
    try {
      const form = new FormData(event.currentTarget);
      const note = String(form.get("note") ?? "").trim();
      const reference = String(form.get("external_reference") ?? "").trim();
      const input: RecordPaymentInput & Mutation & Creation = {
        amount_minor: parseMoneyToMinor(String(form.get("amount") ?? ""), invoice.currency),
        currency: invoice.currency,
        method: String(form.get("method") ?? "") as PaymentMethod,
        paid_at: normalizeInstant(form.get("paid_at"), "paid_at"),
        ...(note ? { note } : {}),
        ...(reference ? { external_reference: reference } : {}),
        expected_version: invoice.version,
        request_key: pendingPayment.current?.input.request_key ?? crypto.randomUUID(),
      };
      if (!PAYMENT_METHODS.includes(input.method)) {
        setMessage("Choose a valid payment method.");
        return;
      }
      if (pendingPayment.current && !samePayment(pendingPayment.current.input, input)) {
        setMessage(
          "A previous payment attempt is still unresolved. Refresh and check the payment history before submitting a different receipt; the original retry key is retained to prevent a duplicate payment.",
        );
        return;
      }
      pendingPayment.current = { input };
      inFlight.current = true;
      setPending(true);
      setMessage("");
      try {
        await onRecordPayment(input);
        setDone(true);
        setMessage("Payment recorded. Refresh to verify the invoice balance and payment history.");
      } catch (error) {
        setMessage(messageFor(error));
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    } catch (error) {
      setMessage(messageFor(error));
    }
  }

  const canConfirm = staff && invoice.status === "draft" && Boolean(onConfirm);
  const canCancel = staff && (invoice.status === "draft" || invoice.status === "confirmed") && Boolean(onCancel);
  const canPay = staff && invoice.status === "confirmed" && Boolean(onRecordPayment);

  return (
    <article className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{invoice.number}</h1>
        <p>
          <span className="font-semibold">Status: </span>
          {invoiceStatusLabel(invoice.status)}
          {invoice.issued_at === null ? <span className="ml-2 text-sm text-neutral-600">Not issued</span> : null}
        </p>
        <p>
          <span className="font-semibold">Billing period: </span>
          <time dateTime={invoice.period_start}>{formatUtcInstant(invoice.period_start)}</time>
          {" – "}
          <time dateTime={invoice.period_end}>{formatUtcInstant(invoice.period_end)}</time>
        </p>
        <p><span className="font-semibold">Due: </span><time dateTime={invoice.due_on}>{invoice.due_on}</time></p>
        {invoice.issued_at ? <p><span className="font-semibold">Issued: </span><time dateTime={invoice.issued_at}>{formatUtcInstant(invoice.issued_at)}</time></p> : null}
        {invoice.sent_at ? <p><span className="font-semibold">Delivery recorded: </span><time dateTime={invoice.sent_at}>{formatUtcInstant(invoice.sent_at)}</time></p> : null}
      </header>

      <section aria-labelledby="bill-to-heading" className="rounded border p-4">
        <h2 id="bill-to-heading" className="text-lg font-semibold">Bill to</h2>
        {invoice.customer_snapshot ? (
          <>
            <p>{invoice.customer_snapshot.display_name || "Customer"}</p>
            <p>{invoice.customer_snapshot.email}</p>
          </>
        ) : (
          <p className="text-neutral-600">Billing contact is frozen when this invoice is confirmed.</p>
        )}
      </section>

      <section aria-labelledby="lines-heading">
        <h2 id="lines-heading" className="text-lg font-semibold">Invoice lines</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">Invoice line items</caption>
            <thead>
              <tr className="border-b border-neutral-300">
                <th scope="col" className="p-2">Description</th>
                <th scope="col" className="p-2 text-right">Qty</th>
                <th scope="col" className="p-2 text-right">Unit price</th>
                <th scope="col" className="p-2 text-right">Discount</th>
                <th scope="col" className="p-2 text-right">Tax</th>
                <th scope="col" className="p-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map(line => (
                <tr key={line.id} className="border-b border-neutral-200 align-top">
                  <th scope="row" className="p-2 font-normal">
                    {line.description}
                    {line.variant_label ? <span className="block text-xs text-neutral-600">{line.variant_label}</span> : null}
                  </th>
                  <td className="p-2 text-right">{line.quantity}</td>
                  <td className="p-2 text-right">{formatMoney(line.unit_price_minor, invoice.currency)}</td>
                  <td className="p-2 text-right">{formatMoney(line.discount_minor, invoice.currency)}</td>
                  <td className="p-2 text-right">{formatMoney(line.tax_minor, invoice.currency)}</td>
                  <td className="p-2 text-right">{formatMoney(line.amount_minor, invoice.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="mt-4 grid gap-1 sm:max-w-sm sm:ml-auto">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatMoney(invoice.subtotal_minor, invoice.currency)}</dd></div>
          <div className="flex justify-between"><dt>Discount</dt><dd>{formatMoney(invoice.discount_minor, invoice.currency)}</dd></div>
          <div className="flex justify-between"><dt>Tax</dt><dd>{formatMoney(invoice.tax_minor, invoice.currency)}</dd></div>
          <div className="flex justify-between font-semibold"><dt>Total</dt><dd>{formatMoney(invoice.total_minor, invoice.currency)}</dd></div>
          <div className="flex justify-between"><dt>Paid</dt><dd>{formatMoney(invoice.paid_minor, invoice.currency)}</dd></div>
          <div className="flex justify-between font-semibold"><dt>Outstanding</dt><dd>{formatMoney(invoice.outstanding_minor, invoice.currency)}</dd></div>
        </dl>
      </section>

      {printHref ? (
        <p>
          <a className="underline" href={printHref}>Open printable invoice</a>
          <span className="text-sm text-neutral-600"> (use your browser’s print dialog; printing never issues a draft)</span>
        </p>
      ) : null}

      {staff ? (
        <section aria-labelledby="actions-heading" className="space-y-3 rounded border p-4">
          <h2 id="actions-heading" className="text-lg font-semibold">Staff actions</h2>
          <fieldset disabled={pending || done} className="flex flex-wrap gap-3">
            <legend className="sr-only">Invoice actions</legend>
            {canConfirm ? <button type="button" onClick={() => void run(onConfirm)}>Confirm invoice</button> : null}
            {canCancel ? <button type="button" onClick={() => void run(onCancel)}>Cancel invoice</button> : null}
            <button type="button" disabled title={SEND_UNAVAILABLE_MESSAGE}>Send invoice</button>
          </fieldset>
          <p className="text-sm text-neutral-600">{SEND_UNAVAILABLE_MESSAGE}</p>
          {invoice.status === "draft" ? <p className="text-sm text-neutral-600">Confirmation freezes the historical lines, applies eligible tax/discount and issues the invoice.</p> : null}
          {invoice.status === "confirmed" ? <p className="text-sm text-neutral-600">Cancellation is refused once a payment has been recorded. No card data is stored.</p> : null}

          {canPay ? (
            <form onSubmit={pay} className="space-y-3">
              <fieldset disabled={pending || done} className="space-y-3">
                <legend className="font-semibold">Record verified receipt</legend>
                <p className="text-sm text-neutral-600">Enter an amount actually received. A browser success message is never treated as payment confirmation.</p>
                <label className="grid gap-1">
                  Amount received ({invoice.currency})
                  <input name="amount" inputMode="decimal" required autoComplete="off" placeholder="12.50" />
                </label>
                <label className="grid gap-1">
                  Method
                  <select name="method" required defaultValue="bank_transfer">
                    {PAYMENT_METHODS.map(method => <option key={method} value={method}>{paymentMethodLabel(method)}</option>)}
                  </select>
                </label>
                <label className="grid gap-1">
                  Received at (UTC)
                  <input name="paid_at" required autoComplete="off" placeholder="2026-10-31T12:00:00Z" />
                </label>
                <label className="grid gap-1">
                  Receipt note (customer-visible, optional)
                  <textarea name="note" maxLength={2000} rows={2} />
                </label>
                <label className="grid gap-1">
                  External reference (optional)
                  <input name="external_reference" maxLength={200} autoComplete="off" />
                </label>
                <button type="submit">Record payment</button>
              </fieldset>
            </form>
          ) : null}
          <p role="status" aria-live="polite">{pending ? "Sending request…" : message}</p>
        </section>
      ) : null}
    </article>
  );
}
