import { PageHeader } from "@/components/customer-web/ui";
import { RecordCollection } from "@/components/customer-web/collections";
import { customerCollection } from "@/components/customer-web/data";
import { requireCustomer } from "@/components/customer-web/session";
export const metadata = { title: "Your quotations · Brightloop" };
export default async function Page() { const user = await requireCustomer(); const result = await customerCollection("quotations"); return <><PageHeader eyebrow="Your customer workspace" title="Your quotations" description="Review proposed selections and the terms agreed with your provider."/><RecordCollection kind="quotations" ownerId={user.id} now={new Date().toISOString()} result={result}/></>; }
