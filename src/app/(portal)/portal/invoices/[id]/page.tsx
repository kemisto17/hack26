import { notFound } from "next/navigation";
import { RecordDetail } from "@/components/customer-web/record-detail";
import { customerDetail } from "@/components/customer-web/data";
import { requireCustomer } from "@/components/customer-web/session";
import { validResourceId } from "@/components/customer-web/format";
export default async function Page({ params }: {
    params: Promise<{
        id: string;
    }>;
}) { const user = await requireCustomer(); const { id } = await params; if (!validResourceId(id))
    notFound(); const result = await customerDetail("invoices", id); return <RecordDetail kind="invoices" result={result} ownerId={user.id}/>; }
