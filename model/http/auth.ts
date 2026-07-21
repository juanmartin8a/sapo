import { httpAction, type ActionCtx } from "../../_generated/server";
import { isAllowedCorsRequest } from "./cors";

import { authComponent } from "../../betterAuth/auth";
import { hasSignInProviderAccount } from "../../betterAuth/model/providerAccount";
import { resolveBetterAuthUserId } from "../../betterAuth/model/user";

type AuthenticatedUser = NonNullable<Awaited<ReturnType<typeof authComponent.safeGetAuthUser>>>;

export type AuthenticatedHttpContext = {
    user: AuthenticatedUser;
    userId: string;
};

type AnyHttpContext = AuthenticatedHttpContext;

type AuthenticatedHttpHandler = (
    ctx: ActionCtx,
    request: Request,
    auth: AuthenticatedHttpContext,
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

    if (!(await hasSignInProviderAccount(ctx, userId))) {
        return null;
    }

    return {
        user,
        userId,
    };
}

export const authenticatedHttpAction = (
    handler: AuthenticatedHttpHandler,
    getResponseHeaders: (request: Request) => Headers,
) => {
    return httpAction(async (ctx, request) => {
        if (!isAllowedCorsRequest(request)) {
            return new Response("Forbidden", {
                status: 403,
                headers: getResponseHeaders(request),
            });
        }

        const auth = await resolveHttpContext(ctx);

        if (!auth) {
            return new Response("Unauthorized", {
                status: 401,
                headers: getResponseHeaders(request),
            });
        }

        return handler(ctx, request, auth);
    });
};
