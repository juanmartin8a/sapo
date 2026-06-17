import { query } from "./_generated/server";

import { authComponent } from "./betterAuth/auth";
import { hasSignInProviderAccount } from "./betterAuth/providerAccount";
import { resolveBetterAuthUserId } from "./betterAuth/user";

export const getCurrentUser = query({
    args: {},
    handler: async (ctx) => {
        const user = await authComponent.safeGetAuthUser(ctx);

        if (!user) {
            return null;
        }

        const userId = resolveBetterAuthUserId(user);

        if (!userId || !(await hasSignInProviderAccount(ctx, userId))) {
            return null;
        }

        return user;
    },
});
