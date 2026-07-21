import type { QueryCtx } from "../_generated/server";
import { authComponent } from "../betterAuth/auth";
import { hasSignInProviderAccount } from "../betterAuth/model/providerAccount";
import { resolveBetterAuthUserId } from "../betterAuth/model/user";

export async function getCurrentUser(ctx: QueryCtx) {
    const user = await authComponent.safeGetAuthUser(ctx);

    if (!user) {
        return null;
    }

    const userId = resolveBetterAuthUserId(user);

    if (!userId || !(await hasSignInProviderAccount(ctx, userId))) {
        return null;
    }

    return user;
}
