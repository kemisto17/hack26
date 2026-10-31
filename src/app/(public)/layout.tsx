import { PublicShell } from "@/components/customer-web/public-shell";
export default function PublicLayout({ children }: {
    children: React.ReactNode;
}) { return <PublicShell>{children}</PublicShell>; }
