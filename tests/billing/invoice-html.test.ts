import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/api/errors";
import { renderInvoiceHtml } from "@/modules/billing/invoice-html";
import { IDS, makeInvoice, makeLine } from "./fixtures";

describe("printable invoice", () => {
  it("escapes every customer- and catalog-supplied string", () => {
    const html = renderInvoiceHtml(
      makeInvoice({
        number: `INV<script>alert(1)</script>`,
        customer_snapshot: {
          display_name: `"><img src=x onerror="alert(2)">`,
          email: `a&b'c@example.test`,
        },
        lines: [
          makeLine({
            description: `<script>alert("line")</script> & <b>bold</b>`,
            variant_label: `"><svg onload="alert(3)">`,
          }),
        ],
      }),
    );
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<svg");
    expect(html).toContain("&lt;script&gt;alert(&quot;line&quot;)&lt;/script&gt; &amp; &lt;b&gt;bold&lt;/b&gt;");
    expect(html).toContain("&quot;&gt;&lt;img src=x onerror=&quot;alert(2)&quot;&gt;");
    expect(html).toContain("a&amp;b&#39;c@example.test");
    expect(html).toContain("INV&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("marks drafts and cancelled invoices without issuing them", () => {
    const draft = renderInvoiceHtml(
      makeInvoice({ status: "draft", issued_at: null, customer_snapshot: null }),
    );
    expect(draft).toContain("DRAFT");
    expect(draft).toContain("Not issued");
    expect(draft).toContain("frozen when this invoice is confirmed");
    expect(draft).not.toContain("CANCELLED");

    const cancelled = renderInvoiceHtml(makeInvoice({ status: "cancelled", issued_at: null }));
    expect(cancelled).toContain("CANCELLED");
    expect(cancelled).not.toContain("DRAFT");
  });

  it("shows the frozen historical totals and no external assets", () => {
    const html = renderInvoiceHtml(makeInvoice());
    expect(html).toContain("108.00 USD");
    expect(html).toContain("10.00 USD");
    expect(html).toContain("18.00 USD");
    expect(html).toContain("Ada Lovelace");
    expect(html).toContain("Analytical engine licence");
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toContain("<script");
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("default-src 'none'");
  });

  it("refuses to print inconsistent stored money", () => {
    expect(() => renderInvoiceHtml(makeInvoice({ total_minor: "1" }))).toThrow(AppError);
    expect(() =>
      renderInvoiceHtml(
        makeInvoice({
          id: IDS.otherInvoice,
          lines: [makeLine({ amount_minor: "1" })],
        }),
      ),
    ).toThrow(AppError);
  });
});
