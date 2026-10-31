import { CustomerDashboard } from "@/components/customer-web/dashboard";
import { requireCustomer } from "@/components/customer-web/session";
export const metadata = { title: "Your overview · Brightloop" };
export default async function DashboardPage() { return <CustomerDashboard user={await requireCustomer()}/>; }
