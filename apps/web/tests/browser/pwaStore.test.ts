import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createRoot, createStore, flush } from "solid-js";
import { createServer } from "vite";

Object.assign(globalThis, { __sapoPwaTest: { createStore } });
const server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../..", import.meta.url)),
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    define: { "import.meta.env.PROD": "true" },
    ssr: { noExternal: ["solid-js"] },
    plugins: [
        {
            name: "pwa-test-runtime",
            enforce: "pre",
            resolveId(id) {
                if (id === "solid-js") return "\0solid-js";
            },
            load(id) {
                if (id === "\0solid-js")
                    return "export const { createStore } = globalThis.__sapoPwaTest;";
            },
        },
    ],
});
after(() => server.close());
const { createPwaStore } = (await server.ssrLoadModule(
    "/src/stores/pwaStore.ts",
)) as typeof import("../../src/stores/pwaStore.ts");

function createTestStore(enabled: boolean) {
    return createRoot((dispose) => {
        after(dispose);
        return createPwaStore(enabled);
    });
}

function browser(legacyScope = "https://sapo.example/app/") {
    const window = Object.assign(new EventTarget(), {
        location: { origin: "https://sapo.example" },
        matchMedia: () => ({ matches: true }),
    });
    const registrations: { script: string; scope?: string }[] = [];
    let unregistered = false;
    const navigator = {
        onLine: false,
        serviceWorker: {
            controller: null,
            getRegistration: async () => ({
                scope: legacyScope,
                unregister: async () => {
                    unregistered = true;
                },
            }),
            register: async (script: string, options: RegistrationOptions) => {
                registrations.push({ script, scope: options.scope });
                return { waiting: null };
            },
        },
    };
    Object.assign(globalThis, { window });
    Object.defineProperty(globalThis, "navigator", { value: navigator, configurable: true });
    return { window, navigator, registrations, unregistered: () => unregistered };
}
const settled = () => new Promise<void>((resolve) => setImmediate(resolve));

test("responsive web tracks connectivity and retires the legacy worker without enabling installation", async () => {
    const environment = browser();
    const pwa = createTestStore(false);
    const dispose = pwa.initialize();
    await settled();
    assert.equal(environment.unregistered(), true);
    assert.deepEqual(environment.registrations, []);
    assert.equal(pwa.state.installed, false);
    assert.equal(pwa.state.online, false);
    const event = new Event("beforeinstallprompt", { cancelable: true });
    environment.window.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
    assert.equal(pwa.state.installable, false);
    environment.navigator.onLine = true;
    environment.window.dispatchEvent(new Event("online"));
    flush();
    assert.equal(pwa.state.online, true);
    dispose();
    environment.navigator.onLine = false;
    environment.window.dispatchEvent(new Event("offline"));
    flush();
    assert.equal(pwa.state.online, true);
});

test("only the PWA registers its scoped worker and handles installation", async () => {
    const environment = browser();
    const pwa = createTestStore(true);
    const dispose = pwa.initialize();
    await settled();
    assert.deepEqual(environment.registrations, [{ script: "/pwa/sw.js", scope: "/pwa/" }]);
    assert.equal(pwa.state.installed, true);
    let prompted = false;
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
        prompt: async () => {
            prompted = true;
        },
        userChoice: Promise.resolve({ outcome: "accepted" as const }),
    });
    environment.window.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    flush();
    assert.equal(pwa.state.installable, true);
    await pwa.install();
    assert.equal(prompted, true);
    assert.equal(pwa.state.installable, false);
    dispose();
    const afterDispose = new Event("beforeinstallprompt", { cancelable: true });
    environment.window.dispatchEvent(afterDispose);
    assert.equal(afterDispose.defaultPrevented, false);
});

test("legacy cleanup never unregisters a broader or unrelated worker", async () => {
    const environment = browser("https://sapo.example/");
    const dispose = createTestStore(false).initialize();
    await settled();
    assert.equal(environment.unregistered(), false);
    dispose();
});
