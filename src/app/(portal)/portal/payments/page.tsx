import { PageHeader } from "@/components/customer-web/ui";
import { RecordCollection } from "@/components/customer-web/collections";
import { customerCollection } from "@/components/customer-web/data";
import { requireCustomer } from "@/components/customer-web/session";
export const metadata = { title: "Payment history · Brightloop" };
export default async function Page() { const user = await requireCustomer(); const result = await customerCollection("payments"); return <><PageHeader eyebrow="Your customer workspace" title="Payment history" description="Verified receipts recorded by your provider. No online payment gateway is connected."/><RecordCollection kind="payments" ownerId={user.id} now={new Date().toISOString()} result={result}/></>; }
