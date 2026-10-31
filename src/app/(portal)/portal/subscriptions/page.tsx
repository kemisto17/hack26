import { PageHeader } from "@/components/customer-web/ui";
import { RecordCollection } from "@/components/customer-web/collections";
import { customerCollection } from "@/components/customer-web/data";
import { requireCustomer } from "@/components/customer-web/session";
export const metadata = { title: "My subscriptions · Brightloop" };
export default async function Page() { const user = await requireCustomer(); const result = await customerCollection("subscriptions"); return <><PageHeader eyebrow="Your customer workspace" title="My subscriptions" description="Your plans, agreed terms and the next billing date."/><RecordCollection kind="subscriptions" ownerId={user.id} now={new Date().toISOString()} result={result}/></>; }
