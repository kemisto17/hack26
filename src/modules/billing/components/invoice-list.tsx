import type { Actor, InvoiceSummaryDTO } from "../contracts";
import { invoiceVisibleToCustomer } from "../domain";
import { formatMoney, formatUtcDate, invoiceStatusLabel } from "../presentation";

const labels: Record<InvoiceSummaryDTO["status"], string> = {
  draft: "Draft",
  confirmed: "Confirmed",
  paid: "Paid",
  cancelled: "Cancelled",
};

/**
 * Safe invoice list for workspace or portal. The service is authoritative for
 * visibility; this component also refuses to render a customer's unissued draft
 * as defense in depth.
 */
export function InvoiceList({
  invoices,
  role,
  basePath,
  today,
  customerId,
  emptyMessage = "No invoices are available.",
}: {
  invoices: InvoiceSummaryDTO[];
  role: Actor["role"];
  basePath: string;
  /** UTC date used only for the overdue hint; reports use the same rule. */
  today: string;
  /** Required for a customer view; service scoping remains authoritative. */
  customerId?: string;
  emptyMessage?: string;
}) {
  const visible = role === "customer" ? invoices.filter(invoice => customerId !== undefined && invoiceVisibleToCustomer(invoice, customerId)) : invoices;
  if (visible.length === 0) return <p className="text-sm text-neutral-600">{emptyMessage}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="pb-2 text-left font-semibold">Invoices</caption>
        <thead>
          <tr className="border-b border-neutral-300">
            <th scope="col" className="p-2">Invoice</th>
            <th scope="col" className="p-2">Status</th>
            <th scope="col" className="p-2">Billing period</th>
            <th scope="col" className="p-2">Due</th>
            <th scope="col" className="p-2 text-right">Total</th>
            <th scope="col" className="p-2 text-right">Outstanding</th>
          </tr>
        </thead>
        <tbody>
          {visible.map(invoice => {
            const overdue = invoice.status === "confirmed" && invoice.outstanding_minor !== "0" && invoice.due_on < today;
            return (
              <tr key={invoice.id} className="border-b border-neutral-200 align-top">
                <th scope="row" className="p-2 font-medium">
                  <a className="underline" href={`${basePath}/${invoice.id}`}>{invoice.number}</a>
                </th>
                <td className="p-2">
                  {labels[invoice.status]}
                  {overdue ? <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Overdue</span> : null}
                </td>
                <td className="p-2">
                  <time dateTime={invoice.period_start}>{formatUtcDate(invoice.period_start.slice(0, 10))}</time>
                  {" – "}
                  <time dateTime={invoice.period_end}>{formatUtcDate(invoice.period_end.slice(0, 10))}</time>
                </td>
                <td className="p-2"><time dateTime={invoice.due_on}>{invoice.due_on}</time></td>
                <td className="p-2 text-right">{formatMoney(invoice.total_minor, invoice.currency)}</td>
                <td className="p-2 text-right">{formatMoney(invoice.outstanding_minor, invoice.currency)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export { invoiceStatusLabel };
