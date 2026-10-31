import { Reports } from '@/components/staff-console/reports';
import { requireStaff } from '@/components/staff-console/session';
export default async function Page() { await requireStaff(); return <Reports />; }
