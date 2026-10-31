import type { InvoiceStatus, ReportDTO, SummaryQuery } from "../contracts";
import { INVOICE_STATUSES } from "../contracts";
import { formatMoney, formatUtcInstant, invoiceStatusLabel } from "../presentation";

/** Staff-only filtered summary. Each currency stays in its own bucket. */
export function ReportSummary({
  report,
  filters,
  action = "/reports",
}: {
  report: ReportDTO;
  filters: SummaryQuery;
  action?: string;
}) {
  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Summary report</h1>
        <p className="text-sm text-neutral-600">As of <time dateTime={report.as_of}>{formatUtcInstant(report.as_of)}</time>. Billed uses issued invoices; collected uses recorded payments.</p>
      </header>

      <form method="get" action={action} className="grid gap-3 rounded border p-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="grid gap-1">
          From (inclusive, UTC)
          <input name="from" required defaultValue={filters.from} placeholder="2026-01-01T00:00:00Z" autoComplete="off" />
        </label>
        <label className="grid gap-1">
          To (exclusive, UTC)
          <input name="to" required defaultValue={filters.to} placeholder="2027-01-01T00:00:00Z" autoComplete="off" />
        </label>
        <label className="grid gap-1">
          Status (invoice measures only)
          <select name="status" defaultValue={filters.status ?? ""}>
            <option value="">All issued statuses</option>
            {INVOICE_STATUSES.filter(status => status !== "draft").map((status: InvoiceStatus) => (
              <option key={status} value={status}>{invoiceStatusLabel(status)}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          Currency (optional)
          <input name="currency" pattern="[A-Z]{3}" maxLength={3} defaultValue={filters.currency ?? ""} placeholder="USD" autoComplete="off" />
        </label>
        <label className="grid gap-1">
          Customer ID (optional)
          <input name="customer_id" defaultValue={filters.customer_id ?? ""} placeholder="UUID" autoComplete="off" />
        </label>
        <div className="flex items-end">
          <button type="submit">Apply filters</button>
        </div>
      </form>

      <p className="rounded bg-neutral-100 p-3 text-sm">
        <strong>Active subscriptions:</strong> {report.active_subscriptions}. This is a current snapshot and is not limited by the selected date range or invoice status.
      </p>

      {report.currencies.length === 0 ? (
        <p className="text-sm text-neutral-600">No invoice or payment activity matched these filters.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="pb-2 text-left font-semibold">Amounts by currency</caption>
            <thead>
              <tr className="border-b border-neutral-300">
                <th scope="col" className="p-2">Currency</th>
                <th scope="col" className="p-2 text-right">Billed</th>
                <th scope="col" className="p-2 text-right">Collected</th>
                <th scope="col" className="p-2 text-right">Outstanding</th>
                <th scope="col" className="p-2 text-right">Overdue</th>
                <th scope="col" className="p-2 text-right">Overdue invoices</th>
              </tr>
            </thead>
            <tbody>
              {report.currencies.map(bucket => (
                <tr key={bucket.currency} className="border-b border-neutral-200">
                  <th scope="row" className="p-2">{bucket.currency}</th>
                  <td className="p-2 text-right">{formatMoney(bucket.billed_minor, bucket.currency)}</td>
                  <td className="p-2 text-right">{formatMoney(bucket.collected_minor, bucket.currency)}</td>
                  <td className="p-2 text-right">{formatMoney(bucket.outstanding_minor, bucket.currency)}</td>
                  <td className="p-2 text-right">{formatMoney(bucket.overdue_minor, bucket.currency)}</td>
                  <td className="p-2 text-right">{bucket.overdue_invoice_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-sm text-neutral-600">Currencies are reported separately and never summed. Outstanding and overdue are current as-of snapshots within the same customer/currency filters.</p>
    </section>
  );
}
