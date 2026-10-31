import { Notifications } from '@/components/staff-console/support';
import { requireStaff } from '@/components/staff-console/session';
export default async function Page() { await requireStaff(); return <Notifications />; }
