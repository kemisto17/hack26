import { PageHeader } from "@/components/customer-web/ui";
import { RecordCollection } from "@/components/customer-web/collections";
import { customerCollection } from "@/components/customer-web/data";
import { requireCustomer } from "@/components/customer-web/session";
export const metadata = { title: "Your invoices · Brightloop" };
export default async function Page() { const user = await requireCustomer(); const result = await customerCollection("invoices"); return <><PageHeader eyebrow="Your customer workspace" title="Your invoices" description="Issued invoices, recorded payments and the balance remaining."/><RecordCollection kind="invoices" ownerId={user.id} now={new Date().toISOString()} result={result}/></>; }
