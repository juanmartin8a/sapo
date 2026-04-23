import { createClient } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import type { GenericCtx } from "@convex-dev/better-auth/utils";
import type { BetterAuthOptions } from "better-auth";
import { betterAuth } from "better-auth";
import { anonymous } from "better-auth/plugins";
import { internal, components } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";
import authConfig from "../auth.config";
import schema from "./schema";
import { sendEmail } from "../sendEmail";
import { expo } from "@better-auth/expo";
import {
    isBetterAuthUserAnonymous,
    resolveBetterAuthUserId,
} from "./user";

type MutationRunner = {
    runMutation: (mutation: unknown, args: Record<string, unknown>) => Promise<unknown>;
};

type ActionRunner = {
    runAction: (action: unknown, args: Record<string, unknown>) => Promise<unknown>;
};

function hasRunMutation(ctx: GenericCtx<DataModel>): ctx is GenericCtx<DataModel> & MutationRunner {
    return typeof (ctx as { runMutation?: unknown }).runMutation === "function";
}

function hasRunAction(ctx: GenericCtx<DataModel>): ctx is GenericCtx<DataModel> & ActionRunner {
    return typeof (ctx as { runAction?: unknown }).runAction === "function";
}

async function prepareAuthenticatedUserDeletion(ctx: GenericCtx<DataModel>, user: unknown) {
    if (!hasRunAction(ctx)) {
        throw new Error("Action context required for account deletion");
    }

    const userId = resolveBetterAuthUserId(user);

    if (!userId) {
        throw new Error("Missing Better Auth user id during account deletion");
    }

    await ctx.runAction(internal.subscriptionsWorkers.prepareUserAccountDeletion, {
        user_id: userId,
    });
}

async function finalizeAuthenticatedUserDeletion(ctx: GenericCtx<DataModel>, user: unknown) {
    if (!hasRunAction(ctx)) {
        throw new Error("Action context required for account deletion cleanup");
    }

    const userId = resolveBetterAuthUserId(user);

    if (!userId) {
        throw new Error("Missing Better Auth user id during account deletion cleanup");
    }

    await ctx.runAction(internal.subscriptionsWorkers.finalizeDeletedUserData, {
        user_id: userId,
    });
}

async function migrateAnonymousSubscriptionState(
    ctx: GenericCtx<DataModel>,
    anonymousUser: unknown,
    newUser: unknown
) {
    if (!hasRunMutation(ctx)) {
        return;
    }

    if (!isBetterAuthUserAnonymous(anonymousUser) || isBetterAuthUserAnonymous(newUser)) {
        return;
    }

    const anonymousUserId = resolveBetterAuthUserId(anonymousUser);
    const newUserId = resolveBetterAuthUserId(newUser);

    if (!anonymousUserId || !newUserId || anonymousUserId === newUserId) {
        return;
    }

    const linkAnonymousSubscriptionStateToUser = (
        components.subscriptions.webhook as Record<string, unknown>
    ).linkAnonymousSubscriptionStateToUser;

    if (!linkAnonymousSubscriptionStateToUser) {
        return;
    }

    try {
        await ctx.runMutation(linkAnonymousSubscriptionStateToUser, {
            anonymous_user_id: anonymousUserId,
            user_id: newUserId,
            now_ms: Date.now(),
        });
    } catch (error) {
        console.error("Failed to migrate anonymous quota data", error);
    }
}

// Better Auth Component
export const authComponent = createClient<DataModel, typeof schema>(
    components.betterAuth,
    {
        local: { schema },
        verbose: false,
    },
);

// Better Auth Options
export const createAuthOptions = (ctx: GenericCtx<DataModel>) => {
    return {
        advanced: {},
        appName: process.env.APP_NAME,
        baseURL: process.env.CONVEX_SITE_URL,
        secret: process.env.BETTER_AUTH_SECRET,
        rateLimit: {
            customRules: {
                "/sign-in/anonymous": {
                    max: 10,
                    window: 60,
                },
            },
        },
        trustedOrigins: ["sapo://", "https://appleid.apple.com"],
        database: authComponent.adapter(ctx),
        user: {
            deleteUser: {
                enabled: true,
                sendDeleteAccountVerification: async ({ user, url }) => {
                    await sendEmail(
                        ctx,
                        user.email,
                        "Verify Account Deletion",
                        {
                            id: 'verify_account_deletion',
                            variables: {
                                URL: url
                            }
                        }
                    )
                },
                beforeDelete: async (user) => {
                    await prepareAuthenticatedUserDeletion(ctx, user);
                },
                afterDelete: async (user) => {
                    await finalizeAuthenticatedUserDeletion(ctx, user);
                },
            }
        },
        socialProviders: {
            google: {
                prompt: "select_account",
                clientId: process.env.GOOGLE_CLIENT_ID as string,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
            },
            apple: {
                clientId: process.env.APPLE_CLIENT_ID as string,
                clientSecret: process.env.APPLE_CLIENT_SECRET as string,
                appBundleIdentifier: process.env.APPLE_APP_BUNDLE_IDENTIFIER as string,
            },
        },
        plugins: [
            // The Expo and Convex plugins are required
            expo(),
            convex({ authConfig }),
            anonymous({
                emailDomainName: "anonymous.sapo.invalid",
                generateName: () => "Guest",
                onLinkAccount: async ({ anonymousUser, newUser }) => {
                    await migrateAnonymousSubscriptionState(ctx, anonymousUser, newUser);
                },
            }),
        ],
    } satisfies BetterAuthOptions;
};

// For `@better-auth/cli`
export const options = createAuthOptions({} as GenericCtx<DataModel>);

// Better Auth Instance
export const createAuth = (ctx: GenericCtx<DataModel>) => {
    return betterAuth(createAuthOptions(ctx));
};
