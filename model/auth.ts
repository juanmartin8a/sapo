import type { ActionCtx, QueryCtx } from "../_generated/server";
import { authComponent, createAuth } from "../betterAuth/auth";
import { DEMO_ACCESS_EMAIL } from "../constants/demoAccess";
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

export async function provisionDemoUser(ctx: ActionCtx) {
    const context = await createAuth(ctx).$context;
    const email = DEMO_ACCESS_EMAIL;
    const existing = await context.internalAdapter.findUserByEmail(email);
    if (existing) {
        throw new Error("This email already exists. Inspect that account before explicitly configuring DEMO_ACCESS_USER_ID; no account was changed.");
    }
    const user = await context.internalAdapter.createUser({
        email,
        emailVerified: false,
        name: "Demo Reviewer",
    });
    return { userId: user.id };
}
