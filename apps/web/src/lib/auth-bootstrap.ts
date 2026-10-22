// Only display identity crosses the SSR boundary. Tokens and plan access do not.
export type AuthBootstrap = {
    status: "authenticated" | "signed_out" | "checking";
    account: {
        userId: string;
        name: string | null;
        email: string;
        expiresAtMs: number;
    } | null;
};

export const AUTH_BASE_PATH = "/app/api/auth";
export const AUTH_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
