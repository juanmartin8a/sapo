import type { BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";

export const DEMO_ACCESS_EMAIL = "juanmarzabala8a@hotmail.com";

export function matchesDemoCode(code: string, expected: string | undefined): boolean {
    if (!expected || !/^\d{6}$/.test(expected) || !/^\d{6}$/.test(code)) return false;
    let difference = 0;
    for (let index = 0; index < 6; index += 1) {
        difference |= code.charCodeAt(index) ^ expected.charCodeAt(index);
    }
    return difference === 0;
}

export const demoAccess = () => ({
    id: "demo-access",
    endpoints: {
        signInDemo: createAuthEndpoint("/sign-in/demo", {
            method: "POST",
            body: z.object({ code: z.string().regex(/^\d{6}$/) }),
        }, async (ctx) => {
            const userId = process.env.DEMO_ACCESS_USER_ID;
            if (!userId || !matchesDemoCode(ctx.body.code, process.env.DEMO_ACCESS_CODE)) {
                throw ctx.error("UNAUTHORIZED", { message: "Demo access is unavailable or the code is incorrect." });
            }

            // Look up the designated email through its index, then check the explicit ID.
            // Passing an operator-supplied ID to findUserById can crash Convex db.get.
            const account = await ctx.context.internalAdapter.findUserByEmail(DEMO_ACCESS_EMAIL);
            const user = account?.user;
            if (user && user.id !== userId) {
                console.warn("Demo access configuration error: DEMO_ACCESS_USER_ID must equal the userId returned by auth:provisionDemoUser (the demo user's _id in the betterAuth component).");
                throw ctx.error("SERVICE_UNAVAILABLE", { message: "Demo access is not configured correctly. Please contact support." });
            }
            if (!user) {
                throw ctx.error("UNAUTHORIZED", { message: "Demo access is unavailable or the code is incorrect." });
            }
            const session = await ctx.context.internalAdapter.createSession(user.id);
            if (!session) throw ctx.error("INTERNAL_SERVER_ERROR", { message: "Unable to sign in." });
            await setSessionCookie(ctx, { session, user });
            return ctx.json({ success: true });
        }),
    },
} satisfies BetterAuthPlugin);
