import { notFound } from 'next/navigation';
import { validResourceId } from '@/components/customer-web/format';
import { requireStaff } from '@/components/staff-console/session';
import { SupportDetail } from '@/components/staff-console/support';
export default async function Page({ params }: { params: Promise<{ id: string }> }) { await requireStaff(); if (!validResourceId((await params).id)) notFound(); return <SupportDetail />; }
