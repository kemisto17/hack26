import type { Actor, PaymentDTO } from "../contracts";
import { formatMoney, formatUtcInstant, paymentMethodLabel } from "../presentation";

/** Safe receipt history. Notes/references are customer-visible by contract. */
export function PaymentList({
  payments,
  role,
  invoiceBasePath,
  customerId,
  emptyMessage = "No payments are available.",
}: {
  payments: PaymentDTO[];
  role: Actor["role"];
  invoiceBasePath: string;
  /** Required for a customer view; service scoping remains authoritative. */
  customerId?: string;
  emptyMessage?: string;
}) {
  const visible = role === "customer" ? payments.filter(payment => customerId !== undefined && payment.customer_id === customerId) : payments;
  if (visible.length === 0) return <p className="text-sm text-neutral-600">{emptyMessage}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="pb-2 text-left font-semibold">Payments</caption>
        <thead>
          <tr className="border-b border-neutral-300">
            <th scope="col" className="p-2">Received</th>
            <th scope="col" className="p-2">Invoice</th>
            <th scope="col" className="p-2">Method</th>
            <th scope="col" className="p-2">Reference</th>
            <th scope="col" className="p-2">Note</th>
            <th scope="col" className="p-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {visible.map(payment => (
            <tr key={payment.id} className="border-b border-neutral-200 align-top">
              <td className="p-2"><time dateTime={payment.paid_at}>{formatUtcInstant(payment.paid_at)}</time></td>
              <td className="p-2"><a className="underline" href={`${invoiceBasePath}/${payment.invoice_id}`}>View invoice</a></td>
              <td className="p-2">{paymentMethodLabel(payment.method)}</td>
              <td className="p-2">{payment.external_reference ?? "—"}</td>
              <td className="p-2 whitespace-pre-wrap">{payment.note || "—"}</td>
              <td className="p-2 text-right">{formatMoney(payment.amount_minor, payment.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
