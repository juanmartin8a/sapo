import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createRoot, createStore, flush } from "solid-js";
import { createTestServer } from "../helpers/vite.ts";
import type { createBrowserModel } from "../../src/lib/local-models/browser.ts";

const saved = new Map<string, string>();
Object.assign(globalThis, {
    localStorage: {
        getItem: (key: string) => saved.get(key) ?? null,
        setItem: (key: string, value: string) => saved.set(key, value),
    },
});
const runtime = {
    createStore,
    engine: {
        isLoaded: () => true,
        load: async () => {},
        unload: async () => {},
        translate: async () => {},
    } as ReturnType<typeof createBrowserModel>,
};
Object.assign(globalThis, { __sapoLocalTest: runtime });
const server = await createTestServer({
    resolve: { alias: { "@": new URL("../../src", import.meta.url).pathname } },
    plugins: [
        {
            name: "local-model-test-services",
            enforce: "pre",
            resolveId(id) {
                if (id === "solid-js") return "\0solid-js";
                if (id.endsWith("/local-models/browser")) return "\0browser-model";
            },
            load(id) {
                if (id === "\0solid-js")
                    return "export const { createStore } = globalThis.__sapoLocalTest;";
                if (id === "\0browser-model")
                    return "export const createBrowserModel = () => globalThis.__sapoLocalTest.engine;";
            },
        },
    ],
});
after(() => server.close());
const { createLocalModelStore } = (await server.ssrLoadModule(
    "/src/stores/localModelStore.ts",
)) as typeof import("../../src/stores/localModelStore.ts");
function store(onChange = () => {}) {
    saved.clear();
    return createRoot((dispose) => {
        after(dispose);
        return createLocalModelStore(onChange);
    });
}
function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

test("preferences persist new values immediately without credentials and stores stay isolated", () => {
    const first = store();
    const second = store();
    first.configure({ enabled: true, source: "browser" });
    first.setApiKey("secret");
    flush();
    const persisted = JSON.parse(saved.get("sapo.local-models.v1")!);
    assert.equal(persisted.enabled, true);
    assert.equal(persisted.source, "browser");
    assert.equal(persisted.apiKey, undefined);
    assert.equal(second.state.enabled, false);
    assert.equal(second.state.apiKey, "");
});

test("a late model list cannot overwrite a changed server", async (context) => {
    const pending = deferred<Response>();
    context.mock.method(globalThis, "fetch", () => pending.promise);
    const models = store();
    const refreshing = models.refreshModels();
    flush();
    models.configure({ baseUrl: "http://localhost:1234/v1" });
    flush();
    pending.resolve(Response.json({ data: [{ id: "stale-model" }] }));
    await refreshing;
    flush();
    assert.deepEqual([...models.state.models], []);
    assert.equal(models.state.serverModel, "");
    assert.equal(models.state.discovering, false);
    assert.equal(models.serverModelNotFound(), false);
});

test("discovery selects and persists the first model but respects a manual model", async (context) => {
    context.mock.method(globalThis, "fetch", async () =>
        Response.json({ data: [{ id: "model" }] }),
    );
    const models = store();
    await models.refreshModels();
    flush();
    assert.equal(models.state.serverModel, "model");
    assert.equal(JSON.parse(saved.get("sapo.local-models.v1")!).serverModel, "model");
    models.configure({ serverModel: "manual" });
    flush();
    await models.refreshModels();
    flush();
    assert.equal(models.state.serverModel, "manual");
});

test("manual overrides warn only after discovery and remain usable", async (context) => {
    context.mock.method(globalThis, "fetch", async (_url: string, init?: RequestInit) =>
        init?.method === "POST"
            ? new Response(
                  'data: {"type":"response.output_text.delta","delta":"Hola"}\n\n' +
                      'data: {"type":"response.completed"}\n\n',
                  { headers: { "content-type": "text/event-stream" } },
              )
            : Response.json({ data: [{ id: "available-model" }] }),
    );
    const models = store();
    models.configure({ enabled: true, serverModel: "manual" });
    flush();
    assert.equal(models.serverModelNotFound(), false);
    await models.refreshModels();
    flush();
    assert.equal(models.serverModelNotFound(), true);
    assert.equal(models.state.serverModel, "manual");
    assert.equal(models.state.error, null);
    let output = "";
    await models.translate(
        {
            input: "Hello",
            operation: "translate",
            inputLanguage: "English",
            targetLanguage: "Spanish",
            respellLanguage: "Source",
            translateThenRespell: false,
        },
        new AbortController().signal,
        (text) => (output += text),
    );
    assert.equal(output, "Hola");
    models.configure({ serverModel: "available-model" });
    flush();
    assert.equal(models.serverModelNotFound(), false);
    models.configure({ serverModel: "" });
    flush();
    assert.equal(models.serverModelNotFound(), false);
});

test("empty model lists warn but failed discovery cannot claim a model is missing", async (context) => {
    const mocked = context.mock.method(globalThis, "fetch", async () =>
        Response.json({ data: [] }),
    );
    const models = store();
    models.configure({ serverModel: "manual" });
    flush();
    await models.refreshModels();
    flush();
    assert.equal(models.serverModelNotFound(), true);
    mocked.mock.mockImplementation(async () => new Response(null, { status: 503 }));
    await models.refreshModels();
    flush();
    assert.equal(models.serverModelNotFound(), false);
    assert.match(models.state.error!, /HTTP 503/);
});

test("discovery warnings reset when credentials or servers change and update on refresh", async (context) => {
    let data: { id: string }[] = [];
    context.mock.method(globalThis, "fetch", async () => Response.json({ data }));
    const models = store();
    models.configure({ serverModel: "manual" });
    flush();
    await models.refreshModels();
    flush();
    assert.equal(models.serverModelNotFound(), true);
    data = [{ id: "manual" }];
    await models.refreshModels();
    flush();
    assert.equal(models.serverModelNotFound(), false);
    data = [];
    await models.refreshModels();
    flush();
    assert.equal(models.serverModelNotFound(), true);
    models.setApiKey("new-key");
    flush();
    assert.equal(models.serverModelNotFound(), false);
    await models.refreshModels();
    flush();
    assert.equal(models.serverModelNotFound(), true);
    models.configure({ baseUrl: "http://localhost:1234/v1", serverModel: "manual" });
    flush();
    assert.equal(models.serverModelNotFound(), false);
});

test("unloading during browser preparation prevents a late ready state", async (context) => {
    const pending = deferred<void>();
    const started = deferred<void>();
    let signal: AbortSignal | undefined;
    context.mock.method(
        runtime.engine,
        "load",
        async (_files: File[], _acceleration: "auto" | "cpu", value: AbortSignal) => {
            signal = value;
            started.resolve();
            await pending.promise;
        },
    );
    const unload = context.mock.method(runtime.engine, "unload", async () => {});
    const models = store();
    await models.importFiles([new File(["GGUF1234"], "model.gguf")]);
    flush();
    assert.equal(models.state.browserModels.length, 1);
    const loading = models.loadModel();
    await started.promise;
    models.unload();
    flush();
    assert.equal(signal?.aborted, true);
    pending.resolve();
    await loading;
    flush();
    assert.equal(models.state.loadedModel, "");
    assert.equal(models.state.loading, false);
    assert.equal(models.state.error, null);
    assert.equal(unload.mock.callCount(), 1);
});

test("model selection cancels active work and disposal releases files and engine", async (context) => {
    const unload = context.mock.method(runtime.engine, "unload", async () => {});
    let changes = 0;
    const models = store(() => {
        changes++;
    });
    await models.importFiles([new File(["GGUF1234"], "first.gguf")]);
    flush();
    await models.loadModel();
    flush();
    const first = models.state.browserModel;
    assert.equal(models.state.loadedModel, first);
    await models.importFiles([new File(["GGUF1234"], "second.gguf")]);
    flush();
    assert.notEqual(models.state.browserModel, first);
    assert.equal(models.state.loadedModel, "");
    models.removeModel(first);
    flush();
    assert.equal(models.state.browserModels.length, 1);
    models.dispose();
    await Promise.resolve();
    assert.ok(changes >= 3);
    assert.ok(unload.mock.callCount() >= 2);
});

test("a failed browser worker clears the loaded selection so it can be loaded again", async (context) => {
    context.mock.method(runtime.engine, "isLoaded", () => false);
    context.mock.method(runtime.engine, "translate", async () => {
        throw new Error("Worker failed");
    });
    const models = store();
    models.configure({ enabled: true, source: "browser" });
    await models.importFiles([new File(["GGUF1234"], "model.gguf")]);
    flush();
    await models.loadModel();
    flush();
    assert.equal(models.state.loadedModel, models.state.browserModel);
    await assert.rejects(
        models.translate(
            {
                input: "Hello",
                operation: "translate",
                inputLanguage: "English",
                targetLanguage: "Spanish",
                respellLanguage: "Source",
                translateThenRespell: false,
            },
            new AbortController().signal,
            () => {},
        ),
        /Worker failed/,
    );
    flush();
    assert.equal(models.state.loadedModel, "");
    assert.ok(models.state.browserModel);
    await models.loadModel();
    flush();
    assert.equal(models.state.loadedModel, models.state.browserModel);
});
