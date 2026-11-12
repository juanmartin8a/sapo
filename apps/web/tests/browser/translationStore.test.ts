import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createEffect, createMemo, createRoot, createStore, flush } from "solid-js";
import { runTranslationStream } from "@sapo/client-core/translation-stream";
import { createTestServer } from "../helpers/vite.ts";

const runtime = {
    createEffect,
    createMemo,
    createStore,
    runTranslationStream: (async () => ({ type: "completed" })) as typeof runTranslationStream,
    getSession: async () => ({ data: { user: { id: "account" } } }),
};
Object.assign(globalThis, { __sapoTranslationTest: runtime });
const server = await createTestServer({
    ssr: { noExternal: ["solid-js"] },
    define: { "import.meta.env.VITE_CONVEX_SITE_URL": JSON.stringify("https://test.convex.site") },
    resolve: { alias: { "@": new URL("../../src", import.meta.url).pathname } },
    plugins: [
        {
            name: "translation-test-services",
            enforce: "pre",
            resolveId(id) {
                if (id === "solid-js" || id === "@sapo/client-core/translation-stream")
                    return `\0${id}`;
                if (id.endsWith("/auth-client")) return "\0auth-client";
            },
            load(id) {
                if (id === "\0solid-js")
                    return "export const { createEffect, createMemo, createStore } = globalThis.__sapoTranslationTest;";
                if (id === "\0@sapo/client-core/translation-stream")
                    return "export const runTranslationStream = (...args) => globalThis.__sapoTranslationTest.runTranslationStream(...args);";
                if (id === "\0auth-client")
                    return `export const getAuthClient = () => ({ getSession: () => globalThis.__sapoTranslationTest.getSession() });
                            export const getConvexAccessToken = async () => "verified-token";`;
            },
        },
    ],
});
after(() => server.close());
const { createTranslationStore } = (await server.ssrLoadModule(
    "/src/stores/translationStore.ts",
)) as typeof import("../../src/stores/translationStore.ts");
const { watchRespellAccess } = (await server.ssrLoadModule(
    "/src/providers/respell-access.ts",
)) as typeof import("../../src/providers/respell-access.ts");

function accessStore(status: "checking" | "authenticated" | "signed_out") {
    const store = createRoot((dispose) => {
        after(dispose);
        const [auth, setAuth] = createStore({
            status,
            hasActiveSubscription: null as boolean | null,
        });
        const translation = createTranslationStore();
        watchRespellAccess(auth, translation);
        return { auth, setAuth, translation };
    });
    flush();
    // Preferences are restored after the provider's access watcher is created.
    store.translation.setPreferences({ operation: "respell", translateThenRespell: true });
    flush();
    return store;
}

test("restoring Respell while signed out falls back to Translate", () => {
    const { translation } = accessStore("signed_out");
    assert.equal(translation.state.operation, "translate");
    assert.equal(translation.state.translateThenRespell, true);
});

test("signing out while in Respell falls back to Translate", () => {
    const { setAuth, translation } = accessStore("authenticated");
    setAuth((draft) => {
        draft.hasActiveSubscription = true;
    });
    flush();
    assert.equal(translation.state.operation, "respell");
    setAuth((draft) => {
        draft.status = "signed_out";
        draft.hasActiveSubscription = null;
    });
    flush();
    assert.equal(translation.state.operation, "translate");
});

test("Respell is preserved while auth and plan access are unresolved", () => {
    const { setAuth, translation } = accessStore("checking");
    assert.equal(translation.state.operation, "respell");
    setAuth((draft) => {
        draft.status = "authenticated";
    });
    flush();
    assert.equal(translation.state.operation, "respell");
    setAuth((draft) => {
        draft.hasActiveSubscription = true;
    });
    flush();
    assert.equal(translation.state.operation, "respell");
});

test("confirmed loss of subscription access falls back to Translate", () => {
    const { setAuth, translation } = accessStore("authenticated");
    setAuth((draft) => {
        draft.hasActiveSubscription = false;
    });
    flush();
    assert.equal(translation.state.operation, "translate");
});

function store() {
    return createRoot((dispose) => {
        after(dispose);
        return createTranslationStore();
    });
}

test("translation state is isolated and preserves combined output and Unicode counts", async () => {
    const first = store();
    const second = store();
    first.setInput("A🐸");
    first.setPreferences({ operation: "respell", translateThenRespell: true });
    flush();
    assert.equal(first.characterCount(), 2);
    assert.equal(first.operationLabel(), "Translate & Respell");
    runtime.runTranslationStream = async (args, callbacks, dependencies) => {
        assert.equal(args.input, "A🐸");
        assert.equal(args.translateThenRespell, true);
        assert.deepEqual(await dependencies.getAuthContext(), {
            token: "verified-token",
            userId: "account",
        });
        callbacks.onToken({ type: "translation_preview", value: "Hello" });
        callbacks.onToken({ type: "word", output: "Jelou" });
        return { type: "completed" };
    };
    await first.sendMessage("account");
    flush();
    assert.equal(first.state.translationPreview, "Hello");
    assert.equal(first.state.displayText, "Jelou");
    assert.equal(first.state.status, "completed");
    assert.equal(first.isRepeat(), true);
    assert.equal(second.state.input, "");
    assert.equal(second.state.displayText, "");
    assert.equal(second.state.operation, "translate");
});

test("clearing an in-flight request cancels it and ignores its late output and completion", async () => {
    const translation = store();
    let finish!: () => void;
    let pendingArgs!: Parameters<typeof runTranslationStream>[0];
    let pendingCallbacks!: Parameters<typeof runTranslationStream>[1];
    let calls = 0;
    runtime.runTranslationStream = async (args, callbacks) => {
        calls++;
        pendingArgs = args;
        pendingCallbacks = callbacks;
        await new Promise<void>((resolve) => {
            finish = resolve;
        });
        return { type: "completed" };
    };
    translation.setInput("Private input");
    flush();
    const pending = translation.sendMessage("account");
    await translation.sendMessage("account");
    assert.equal(calls, 1);
    assert.equal(translation.busy(), true);
    translation.clear();
    flush();
    assert.equal(pendingArgs.abortController.signal.aborted, true);
    pendingCallbacks.onToken({ type: "translate", value: "Stale output" });
    finish();
    await pending;
    flush();
    assert.equal(translation.state.status, "idle");
    assert.equal(translation.state.input, "");
    assert.equal(translation.state.displayText, "");
    assert.equal(translation.isRepeat(), false);
});

test("a deadline reports an error even though the shared stream aborts its controller", async () => {
    const translation = store();
    runtime.runTranslationStream = async (args) => {
        args.abortController.abort();
        return { type: "timeout", reason: "idle" };
    };
    translation.setInput("Hello");
    flush();
    await translation.sendMessage("account");
    flush();
    assert.equal(translation.state.status, "error");
    assert.equal(translation.state.error, "The request timed out. Please try again.");
    assert.equal(translation.busy(), false);
});

for (const outcome of ["inactive", "stopped", "cancelled"] as const) {
    test(`a stream deadline cannot complete successfully when it returns ${outcome}`, async () => {
        const translation = store();
        runtime.runTranslationStream = async (args) => {
            args.abortController.abort();
            return { type: outcome };
        };
        translation.setInput("Hello");
        flush();
        await translation.sendMessage("account");
        flush();
        assert.equal(translation.state.status, "error");
        assert.equal(translation.state.error, "The request timed out. Please try again.");
    });
}

test("an intentional stop preserves partial output without reporting a deadline error", async () => {
    const translation = store();
    let finish!: () => void;
    runtime.runTranslationStream = async (args, callbacks) => {
        callbacks.onToken({ type: "translate", value: "Partial output" });
        await new Promise<void>((resolve) => {
            finish = resolve;
        });
        assert.equal(args.abortController.signal.aborted, true);
        return { type: "timeout", reason: "idle" };
    };
    translation.setInput("Hello");
    flush();
    const pending = translation.sendMessage("account");
    flush();
    translation.stopStream();
    finish();
    await pending;
    flush();
    assert.equal(translation.state.status, "stopped");
    assert.equal(translation.state.displayText, "Partial output");
    assert.equal(translation.state.error, null);
    assert.equal(translation.busy(), false);
});

test("the real stream's total deadline during authentication cannot complete a translation", async (context) => {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    context.mock.method(runtime, "runTranslationStream", runTranslationStream);
    const fetch = context.mock.method(globalThis, "fetch", async () => {
        throw new Error("An expired request must not reach the translation endpoint.");
    });
    let finishSession!: (session: Awaited<ReturnType<typeof runtime.getSession>>) => void;
    let firstSession = true;
    context.mock.method(runtime, "getSession", async () => {
        if (firstSession) {
            firstSession = false;
            return new Promise<Awaited<ReturnType<typeof runtime.getSession>>>((resolve) => {
                finishSession = resolve;
            });
        }
        return { data: { user: { id: "account" } } };
    });
    const translation = store();
    translation.setInput("Hello");
    flush();
    const pending = translation.sendMessage("account");
    context.mock.timers.tick(135_000);
    finishSession({ data: { user: { id: "account" } } });
    await pending;
    flush();
    assert.equal(fetch.mock.callCount(), 0);
    assert.equal(translation.state.status, "error");
    assert.equal(translation.state.error, "The request timed out. Please try again.");
});

test("local translation requires no account and repeat identity includes the model", async () => {
    let model = "first";
    let cloudCalls = 0;
    runtime.runTranslationStream = async () => {
        cloudCalls++;
        return { type: "completed" };
    };
    const translation = createRoot((dispose) => {
        after(dispose);
        return createTranslationStore({
            enabled: () => true,
            identity: () => model,
            translate: async (request, _signal, onText) => {
                assert.equal(request.input, "Hello");
                onText("Hola");
            },
        });
    });
    translation.setInput("Hello");
    flush();
    await translation.sendMessage();
    flush();
    assert.equal(cloudCalls, 0);
    assert.equal(translation.state.displayText, "Hola");
    assert.equal(translation.state.status, "completed");
    assert.equal(translation.isRepeat(), true);
    model = "second";
    assert.equal(translation.isRepeat(), false);
});

for (const localEnabled of [true, false]) {
    test(`respelling uses online and restores the ${localEnabled ? "local" : "online"} translation provider`, async () => {
        let localCalls = 0;
        let onlineCalls = 0;
        runtime.runTranslationStream = async (args, callbacks) => {
            onlineCalls++;
            callbacks.onToken({ type: "word", output: args.operation });
            return { type: "completed" };
        };
        const translation = createRoot((dispose) => {
            after(dispose);
            return createTranslationStore({
                enabled: () => localEnabled,
                identity: () => "selected-model",
                translate: async (_request, _signal, onText) => {
                    localCalls++;
                    onText("Local translation");
                },
            });
        });
        translation.setInput("Hello");
        translation.setPreferences({ operation: "respell" });
        flush();
        assert.equal(translation.usesLocalModel(), false);
        await translation.sendMessage();
        flush();
        assert.match(translation.state.error!, /Sign in/);
        assert.equal(localCalls, 0);
        assert.equal(onlineCalls, 0);
        await translation.sendMessage("account");
        flush();
        assert.equal(localCalls, 0);
        assert.equal(onlineCalls, 1);
        assert.equal(translation.state.status, "completed");
        assert.equal(translation.state.displayText, "respell");
        translation.setPreferences({ operation: "translate" });
        flush();
        assert.equal(translation.usesLocalModel(), localEnabled);
        assert.equal(translation.isRepeat(), false);
        await translation.sendMessage(localEnabled ? undefined : "account");
        flush();
        assert.equal(localCalls, localEnabled ? 1 : 0);
        assert.equal(onlineCalls, localEnabled ? 1 : 2);
        assert.equal(translation.state.status, "completed");
    });
}
