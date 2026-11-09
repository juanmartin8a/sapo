import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createTestServer } from "../helpers/vite.ts";
import type { TranslationRequest } from "../../src/types/translation.ts";

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

class WorkerError extends Event {
    error = new Error("Worker crashed");
}
Object.assign(globalThis, { ErrorEvent: WorkerError });
class FakeWllama {
    static instances: FakeWllama[] = [];
    exited = false;
    constructor(
        _paths: unknown,
        readonly config: { logger: { error: (error: Event) => void } },
    ) {
        FakeWllama.instances.push(this);
    }
    getWorkerResources() {
        return { compat: false };
    }
    async loadModel() {}
    async exit() {
        this.exited = true;
    }
    async createChatCompletion(): Promise<void> {}
    crash() {
        this.config.logger.error(new WorkerError("error"));
    }
}
Object.assign(globalThis, { __sapoBrowserModelTest: FakeWllama });
const server = await createTestServer({
    ssr: { noExternal: ["@wllama/wllama"] },
    resolve: { alias: { "@": new URL("../../src", import.meta.url).pathname } },
    plugins: [
        {
            name: "browser-model-test-runtime",
            enforce: "pre",
            resolveId(id) {
                if (id === "@wllama/wllama/esm/index.js") return "\0wllama";
                if (id.endsWith(".wasm?url")) return "\0wasm";
            },
            load(id) {
                if (id === "\0wllama")
                    return "export const Wllama = globalThis.__sapoBrowserModelTest;";
                if (id === "\0wasm") return 'export default "/test.wasm";';
            },
        },
    ],
});
after(() => server.close());
const { createBrowserModel } = (await server.ssrLoadModule(
    "/src/lib/local-models/browser.ts",
)) as typeof import("../../src/lib/local-models/browser.ts");
const request: TranslationRequest = {
    input: "Hello",
    operation: "translate",
    inputLanguage: "English",
    targetLanguage: "Spanish",
    respellLanguage: "Source",
    translateThenRespell: false,
};
const files = [new File(["GGUF1234"], "model.gguf")];

for (const failure of ["worker", "deadline"] as const) {
    test(`${failure} during generation releases the runtime and allows loading again`, async (context) => {
        const started = deferred<void>();
        context.mock.method(FakeWllama.prototype, "createChatCompletion", async () => {
            started.resolve();
            await new Promise(() => {});
        });
        const deadline = new AbortController();
        const model = createBrowserModel();
        await model.load(files, "cpu", new AbortController().signal);
        const engine = FakeWllama.instances.at(-1)!;
        context.mock.method(AbortSignal, "timeout", () => deadline.signal);
        const pending = model.translate(request, new AbortController().signal, () => {});
        const rejected = assert.rejects(
            pending,
            failure === "worker" ? /worker stopped/ : /timed out/,
        );
        await started.promise;
        if (failure === "worker") engine.crash();
        else deadline.abort(new DOMException("Timed out", "TimeoutError"));
        await rejected;
        assert.equal(model.isLoaded(), false);
        assert.equal(engine.exited, true);
        context.mock.restoreAll();
        await model.load(files, "cpu", new AbortController().signal);
        assert.equal(model.isLoaded(), true);
        await model.unload();
    });
}

test("unloading waits for generation to release its slot", async (context) => {
    const started = deferred<void>();
    const stopped = deferred<void>();
    context.mock.method(FakeWllama.prototype, "createChatCompletion", async () => {
        started.resolve();
        await stopped.promise;
    });
    const model = createBrowserModel();
    await model.load(files, "cpu", new AbortController().signal);
    const engine = FakeWllama.instances.at(-1)!;
    const controller = new AbortController();
    const pending = model.translate(request, controller.signal, () => {});
    const rejected = assert.rejects(pending, { name: "AbortError" });
    await started.promise;
    controller.abort();
    const unloading = model.unload();
    assert.equal(engine.exited, false);
    stopped.resolve();
    await rejected;
    await unloading;
    assert.equal(engine.exited, true);
    assert.equal(model.isLoaded(), false);
});
