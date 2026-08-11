import { createClient } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import {
    requireActionCtx,
    type GenericCtx,
} from "@convex-dev/better-auth/utils";
import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";
import { internal, components } from "../../_generated/api";
import type { DataModel } from "../../_generated/dataModel";
import authConfig from "../../auth.config";
import schema from "../schema";
import { sendAccountDeletionVerificationEmail } from "../../model/email";
import { expo } from "@better-auth/expo";
import { resolveBetterAuthUserId } from "./user";
import {
    decodeJwtClaims,
    exchangeNativeAppleAuthorizationCode,
    generateAppleClientSecret,
    getAppleNativeClientId,
    getAppleWebClientId,
    revokeAppleToken,
} from "./appleTokens";

type ActionRunner = {
    runAction: (action: unknown, args: Record<string, unknown>) => Promise<unknown>;
};

type QueryRunner = {
    runQuery: (query: unknown, args: Record<string, unknown>) => Promise<unknown>;
};

type BetterAuthAccountRecord = {
    accountId?: unknown;
    providerId?: unknown;
    accessToken?: unknown;
    accessTokenExpiresAt?: unknown;
    refreshToken?: unknown;
    idToken?: unknown;
};

type NativeAppleAuthRequest = {
    authorizationCode: string;
    identityToken: string;
};

type PreparedNativeAppleAccountTokens = {
    authorizationCode: string;
    accountId: string;
    accessToken: string | null;
    accessTokenExpiresAt: Date | null;
    idToken: string;
    refreshToken: string;
};

const DEFAULT_DELETE_ACCOUNT_CALLBACK_URL = "https://sapo.surf/delete-account";
const DEFAULT_CLIENT_ORIGIN = "https://sapo.surf";
const APP_SCHEME_ORIGIN = "sapo://";
const nativeAppleAuthorizationCodeExchanges = new Map<string, Promise<PreparedNativeAppleAccountTokens>>();

function getClientOrigins() {
    return (process.env.CLIENT_ORIGIN ?? DEFAULT_CLIENT_ORIGIN)
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0);
}

function hasRunAction(ctx: GenericCtx<DataModel>): ctx is GenericCtx<DataModel> & ActionRunner {
    return typeof (ctx as { runAction?: unknown }).runAction === "function";
}

function hasRunQuery(ctx: GenericCtx<DataModel>): ctx is GenericCtx<DataModel> & QueryRunner {
    return typeof (ctx as { runQuery?: unknown }).runQuery === "function";
}

function isBetterAuthAccountRecord(value: unknown): value is BetterAuthAccountRecord {
    return typeof value === "object" && value !== null;
}

function getRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function getPaginatedPage(value: unknown) {
    if (Array.isArray(value)) {
        return {
            page: value,
            continueCursor: null,
            isDone: true,
        };
    }

    const result = getRecord(value);
    const page = result && Array.isArray(result.page) ? result.page : null;

    if (!result || !page) {
        throw new Error("Unexpected Better Auth account pagination result");
    }

    return {
        page,
        continueCursor: typeof result.continueCursor === "string" ? result.continueCursor : null,
        isDone: result.isDone === true,
    };
}

function getNativeAppleAuthRequest(hookContext: unknown): NativeAppleAuthRequest | null {
    const body = getRecord(getRecord(hookContext)?.body);

    if (!body || body.provider !== "apple") {
        return null;
    }

    const idToken = getRecord(body.idToken);

    if (!idToken) {
        return null;
    }

    const authorizationCode = typeof idToken.refreshToken === "string" ? idToken.refreshToken : null;
    const identityToken = typeof idToken.token === "string" ? idToken.token : null;

    if (!authorizationCode) {
        throw new Error("Missing Sign in with Apple authorization code for native auth");
    }

    if (!identityToken) {
        throw new Error("Missing Sign in with Apple identity token for native auth");
    }

    return {
        authorizationCode,
        identityToken,
    };
}

function getRequiredStringClaim(value: unknown, message: string) {
    if (typeof value !== "string" || value.length === 0) {
        throw new Error(message);
    }

    return value;
}

async function createNativeAppleTokenExchange(request: NativeAppleAuthRequest) {
    const tokens = await exchangeNativeAppleAuthorizationCode(request.authorizationCode);

    const nativeClientId = getAppleNativeClientId();
    const requestClaims = decodeJwtClaims(request.identityToken);
    const requestAudience = getRequiredStringClaim(
        requestClaims.aud,
        "Sign in with Apple identity token audience missing for native auth",
    );
    const requestSubject = getRequiredStringClaim(
        requestClaims.sub,
        "Sign in with Apple identity token subject missing for native auth",
    );
    const tokenClaims = decodeJwtClaims(tokens.idToken);
    const tokenAudience = getRequiredStringClaim(
        tokenClaims.aud,
        "Sign in with Apple token exchange audience missing for native auth",
    );
    const tokenSubject = getRequiredStringClaim(
        tokenClaims.sub,
        "Sign in with Apple token exchange subject missing for native auth",
    );

    if (requestAudience !== nativeClientId || tokenAudience !== nativeClientId) {
        throw new Error("Sign in with Apple token audience does not match native client id");
    }

    if (requestSubject !== tokenSubject) {
        throw new Error("Sign in with Apple authorization code does not match identity token");
    }

    return {
        authorizationCode: request.authorizationCode,
        accountId: tokenSubject,
        accessToken: tokens.accessToken,
        accessTokenExpiresAt: tokens.accessTokenExpiresAt
            ? new Date(tokens.accessTokenExpiresAt)
            : null,
        idToken: tokens.idToken,
        refreshToken: tokens.refreshToken,
    };
}

async function prepareNativeAppleAccountTokens(hookContext: unknown) {
    const request = getNativeAppleAuthRequest(hookContext);

    if (!request) {
        return null;
    }

    const existingExchange = nativeAppleAuthorizationCodeExchanges.get(request.authorizationCode);

    if (existingExchange) {
        return existingExchange;
    }

    const exchange = createNativeAppleTokenExchange(request);

    nativeAppleAuthorizationCodeExchanges.set(request.authorizationCode, exchange);
    exchange.catch(() => {
        nativeAppleAuthorizationCodeExchanges.delete(request.authorizationCode);
    });

    return exchange;
}

async function prepareNativeAppleTokensBeforeUserCreate<UserRecord extends Record<string, unknown>>(
    user: UserRecord,
    hookContext: unknown,
) {
    await prepareNativeAppleAccountTokens(hookContext);

    return { data: user };
}

async function replaceNativeAppleAccountCreateTokens<AccountRecord extends BetterAuthAccountRecord>(
    account: AccountRecord,
    hookContext: unknown,
) {
    const tokens = await prepareNativeAppleAccountTokens(hookContext);

    if (!tokens) {
        return;
    }

    try {
        if (account.providerId !== "apple") {
            throw new Error("Native Sign in with Apple token exchange reached a non-Apple account");
        }

        if (account.accountId !== tokens.accountId) {
            throw new Error("Sign in with Apple authorization code does not match account id");
        }

        return {
            data: {
                ...account,
                accessToken: tokens.accessToken,
                accessTokenExpiresAt: tokens.accessTokenExpiresAt,
                idToken: tokens.idToken,
                refreshToken: tokens.refreshToken,
            },
        };
    } finally {
        nativeAppleAuthorizationCodeExchanges.delete(tokens.authorizationCode);
    }
}

async function replaceNativeAppleAccountUpdateTokens<AccountRecord extends Record<string, unknown>>(
    account: AccountRecord,
    hookContext: unknown,
) {
    const tokens = await prepareNativeAppleAccountTokens(hookContext);

    if (!tokens) {
        return;
    }

    try {
        return {
            data: {
                ...account,
                accessToken: tokens.accessToken,
                accessTokenExpiresAt: tokens.accessTokenExpiresAt,
                idToken: tokens.idToken,
                refreshToken: tokens.refreshToken,
            },
        };
    } finally {
        nativeAppleAuthorizationCodeExchanges.delete(tokens.authorizationCode);
    }
}

function buildDeleteAccountVerificationUrl(token: string) {
    const baseUrl =
        process.env.DELETE_ACCOUNT_CALLBACK_URL ?? DEFAULT_DELETE_ACCOUNT_CALLBACK_URL;
    const separator = baseUrl.includes("?") ? "&" : "?";

    return `${baseUrl}${separator}token=${encodeURIComponent(token)}`;
}

async function revokeAppleAccountTokens(ctx: GenericCtx<DataModel>, userId: string) {
    if (!hasRunQuery(ctx)) {
        throw new Error("Query context required for Sign in with Apple token revocation");
    }

    const accounts: unknown[] = [];
    let cursor: string | null = null;

    do {
        const result = getPaginatedPage(await ctx.runQuery(components.betterAuth.adapter.findMany, {
            model: "account",
            paginationOpts: {
                cursor,
                numItems: 20,
            },
            where: [
                { field: "userId", value: userId },
                { field: "providerId", value: "apple" },
            ],
        }));

        accounts.push(...result.page);
        cursor = result.isDone ? null : result.continueCursor;

        if (!result.isDone && !cursor) {
            throw new Error("Missing Better Auth account pagination cursor");
        }
    } while (cursor);

    const tokensToRevoke: {
        token: string;
        tokenTypeHint: "access_token" | "refresh_token";
        clientId: string;
    }[] = [];

    for (const account of accounts) {
        if (!isBetterAuthAccountRecord(account) || account.providerId !== "apple") {
            continue;
        }

        if (typeof account.idToken !== "string" || account.idToken.length === 0) {
            throw new Error("Missing Sign in with Apple id token for account deletion token revocation");
        }

        const claims = decodeJwtClaims(account.idToken);
        const clientId =
            claims.aud === getAppleNativeClientId()
                ? getAppleNativeClientId()
                : claims.aud === getAppleWebClientId()
                  ? getAppleWebClientId()
                  : null;

        if (!clientId) {
            throw new Error("Sign in with Apple token audience does not match configured client ids");
        }

        if (typeof account.refreshToken !== "string" || account.refreshToken.length === 0) {
            throw new Error("Missing Sign in with Apple refresh token for account deletion token revocation");
        }

        tokensToRevoke.push({
            token: account.refreshToken,
            tokenTypeHint: "refresh_token",
            clientId,
        });

        if (typeof account.accessToken === "string" && account.accessToken.length > 0) {
            tokensToRevoke.push({
                token: account.accessToken,
                tokenTypeHint: "access_token",
                clientId,
            });
        }
    }

    await Promise.all(tokensToRevoke.map((token) => revokeAppleToken(token)));
}

async function prepareAuthenticatedUserDeletion(ctx: GenericCtx<DataModel>, user: unknown) {
    if (!hasRunAction(ctx)) {
        throw new Error("Action context required for account deletion");
    }

    const userId = resolveBetterAuthUserId(user);

    if (!userId) {
        throw new Error("Missing Better Auth user id during account deletion");
    }

    await revokeAppleAccountTokens(ctx, userId);

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

    await ctx.runAction(internal.subscriptionsWorkers.queueDeletedUserDataCleanup, {
        user_id: userId,
    });
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
    const clientOrigins = getClientOrigins();
    const siteUrl = clientOrigins.find(
        (origin) => origin.startsWith("https://") || origin.startsWith("http://"),
    ) ?? DEFAULT_CLIENT_ORIGIN;

    return {
        appName: process.env.APP_NAME,
        baseURL: process.env.CONVEX_SITE_URL,
        secret: process.env.BETTER_AUTH_SECRET,
        trustedOrigins: [APP_SCHEME_ORIGIN, ...clientOrigins, "https://appleid.apple.com"],
        database: authComponent.adapter(ctx),
        rateLimit: {
            storage: "database",
            customRules: {
                "/delete-user": {
                    window: 60 * 60,
                    max: 3,
                },
            },
        },
        session: {
            cookieCache: {
                enabled: true,
                maxAge: 5 * 60,
            },
        },
        databaseHooks: {
            user: {
                create: {
                    before: prepareNativeAppleTokensBeforeUserCreate,
                },
            },
            account: {
                create: {
                    before: replaceNativeAppleAccountCreateTokens,
                },
                update: {
                    before: replaceNativeAppleAccountUpdateTokens,
                },
            },
        },
        user: {
            deleteUser: {
                enabled: true,
                deleteTokenExpiresIn: 60 * 60,
                sendDeleteAccountVerification: async ({ user, token }) => {
                    await sendAccountDeletionVerificationEmail(
                        requireActionCtx(ctx),
                        user.email,
                        buildDeleteAccountVerificationUrl(token),
                    );
                },
                beforeDelete: async (user) => {
                    await prepareAuthenticatedUserDeletion(ctx, user);
                },
                afterDelete: async (user) => {
                    try {
                        await finalizeAuthenticatedUserDeletion(ctx, user);
                    } catch (error) {
                        console.error("Failed to mark queued account deletion after auth delete:", error);
                    }
                },
            },
        },
        socialProviders: {
            google: {
                prompt: "select_account",
                clientId: process.env.GOOGLE_CLIENT_ID as string,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
            },
            apple: async () => ({
                clientId: process.env.APPLE_CLIENT_ID as string,
                clientSecret: await generateAppleClientSecret(getAppleWebClientId()),
                appBundleIdentifier: process.env.APPLE_APP_BUNDLE_IDENTIFIER as string,
            }),
        },
        plugins: [
            // The Expo and Convex plugins are required
            expo(),
            convex({ authConfig }),
            crossDomain({ siteUrl }),
        ],
    } satisfies BetterAuthOptions;
};

// For `@better-auth/cli`
export const options = createAuthOptions({} as GenericCtx<DataModel>);

// Better Auth Instance
export const createAuth = (ctx: GenericCtx<DataModel>) => {
    return betterAuth(createAuthOptions(ctx));
};
