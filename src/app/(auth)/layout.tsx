import { AuthFrame } from "@/components/customer-web/auth-frame";
export default function AuthLayout({ children }: {
    children: React.ReactNode;
}) { return <AuthFrame>{children}</AuthFrame>; }
