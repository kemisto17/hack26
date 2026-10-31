import { AuthForm } from "@/modules/identity/auth-form";
export const metadata = { title: "Recover your account · Brightloop" };
export default function ForgotPassword() { return <AuthForm mode="reset"/>; }
