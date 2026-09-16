import { DEMO_ACCESS_EMAIL } from "./betterAuth/model/demoAccess";
import { createAuth } from "./betterAuth/auth";
import { internalAction, query } from "./_generated/server";
import { getCurrentUser as getCurrentUserHandler } from "./model/auth";

export const getCurrentUser = query({
    args: {},
    handler: getCurrentUserHandler,
});

// Operator-only setup: no public sign-up or password endpoint is enabled.
export const provisionDemoUser = internalAction({
    args: {},
    handler: async (ctx) => {
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
    },
});
