import { Catalog } from '@/components/staff-console/catalog';
import { requireStaff } from '@/components/staff-console/session';
export default async function Page() { await requireStaff(); return <Catalog />; }
