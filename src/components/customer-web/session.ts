import "server-only";
import { redirect } from "next/navigation";
import { requireActor, getMe } from "@/modules/identity/service";
import { AppError } from "@/lib/api/errors";
/** The frontend delegates session and current-profile verification to D1. */
export async function requireCustomer() {
    try {
        const user = await getMe(await requireActor());
        if (user.role !== "customer")
            redirect("/");
        return user;
    }
    catch (error) {
        if (error instanceof AppError && ["UNAUTHENTICATED", "FORBIDDEN"].includes(error.code))
            redirect("/login?reason=account");
        throw error;
    }
}
