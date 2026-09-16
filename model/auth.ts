import type { ActionCtx, QueryCtx } from "../_generated/server";
import { authComponent } from "../betterAuth/auth";
import { hasSignInProviderAccount } from "../betterAuth/model/providerAccount";
import { resolveBetterAuthUserId } from "../betterAuth/model/user";

export async function resolveCurrentUser(ctx: QueryCtx | ActionCtx) {
    const user = await authComponent.safeGetAuthUser(ctx);

    if (!user) {
        return null;
    }

    const userId = resolveBetterAuthUserId(user);

    const isDemoUser = Boolean(process.env.DEMO_ACCESS_USER_ID) && userId === process.env.DEMO_ACCESS_USER_ID;
    if (!userId || (!isDemoUser && !(await hasSignInProviderAccount(ctx, userId)))) {
        return null;
    }

    return { user, userId };
}

export async function getCurrentUser(ctx: QueryCtx) {
    return (await resolveCurrentUser(ctx))?.user ?? null;
}
