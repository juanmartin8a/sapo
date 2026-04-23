import { httpAction, type ActionCtx } from "./_generated/server";

import { authComponent } from "./betterAuth/auth";
import {
    isBetterAuthUserAnonymous,
    resolveBetterAuthUserId,
} from "./betterAuth/user";

type AuthenticatedUser = NonNullable<Awaited<ReturnType<typeof authComponent.safeGetAuthUser>>>;

type AuthenticatedHttpContext = {
    user: AuthenticatedUser;
    userId: string;
    isAnonymous: boolean;
};

type AnyHttpContext = AuthenticatedHttpContext;

type AuthenticatedHttpHandler = (
    ctx: ActionCtx,
    request: Request,
    auth: AuthenticatedHttpContext,
) => Promise<Response>;

type AuthenticatedOrAnonymousHttpHandler = (
    ctx: ActionCtx,
    request: Request,
    auth: AnyHttpContext,
) => Promise<Response>;

async function resolveHttpContext(
    ctx: ActionCtx
): Promise<AnyHttpContext | null> {
    const user = await authComponent.safeGetAuthUser(ctx);

    if (!user) {
        return null;
    }

    const userId = resolveBetterAuthUserId(user);

    if (!userId) {
        return null;
    }

    return {
        user,
        userId,
        isAnonymous: isBetterAuthUserAnonymous(user),
    };
}

export const authenticatedHttpAction = (
    handler: AuthenticatedHttpHandler,
    getResponseHeaders: () => Headers,
) => {
    return httpAction(async (ctx, request) => {
        const auth = await resolveHttpContext(ctx);

        if (!auth || auth.isAnonymous) {
            return new Response("Unauthorized", {
                status: 401,
                headers: getResponseHeaders(),
            });
        }

        return handler(ctx, request, auth);
    });
};

export const authenticatedOrAnonymousHttpAction = (
    handler: AuthenticatedOrAnonymousHttpHandler,
    getResponseHeaders: () => Headers,
) => {
    return httpAction(async (ctx, request) => {
        const auth = await resolveHttpContext(ctx);

        if (!auth) {
            return new Response("Unauthorized", {
                status: 401,
                headers: getResponseHeaders(),
            });
        }

        return handler(ctx, request, auth);
    });
};
