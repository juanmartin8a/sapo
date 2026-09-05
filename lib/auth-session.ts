import { authClient } from "@/lib/auth-client";

export async function signOutCurrentSession() {
    const result = await authClient.signOut();

    if (result.error) {
        throw new Error("Unable to sign out. Please try again.");
    }
}
