import { Wllama } from "@wllama/wllama/esm/index.js";
import wasmUrl from "@wllama/wllama/esm/wasm/wllama.wasm?url";
import compatWasmUrl from "@wllama/wllama-compat/wasm/wllama.wasm?url";
import { LOCAL_OUTPUT_TOKENS } from "./config";
import { localTranslationInstructions } from "./prompt";
import type { TranslationRequest } from "@/types/translation";

interface LoadedModel {
    engine: Wllama;
    failure: Promise<never>;
    error?: Error;
}

export function createBrowserModel() {
    let model: LoadedModel | null = null;
    let queue = Promise.resolve();
    // A stopped generation must release its slot before another load or inference.
    function exclusive<T>(operation: () => Promise<T>): Promise<T> {
        const pending = queue.then(operation);
        queue = pending.then(
            () => undefined,
            () => undefined,
        );
        return pending;
    }
    async function release() {
        const previous = model;
        model = null;
        await previous?.engine.exit();
    }
    return {
        isLoaded: () => model !== null && !model.error,
        unload: () => exclusive(release),
        load: (files: File[], acceleration: "auto" | "cpu", signal: AbortSignal) =>
            exclusive(async () => {
                signal.throwIfAborted();
                await release();
                let rejectWorker!: (error: Error) => void;
                const workerFailure = new Promise<never>((_resolve, reject) => {
                    rejectWorker = reject;
                });
                const candidate = new Wllama(
                    { default: wasmUrl },
                    {
                        suppressNativeLog: true,
                        logger: {
                            debug() {},
                            log() {},
                            warn() {},
                            error(value: unknown) {
                                if (value instanceof ErrorEvent) {
                                    session.error = new Error(
                                        "The browser model worker stopped. Load the model again or try a smaller model.",
                                        { cause: value.error },
                                    );
                                    rejectWorker(session.error);
                                }
                            },
                        },
                    },
                );
                const session: LoadedModel = { engine: candidate, failure: workerFailure };
                const deadline = AbortSignal.timeout(5 * 60_000);
                const combined = AbortSignal.any([signal, deadline]);
                let cancel!: () => void;
                const cancelled = new Promise<never>((_resolve, reject) => {
                    cancel = () => reject(combined.reason);
                    combined.addEventListener("abort", cancel, { once: true });
                });
                async function prepare() {
                    // Import raw glue only for browsers that need it. Vite's transformed JS
                    // cannot be embedded verbatim inside wllama's worker function.
                    if (candidate.getWorkerResources().compat) {
                        const { default: code } =
                            await import("@wllama/wllama-compat/wasm/wllama.js?raw");
                        candidate.setCompat({ wasm: compatWasmUrl, worker: { code } });
                    }
                    combined.throwIfAborted();
                    await candidate.loadModel(files, {
                        n_ctx: 8192,
                        n_batch: 256,
                        n_ubatch: 128,
                        n_parallel: 1,
                        n_threads: 1, // No cross-origin isolation requirement for auth or the public website.
                        ...(acceleration === "cpu" ? { n_gpu_layers: 0 } : {}),
                        ctx_shift: false,
                    });
                }
                try {
                    await Promise.race([prepare(), workerFailure, cancelled]);
                    combined.throwIfAborted();
                    model = session;
                } catch (error) {
                    await candidate.exit().catch(() => undefined);
                    if (signal.aborted) throw signal.reason;
                    throw new Error(
                        "Couldn’t load this GGUF model. Check browser memory and model support, or try CPU mode or a smaller model.",
                        { cause: error },
                    );
                } finally {
                    combined.removeEventListener("abort", cancel);
                }
            }),
        translate: (
            request: TranslationRequest,
            signal: AbortSignal,
            onText: (text: string) => void,
        ) =>
            exclusive(async () => {
                signal.throwIfAborted();
                if (!model) throw new Error("Load the selected browser model first.");
                const instructions = localTranslationInstructions(request);
                const current = model;
                const deadline = AbortSignal.timeout(10 * 60_000);
                const combined = AbortSignal.any([signal, deadline]);
                let expire!: () => void;
                const timedOut = new Promise<never>((_resolve, reject) => {
                    expire = () => reject(deadline.reason);
                    deadline.addEventListener("abort", expire, { once: true });
                });
                let output = "";
                let finished = false;
                try {
                    await Promise.race([
                        current.failure,
                        timedOut,
                        current.engine.createChatCompletion({
                            messages: [
                                { role: "system", content: instructions },
                                { role: "user", content: request.input },
                            ],
                            temperature: 0,
                            max_tokens: LOCAL_OUTPUT_TOKENS,
                            stream: true,
                            abortSignal: combined,
                            cache_prompt: false,
                            chat_template_kwargs: { enable_thinking: false },
                            onData: (chunk) => {
                                combined.throwIfAborted();
                                const choice = chunk.choices[0];
                                if (!choice) return;
                                if (choice.finish_reason === "length")
                                    throw new Error(
                                        "The translation was cut short. Try shorter text.",
                                    );
                                if (choice.finish_reason && choice.finish_reason !== "stop")
                                    throw new Error(
                                        "The browser model could not finish this translation.",
                                    );
                                if (choice.finish_reason === "stop") finished = true;
                                if (choice.delta.content) {
                                    output += choice.delta.content;
                                    onText(choice.delta.content);
                                }
                            },
                        }),
                    ]);
                    combined.throwIfAborted();
                    if (!finished || !output.trim())
                        throw new Error(
                            "The browser model returned no complete translation. Try another model or shorter text.",
                        );
                } catch (error) {
                    if (current.error || deadline.aborted) await release();
                    if (signal.aborted) throw signal.reason;
                    if (deadline.aborted)
                        throw new Error(
                            "The browser model timed out. Try a smaller model or shorter text.",
                            { cause: error },
                        );
                    throw error;
                } finally {
                    deadline.removeEventListener("abort", expire);
                }
            }),
    };
}
