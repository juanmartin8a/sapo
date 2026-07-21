import { afterEach, describe, expect, it, jest } from "@jest/globals";

import { streamOpenAIResponses } from "../openAiResponses";

const encoder = new TextEncoder();
const originalOpenAIKey = process.env.OPENAI_API_KEY;

function createAbortError() {
    const error = new Error("aborted");
    error.name = "AbortError";
    return error;
}

function requireUpstreamSignal(signal: AbortSignal | null) {
    if (!signal) {
        throw new Error("Expected OpenAI fetch to receive an abort signal");
    }

    return signal;
}

afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();

    if (originalOpenAIKey === undefined) {
        delete process.env.OPENAI_API_KEY;
    } else {
        process.env.OPENAI_API_KEY = originalOpenAIKey;
    }
});

describe("OpenAI response streaming", () => {
    it("aborts and cancels OpenAI when a downstream delta handler fails", async () => {
        process.env.OPENAI_API_KEY = "test-key";
        const read = jest.fn<() => Promise<ReadableStreamReadResult<Uint8Array>>>().mockResolvedValue({
            done: false,
            value: encoder.encode('data: {"type":"response.output_text.delta","delta":"hello"}\n\n'),
        });
        const cancel = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
        const reader = {
            read,
            cancel,
        } as unknown as ReadableStreamDefaultReader<Uint8Array>;
        const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({
            ok: true,
            body: {
                getReader: () => reader,
            },
        } as unknown as Response);

        await expect(
            streamOpenAIResponses({
                input: "input",
                promptId: undefined,
                promptVersion: undefined,
                signal: new AbortController().signal,
                onDelta: async () => "errored",
                onCompleted: () => {},
                onErrored: () => {},
            })
        ).resolves.toBe("errored");

        expect(cancel).toHaveBeenCalledTimes(1);
        expect((fetchMock.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
    });

    it("allows a first text delta that arrives after five seconds", async () => {
        process.env.OPENAI_API_KEY = "test-key";
        jest.useFakeTimers();
        const read = jest
            .fn<() => Promise<ReadableStreamReadResult<Uint8Array>>>()
            .mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        setTimeout(
                            () =>
                                resolve({
                                    done: false,
                                    value: encoder.encode(
                                        'data: {"type":"response.output_text.delta","delta":"hello"}\n\n'
                                    ),
                                }),
                            6_000
                        );
                    })
            )
            .mockResolvedValueOnce({
                done: false,
                value: encoder.encode('data: {"type":"response.completed"}\n\n'),
            });
        const cancel = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
        const reader = {
            read,
            cancel,
        } as unknown as ReadableStreamDefaultReader<Uint8Array>;
        jest.spyOn(global, "fetch").mockResolvedValue({
            ok: true,
            body: {
                getReader: () => reader,
            },
        } as unknown as Response);
        const onDelta = jest.fn(async () => "continue" as const);

        const result = streamOpenAIResponses({
            input: "input",
            promptId: undefined,
            promptVersion: undefined,
            signal: new AbortController().signal,
            onDelta,
            onCompleted: () => {},
            onErrored: () => {},
        });

        await jest.advanceTimersByTimeAsync(6_000);

        await expect(result).resolves.toBe("completed");
        expect(onDelta).toHaveBeenCalledWith("hello");
    });

    it("expires an inactive OpenAI response stream after twenty seconds", async () => {
        process.env.OPENAI_API_KEY = "test-key";
        jest.useFakeTimers();
        let upstreamSignal: AbortSignal | null = null;
        const read = jest.fn<() => Promise<ReadableStreamReadResult<Uint8Array>>>().mockImplementation(
            () =>
                new Promise((_, reject) => {
                    upstreamSignal?.addEventListener("abort", () => reject(createAbortError()), {
                        once: true,
                    });
                })
        );
        const reader = {
            read,
            cancel: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
        } as unknown as ReadableStreamDefaultReader<Uint8Array>;
        jest.spyOn(global, "fetch").mockImplementation((_input, init) => {
            upstreamSignal = init?.signal as AbortSignal;
            return Promise.resolve({
                ok: true,
                body: { getReader: () => reader },
            } as unknown as Response);
        });
        const onErrored = jest.fn<() => void>();

        const result = streamOpenAIResponses({
            input: "input",
            promptId: undefined,
            promptVersion: undefined,
            signal: new AbortController().signal,
            onDelta: async () => "continue",
            onCompleted: () => {},
            onErrored,
        });

        await jest.advanceTimersByTimeAsync(20_000);

        await expect(result).resolves.toBe("errored");
        expect(onErrored).toHaveBeenCalledTimes(1);
        expect(requireUpstreamSignal(upstreamSignal).aborted).toBe(true);
    });

    it("refreshes the idle timeout whenever OpenAI sends stream data", async () => {
        process.env.OPENAI_API_KEY = "test-key";
        jest.useFakeTimers();
        let upstreamSignal: AbortSignal | null = null;
        const read = jest
            .fn<() => Promise<ReadableStreamReadResult<Uint8Array>>>()
            .mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        setTimeout(
                            () =>
                                resolve({
                                    done: false,
                                    value: encoder.encode('data: {"type":"response.created"}\n\n'),
                                }),
                            15_000
                        );
                    })
            )
            .mockImplementationOnce(
                () =>
                    new Promise((_, reject) => {
                        upstreamSignal?.addEventListener("abort", () => reject(createAbortError()), {
                            once: true,
                        });
                    })
            );
        const reader = {
            read,
            cancel: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
        } as unknown as ReadableStreamDefaultReader<Uint8Array>;
        jest.spyOn(global, "fetch").mockImplementation((_input, init) => {
            upstreamSignal = init?.signal as AbortSignal;
            return Promise.resolve({
                ok: true,
                body: { getReader: () => reader },
            } as unknown as Response);
        });
        const onErrored = jest.fn<() => void>();

        const result = streamOpenAIResponses({
            input: "input",
            promptId: undefined,
            promptVersion: undefined,
            signal: new AbortController().signal,
            onDelta: async () => "continue",
            onCompleted: () => {},
            onErrored,
        });

        await jest.advanceTimersByTimeAsync(20_000);

        expect(onErrored).not.toHaveBeenCalled();

        await jest.advanceTimersByTimeAsync(15_000);

        await expect(result).resolves.toBe("errored");
        expect(onErrored).toHaveBeenCalledTimes(1);
    });

    it("forwards an external abort to OpenAI without reporting an upstream error", async () => {
        process.env.OPENAI_API_KEY = "test-key";
        let upstreamSignal: AbortSignal | null = null;
        const read = jest.fn<() => Promise<ReadableStreamReadResult<Uint8Array>>>().mockImplementation(
            () =>
                new Promise((_, reject) => {
                    upstreamSignal?.addEventListener("abort", () => reject(createAbortError()), {
                        once: true,
                    });
                })
        );
        const cancel = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
        const reader = {
            read,
            cancel,
        } as unknown as ReadableStreamDefaultReader<Uint8Array>;
        jest.spyOn(global, "fetch").mockImplementation((_input, init) => {
            upstreamSignal = init?.signal as AbortSignal;
            return Promise.resolve({
                ok: true,
                body: { getReader: () => reader },
            } as unknown as Response);
        });
        const externalAbortController = new AbortController();
        const onErrored = jest.fn<() => void>();

        const result = streamOpenAIResponses({
            input: "input",
            promptId: undefined,
            promptVersion: undefined,
            signal: externalAbortController.signal,
            onDelta: async () => "continue",
            onCompleted: () => {},
            onErrored,
        });

        await Promise.resolve();
        await Promise.resolve();
        expect(read).toHaveBeenCalledTimes(1);

        externalAbortController.abort();

        await expect(result).rejects.toMatchObject({ name: "AbortError" });
        expect(requireUpstreamSignal(upstreamSignal).aborted).toBe(true);
        expect(cancel).toHaveBeenCalledTimes(1);
        expect(onErrored).not.toHaveBeenCalled();
    });

    it("expires a connecting OpenAI request after the total timeout", async () => {
        process.env.OPENAI_API_KEY = "test-key";
        jest.useFakeTimers();
        let upstreamSignal: AbortSignal | null = null;
        jest.spyOn(global, "fetch").mockImplementation((_input, init) => {
            upstreamSignal = init?.signal as AbortSignal;
            return new Promise((_, reject) => {
                upstreamSignal?.addEventListener("abort", () => reject(createAbortError()), { once: true });
            });
        });
        const onErrored = jest.fn<() => void>();

        const result = streamOpenAIResponses({
            input: "input",
            promptId: undefined,
            promptVersion: undefined,
            signal: new AbortController().signal,
            onDelta: async () => "continue",
            onCompleted: () => {},
            onErrored,
        });

        await jest.advanceTimersByTimeAsync(120_000);

        await expect(result).resolves.toBe("errored");
        expect(requireUpstreamSignal(upstreamSignal).aborted).toBe(true);
        expect(onErrored).toHaveBeenCalledTimes(1);
    });
});
