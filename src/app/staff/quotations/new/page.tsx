import { QuotationEditor } from '@/components/staff-console/quotation-editor';
import { customerDirectory } from '@/components/staff-console/session';
export default async function Page() { const result = await customerDirectory(); return <QuotationEditor customers={result.items} hasMore={!!result.next_cursor} />; }
