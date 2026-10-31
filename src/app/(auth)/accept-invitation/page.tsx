import { AuthForm } from "@/modules/identity/auth-form";
export const metadata = { title: "Accept your invitation · Brightloop" };
export default function AcceptInvitation() { return <AuthForm mode="update-password" notice="Open the invitation link from your email to verify your session, then set your password."/>; }
