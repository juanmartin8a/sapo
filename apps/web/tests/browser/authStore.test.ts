import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createRoot, createStore, flush } from "solid-js";
import { createTestServer } from "../helpers/vite.ts";
import { readAccountPreview } from "../../src/lib/auth-preview.ts";
import type { AuthBootstrap } from "../../src/lib/auth-bootstrap.ts";

type User = { id: string; name: string; email: string };
type SessionResult = { data: { user: User } | null; error?: unknown };
type Subscription = {
    has_active_subscription: boolean;
    status?: string;
    access_expires_at_ms?: number;
};
const user: User = { id: "first", name: "First", email: "first@example.com" };
let session: SessionResult = { data: { user } };
let readSession = async (): Promise<SessionResult> => session;
let readUser = async () =>
    session.data ? { _id: session.data.user.id, ...session.data.user } : null;
let listeners: { update: (value: Subscription) => void; error: () => void; active: boolean }[] = [];
let authChanges = 0;
let cachedSession: unknown = null;
let cookie = "";
let cacheReads = 0;
let tokenCalls = 0;
const runtime = {
    createStore,
    clearConvexAccessToken() {},
    clearLegacyAuth() {},
    migrateLegacySession: async () => false,
    readLegacyAccountPreview: () =>
        readAccountPreview({
            getSessionData: () => {
                cacheReads++;
                return cachedSession;
            },
            getCookie: () => cookie,
        }),
    getAuthClient: () => ({
        getSession: () => readSession(),
        getSessionData: () => {
            cacheReads++;
            return cachedSession;
        },
        getCookie: () => cookie,
        signOut: async () => {
            session = { data: null };
            cachedSession = null;
            cookie = "";
            return {};
        },
    }),
    getConvexAccessToken: async () => {
        tokenCalls++;
        return "verified-token";
    },
    isAuthConfigured: true,
    ConvexHttpClient: class {
        setAuth() {}
        query() {
            return readUser();
        }
    },
    ConvexClient: class {
        setAuth() {
            authChanges++;
        }
        onUpdate(
            _query: unknown,
            _args: unknown,
            update: (value: Subscription) => void,
            error: () => void,
        ) {
            const listener = { update, error, active: true };
            listeners.push(listener);
            return () => {
                listener.active = false;
            };
        }
        async close() {}
    },
};
Object.assign(globalThis, { __sapoAuthTest: runtime });
const server = await createTestServer({
    define: { "import.meta.env.VITE_CONVEX_URL": JSON.stringify("https://test.convex.cloud") },
    ssr: { noExternal: ["convex", "solid-js"] },
    plugins: [
        {
            name: "auth-test-services",
            enforce: "pre",
            resolveId(id) {
                if (id === "@/lib/auth-preview")
                    return fileURLToPath(new URL("../../src/lib/auth-preview.ts", import.meta.url));
                if (
                    [
                        "solid-js",
                        "@/lib/auth-client",
                        "@/lib/auth-legacy",
                        "convex/browser",
                        "@sapo/backend/api",
                    ].includes(id)
                )
                    return `\0${id}`;
            },
            load(id) {
                if (id === "\0solid-js")
                    return "export const { createStore } = globalThis.__sapoAuthTest;";
                if (id === "\0@/lib/auth-client")
                    return "export const { clearConvexAccessToken, getAuthClient, getConvexAccessToken, isAuthConfigured } = globalThis.__sapoAuthTest;";
                if (id === "\0convex/browser")
                    return "export const { ConvexClient, ConvexHttpClient } = globalThis.__sapoAuthTest;";
                if (id === "\0@/lib/auth-legacy")
                    return "export const { clearLegacyAuth, readLegacyAccountPreview } = globalThis.__sapoAuthTest; export const migrateLegacySession = () => globalThis.__sapoAuthTest.migrateLegacySession();";
                if (id === "\0@sapo/backend/api")
                    return "export const api = { auth: { getCurrentUser: 'user' }, subscription: { getCurrentSubscriptionStatus: 'plan' } };";
            },
        },
    ],
});
after(() => server.close());
const { createAuthStore } = (await server.ssrLoadModule(
    "/src/stores/authStore.ts",
)) as typeof import("../../src/stores/authStore.ts");

function setup(
    options: { cache?: unknown; cookie?: string; href?: string; initialAuth?: AuthBootstrap } = {},
) {
    session = { data: { user } };
    readSession = async () => session;
    readUser = async () =>
        session.data ? { _id: session.data.user.id, ...session.data.user } : null;
    listeners = [];
    authChanges = 0;
    cachedSession = options.cache ?? null;
    cookie = options.cookie ?? "";
    cacheReads = 0;
    tokenCalls = 0;
    runtime.migrateLegacySession = async () => false;
    Object.assign(globalThis, {
        window: { location: { href: options.href ?? "https://sapo.example/" } },
    });
    let dispose!: () => void;
    const auth = createRoot((cleanup) => {
        dispose = cleanup;
        return createAuthStore(options.initialAuth);
    });
    return {
        auth,
        dispose() {
            auth.dispose();
            dispose();
        },
    };
}

async function authenticate(auth: ReturnType<typeof createAuthStore>) {
    await auth.refreshSession();
    listeners.at(-1)!.update({ has_active_subscription: true });
    flush();
    assert.equal(auth.state.status, "authenticated");
    assert.equal(auth.state.hasActiveSubscription, true);
}

test("focus revalidation preserves the account, plan, and live subscription", async () => {
    const { auth, dispose } = setup();
    try {
        assert.equal(auth.state.status, "checking");
        assert.equal(auth.state.userId, null);
        await authenticate(auth);
        const listener = listeners[0];
        const previousAuthChanges = authChanges;
        let finish!: (value: Awaited<ReturnType<typeof readUser>>) => void;
        readUser = () =>
            new Promise((resolve) => {
                finish = resolve;
            });
        const refresh = auth.refreshSession();
        // Let revalidation reach the authoritative user request.
        await new Promise<void>((resolve) => setImmediate(resolve));
        flush();
        assert.equal(auth.state.status, "authenticated");
        assert.equal(auth.state.userId, user.id);
        assert.equal(auth.state.hasActiveSubscription, true);
        assert.equal(listener.active, true);
        finish({ _id: user.id, ...user });
        await refresh;
        flush();
        assert.equal(listeners.length, 1);
        assert.equal(authChanges, previousAuthChanges);
        listener.update({ has_active_subscription: false });
        flush();
        assert.equal(auth.state.hasActiveSubscription, false);
    } finally {
        dispose();
    }
});

test("SSR identity is available before mounting and never implies paid access", async () => {
    const { auth, dispose } = setup({
        initialAuth: {
            status: "authenticated",
            account: {
                userId: user.id,
                name: user.name,
                email: user.email,
                expiresAtMs: Date.now() + 60_000,
            },
        },
    });
    try {
        assert.equal(auth.state.status, "authenticated");
        assert.equal(auth.state.name, user.name);
        assert.equal(auth.state.hasActiveSubscription, null);
        assert.equal(cacheReads, 0);
        readUser = async () => {
            throw new Error("offline");
        };
        await auth.initialize();
        flush();
        assert.equal(auth.state.name, user.name);
        assert.equal(auth.state.status, "authenticated");
        assert.equal(auth.state.hasActiveSubscription, null);
        assert.ok(auth.state.error);
    } finally {
        dispose();
    }
});

test("a fresh SSR account connects once without repeating session reads", async () => {
    const { auth, dispose } = setup({
        initialAuth: {
            status: "authenticated",
            account: {
                userId: user.id,
                name: user.name,
                email: user.email,
                expiresAtMs: Date.now() + 60_000,
            },
        },
    });
    try {
        readSession = async () => {
            throw new Error("Unexpected session fetch");
        };
        await auth.initialize();
        flush();
        assert.equal(auth.state.status, "authenticated");
        assert.equal(auth.state.name, user.name);
        assert.equal(tokenCalls, 1);
        assert.equal(listeners.length, 1);
        assert.equal(auth.state.hasActiveSubscription, null);
        assert.equal(auth.state.error, null);
    } finally {
        dispose();
    }
});

test("known guests render signed out and do not make an initial session request", async () => {
    const { auth, dispose } = setup({ initialAuth: { status: "signed_out", account: null } });
    try {
        let reads = 0;
        readSession = async () => {
            ++reads;
            return { data: null };
        };
        assert.equal(auth.state.status, "signed_out");
        await auth.initialize();
        await auth.refreshIfStale();
        assert.equal(reads, 0);
        assert.equal(cacheReads, 0);
    } finally {
        dispose();
    }
});

test("focus events reuse a fresh account and coalesce stale revalidation", async (context) => {
    context.mock.timers.enable({ apis: ["Date"] });
    const { auth, dispose } = setup();
    try {
        await authenticate(auth);
        let reads = 0;
        readSession = async () => {
            ++reads;
            return session;
        };
        await Promise.all([auth.refreshIfStale(), auth.refreshIfStale()]);
        assert.equal(reads, 0);
        context.mock.timers.tick(5 * 60 * 1000);
        await Promise.all([auth.refreshIfStale(), auth.refreshIfStale()]);
        assert.equal(reads, 2); // Initial and confirming session checks, shared by both events.
        assert.equal(listeners.length, 1);
    } finally {
        dispose();
    }
});

test("a migrated session is checked even when SSR had no first-party cookie", async () => {
    const { auth, dispose } = setup({ initialAuth: { status: "signed_out", account: null } });
    runtime.migrateLegacySession = async () => true;
    try {
        await auth.initialize();
        flush();
        assert.equal(auth.state.status, "authenticated");
        assert.equal(auth.state.userId, user.id);
    } finally {
        dispose();
    }
});

test("focus cannot race an in-progress legacy migration", async () => {
    const { auth, dispose } = setup({ initialAuth: { status: "signed_out", account: null } });
    let finish!: (migrated: boolean) => void;
    runtime.migrateLegacySession = () =>
        new Promise((resolve) => {
            finish = resolve;
        });
    try {
        let reads = 0;
        readSession = async () => {
            ++reads;
            return session;
        };
        const initialized = auth.initialize();
        const focus = auth.refreshIfStale();
        assert.equal(reads, 0);
        finish(true);
        await Promise.all([initialized, focus]);
        flush();
        assert.equal(auth.state.status, "authenticated");
        assert.equal(reads, 2);
    } finally {
        dispose();
    }
});

test("network failures preserve verified identity, while a missing session signs out", async () => {
    const { auth, dispose } = setup();
    try {
        await authenticate(auth);
        readSession = async () => {
            throw new Error("offline");
        };
        await auth.refreshSession();
        flush();
        assert.equal(auth.state.status, "authenticated");
        assert.equal(auth.state.userId, user.id);
        assert.equal(listeners[0].active, true);
        assert.ok(auth.state.error);
        readSession = async () => ({ data: null });
        await auth.refreshSession();
        flush();
        assert.equal(auth.state.status, "signed_out");
        assert.equal(auth.state.userId, null);
        assert.equal(auth.state.hasActiveSubscription, null);
        assert.equal(listeners[0].active, false);
        listeners[0].update({ has_active_subscription: true });
        flush();
        assert.equal(auth.state.hasActiveSubscription, null);
    } finally {
        dispose();
    }
});

test("an initial verification failure stays unresolved and can be retried", async () => {
    const { auth, dispose } = setup();
    try {
        readSession = async () => ({ data: null, error: { status: 503 } });
        await auth.refreshSession();
        flush();
        assert.equal(auth.state.status, "checking");
        assert.equal(auth.state.userId, null);
        assert.ok(auth.state.error);
        readSession = async () => session;
        await authenticate(auth);
    } finally {
        dispose();
    }
});

test("switching accounts clears the previous identity before verification", async () => {
    const { auth, dispose } = setup();
    try {
        await authenticate(auth);
        const oldListener = listeners[0];
        const nextUser = { ...user, id: "second", name: "Second" };
        session = { data: { user: nextUser } };
        let finish!: (value: Awaited<ReturnType<typeof readUser>>) => void;
        readUser = () =>
            new Promise((resolve) => {
                finish = resolve;
            });
        const refresh = auth.refreshSession();
        await new Promise<void>((resolve) => setImmediate(resolve));
        flush();
        assert.equal(auth.state.status, "checking");
        assert.equal(auth.state.userId, null);
        assert.equal(auth.state.hasActiveSubscription, null);
        assert.equal(oldListener.active, false);
        finish({ _id: nextUser.id, ...nextUser });
        await refresh;
        flush();
        assert.equal(auth.state.userId, nextUser.id);
        oldListener.update({ has_active_subscription: true });
        flush();
        assert.equal(auth.state.hasActiveSubscription, null);
    } finally {
        dispose();
    }
});

test("an in-flight refresh cannot restore identity after sign-out", async () => {
    const { auth, dispose } = setup();
    try {
        await authenticate(auth);
        let finish!: (value: Awaited<ReturnType<typeof readUser>>) => void;
        readUser = () =>
            new Promise((resolve) => {
                finish = resolve;
            });
        const refresh = auth.refreshSession();
        await new Promise<void>((resolve) => setImmediate(resolve));
        const signedOut = auth.signOut();
        flush();
        assert.equal(auth.state.status, "signed_out");
        finish({ _id: user.id, ...user });
        await Promise.all([refresh, signedOut]);
        flush();
        assert.equal(auth.state.status, "signed_out");
        assert.equal(auth.state.sessionRevision, 1);
        assert.equal(auth.state.userId, null);
    } finally {
        dispose();
    }
});

test("a plan subscription failure can be recovered by refreshing", async () => {
    const { auth, dispose } = setup();
    try {
        await authenticate(auth);
        listeners[0].error();
        flush();
        assert.equal(auth.state.hasActiveSubscription, null);
        await auth.refreshSession();
        assert.equal(listeners.length, 2);
        assert.equal(listeners[0].active, false);
        listeners[1].update({ has_active_subscription: true });
        flush();
        assert.equal(auth.state.hasActiveSubscription, true);
    } finally {
        dispose();
    }
});

test("plan expiry clears access and renews the authoritative subscription", async (context) => {
    const { auth, dispose } = setup();
    context.mock.timers.enable({ apis: ["setTimeout", "Date"] });
    try {
        await authenticate(auth);
        listeners[0].update({
            has_active_subscription: true,
            access_expires_at_ms: Date.now() + 1000,
        });
        context.mock.timers.tick(1100);
        flush();
        assert.equal(auth.state.hasActiveSubscription, null);
        await new Promise<void>((resolve) => setImmediate(resolve));
        assert.equal(listeners.length, 2);
        assert.equal(listeners[0].active, false);
        listeners[1].update({ has_active_subscription: false });
        flush();
        assert.equal(auth.state.status, "authenticated");
        assert.equal(auth.state.hasActiveSubscription, false);
    } finally {
        dispose();
    }
});

test("authoritative rejection clears a previously verified account", async () => {
    const { auth, dispose } = setup();
    try {
        await authenticate(auth);
        readUser = async () => null;
        await auth.refreshSession();
        flush();
        assert.equal(auth.state.status, "signed_out");
        assert.equal(auth.state.userId, null);
        assert.equal(auth.state.hasActiveSubscription, null);
        assert.equal(listeners[0].active, false);
    } finally {
        dispose();
    }
});

function previewOptions(expiresAtMs = Date.now() + 60_000) {
    return {
        cache: {
            user: { ...user, name: "Cached Alice", image: "https://untrusted.example/image" },
            session: {
                userId: user.id,
                token: "session-a",
                expiresAt: new Date(expiresAtMs).toISOString(),
            },
            status: "authenticated",
            hasActiveSubscription: true,
        },
        cookie: "__Secure-better-auth.session_token=session-a.signature",
    };
}

test("cached account display appears immediately without granting identity or plan access", async () => {
    const { auth, dispose } = setup(previewOptions());
    const preview = () => auth.state.accountPreview;
    try {
        // Construction stays identical for SSR and hydration; storage is read on mount.
        assert.equal(cacheReads, 0);
        assert.equal(preview(), null);
        let finish!: (value: Awaited<ReturnType<typeof readUser>>) => void;
        readUser = () =>
            new Promise((resolve) => {
                finish = resolve;
            });
        const refresh = auth.refreshSession();
        flush();
        assert.equal(cacheReads, 1);
        assert.equal(preview()?.name, "Cached Alice");
        assert.equal(auth.state.status, "checking");
        assert.equal(auth.state.userId, null);
        assert.equal(auth.state.name, null);
        assert.equal(auth.state.email, null);
        assert.equal(auth.state.hasActiveSubscription, null);
        assert.equal(tokenCalls, 0);
        assert.equal(listeners.length, 0);
        await new Promise<void>((resolve) => setImmediate(resolve));
        // Better Auth responded, but Convex has not confirmed the account yet.
        assert.equal(preview()?.name, "Cached Alice");
        assert.equal(auth.state.userId, null);
        assert.equal(auth.state.status, "checking");
        finish({ _id: user.id, ...user });
        await refresh;
        flush();
        assert.equal(auth.state.status, "authenticated");
        assert.equal(auth.state.userId, user.id);
        assert.equal(auth.state.name, user.name);
        assert.equal(preview(), null);
        assert.equal(auth.state.hasActiveSubscription, null);
    } finally {
        dispose();
    }
});

test("a cached account remains display-only offline and clears when the server denies it", async () => {
    const { auth, dispose } = setup(previewOptions());
    try {
        readSession = async () => {
            throw new Error("offline");
        };
        await auth.refreshSession();
        flush();
        assert.equal(auth.state.accountPreview?.name, "Cached Alice");
        assert.equal(auth.state.status, "checking");
        assert.equal(auth.state.userId, null);
        assert.equal(auth.state.hasActiveSubscription, null);
        assert.equal(tokenCalls, 0);
        assert.equal(listeners.length, 0);
        readSession = async () => ({ data: null });
        await auth.refreshSession();
        flush();
        assert.equal(auth.state.status, "signed_out");
        assert.equal(auth.state.accountPreview, null);
        assert.equal(cacheReads, 1);
    } finally {
        dispose();
    }
});

test("a different live account discards the cached name before Convex verification", async () => {
    const { auth, dispose } = setup(previewOptions());
    try {
        const nextUser = { ...user, id: "second", name: "Second" };
        session = { data: { user: nextUser } };
        let finish!: (value: Awaited<ReturnType<typeof readUser>>) => void;
        readUser = () =>
            new Promise((resolve) => {
                finish = resolve;
            });
        const refresh = auth.refreshSession();
        await new Promise<void>((resolve) => setImmediate(resolve));
        flush();
        assert.equal(auth.state.accountPreview, null);
        assert.equal(auth.state.status, "checking");
        assert.equal(auth.state.userId, null);
        finish({ _id: nextUser.id, ...nextUser });
        await refresh;
        flush();
        assert.equal(auth.state.name, "Second");
        assert.equal(auth.state.userId, "second");
    } finally {
        dispose();
    }
});

test("unauthorized responses clear cached identity at either session check", async () => {
    for (const rejectAt of [1, 2]) {
        const { auth, dispose } = setup(previewOptions());
        try {
            let requests = 0;
            readSession = async () =>
                ++requests === rejectAt ? { data: null, error: { status: 401 } } : session;
            await auth.refreshSession();
            flush();
            assert.equal(auth.state.accountPreview, null);
            assert.equal(auth.state.status, "signed_out");
            assert.equal(auth.state.userId, null);
            assert.equal(auth.state.hasActiveSubscription, null);
        } finally {
            dispose();
        }
    }
});

test("cached display expires even when the session check cannot reach the server", async (context) => {
    context.mock.timers.enable({ apis: ["setTimeout", "Date"] });
    const { auth, dispose } = setup(previewOptions(Date.now() + 1000));
    try {
        readSession = async () => {
            throw new Error("offline");
        };
        await auth.refreshSession();
        flush();
        assert.equal(auth.state.accountPreview?.name, "Cached Alice");
        context.mock.timers.tick(1000);
        flush();
        assert.equal(auth.state.accountPreview, null);
        assert.equal(auth.state.userId, null);
        assert.equal(auth.state.status, "checking");
    } finally {
        dispose();
    }
});

test("OAuth callbacks and sign-in errors do not show the previous cached account", async () => {
    for (const search of ["?ott=new-session", "?error=access_denied"]) {
        const { auth, dispose } = setup({
            ...previewOptions(),
            href: `https://sapo.example/${search}`,
        });
        try {
            readSession = async () => {
                throw new Error("offline");
            };
            await auth.refreshSession();
            flush();
            assert.equal(auth.state.accountPreview, null);
            assert.equal(cacheReads, 0);
        } finally {
            dispose();
        }
    }
});

test("sign-out clears the preview and a pending response cannot restore it", async () => {
    const { auth, dispose } = setup(previewOptions());
    try {
        let finish!: (value: SessionResult) => void;
        readSession = () =>
            new Promise((resolve) => {
                finish = resolve;
            });
        const refresh = auth.refreshSession();
        await new Promise<void>((resolve) => setImmediate(resolve));
        flush();
        assert.equal(auth.state.accountPreview?.name, "Cached Alice");
        const signedOut = auth.signOut();
        flush();
        assert.equal(auth.state.accountPreview, null);
        finish({ data: { user } });
        await Promise.all([refresh, signedOut]);
        flush();
        assert.equal(auth.state.status, "signed_out");
        assert.equal(auth.state.accountPreview, null);
        assert.equal(auth.state.userId, null);
        assert.equal(listeners.length, 0);
    } finally {
        dispose();
    }
});

test("cross-tab session changes immediately revoke local access and supersede pending checks", async () => {
    const { auth, dispose } = setup(previewOptions());
    try {
        await authenticate(auth);
        const oldListener = listeners[0];
        let finish!: (value: SessionResult) => void;
        readSession = () =>
            new Promise((resolve) => {
                finish = resolve;
            });
        const refresh = auth.refreshSession();
        await new Promise<void>((resolve) => setImmediate(resolve));
        const changed = auth.handleSessionChange();
        const changedAgain = auth.handleSessionChange();
        flush();
        assert.equal(auth.state.status, "checking");
        assert.equal(auth.state.userId, null);
        assert.equal(auth.state.accountPreview, null);
        assert.equal(auth.state.hasActiveSubscription, null);
        assert.equal(oldListener.active, false);
        session = { data: { user: { ...user, id: "second", name: "Second" } } };
        readSession = async () => session;
        finish({ data: { user } });
        await Promise.all([refresh, changed, changedAgain]);
        flush();
        assert.equal(auth.state.status, "authenticated");
        assert.equal(auth.state.userId, "second");
        assert.equal(auth.state.name, "Second");
        assert.equal(cacheReads, 1);
        oldListener.update({ has_active_subscription: true });
        flush();
        assert.equal(auth.state.hasActiveSubscription, null);
    } finally {
        dispose();
    }
});

test("disposed stores do not restore previews or start another session check", async () => {
    const { auth, dispose } = setup(previewOptions());
    dispose();
    await auth.refreshSession();
    await auth.handleSessionChange();
    assert.equal(cacheReads, 0);
    assert.equal(tokenCalls, 0);
});
