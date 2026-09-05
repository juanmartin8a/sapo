import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { fetch as expoFetch } from "expo/fetch";

import { getConvexAccessTokenWithUserId } from "@/lib/auth-client";
import {
    runTranslationStream,
    type TranslationStreamArguments,
    type TranslationStreamCallbacks,
} from "@/lib/translation-stream";

jest.mock("expo/fetch", () => ({
    fetch: jest.fn(),
}));

jest.mock("@/lib/auth-client", () => ({
    getConvexAccessTokenWithUserId: jest.fn(),
}));

const mockExpoFetch = jest.mocked(expoFetch);
const mockGetConvexAccessTokenWithUserId = jest.mocked(getConvexAccessTokenWithUserId);

function bytes(value: string) {
    return new Uint8Array([...value].map((character) => character.charCodeAt(0)));
}

function streamingResponse(chunks: string[], contentType = "text/event-stream") {
    const reads = chunks.map((chunk) => ({ done: false as const, value: bytes(chunk) }));
    const read = jest.fn<() => Promise<ReadableStreamReadResult<Uint8Array>>>()
        .mockImplementation(async () => reads.shift() ?? { done: true, value: undefined });

    return {
        ok: true,
        status: 200,
        headers: {
            get: (name: string) => name.toLowerCase() === "content-type" ? contentType : null,
        },
        body: {
            getReader: () => ({ read, cancel: jest.fn(async () => {}), releaseLock: jest.fn() }),
        },
        text: async () => "",
    } as unknown as Awaited<ReturnType<typeof expoFetch>>;
}

function textResponse(body: string, status: number, contentType = "application/json") {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: {
            get: (name: string) => name.toLowerCase() === "content-type" ? contentType : null,
        },
        body: null,
        text: async () => body,
    } as unknown as Awaited<ReturnType<typeof expoFetch>>;
}

function createArguments(abortController = new AbortController()): TranslationStreamArguments {
    return {
        operation: "translate",
        convexSiteUrl: "https://example.convex.site/",
        inputLanguage: "English",
        targetLanguage: "Spanish",
        input: "Hello",
        streamId: "stream_1",
        abortController,
    };
}

function createCallbacks(): TranslationStreamCallbacks & {
    onDone: jest.Mock;
    onStreamError: jest.Mock;
    onToken: jest.Mock;
} {
    return {
        isActive: () => true,
        onToken: jest.fn(() => "continue" as const),
        onDone: jest.fn(),
        onStreamError: jest.fn(),
    };
}

describe("runTranslationStream", () => {
    afterEach(() => {
        jest.useRealTimers();
        jest.clearAllMocks();
    });

    it("frames split SSE events, parses tokens, and preserves the request contract", async () => {
        mockGetConvexAccessTokenWithUserId.mockResolvedValue({ token: "convex-token", userId: "user_1" });
        mockExpoFetch.mockResolvedValue(streamingResponse([
            "event: token\r\ndata: Hel",
            "lo\r\n\r\nevent: done\r\ndata: <end:)>\r\n\r\n",
        ]));
        const callbacks = createCallbacks();
        const args = createArguments();

        await expect(runTranslationStream(args, callbacks)).resolves.toEqual({ type: "stopped" });

        expect(callbacks.onToken).toHaveBeenCalledWith({ type: "translate", value: "Hello" });
        expect(callbacks.onDone).toHaveBeenCalledTimes(1);
        expect(callbacks.onStreamError).not.toHaveBeenCalled();
        expect(mockExpoFetch).toHaveBeenCalledWith("https://example.convex.site/sapopinguino-translate", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "text/event-stream",
                Authorization: "Bearer convex-token",
            },
            body: JSON.stringify({
                input: JSON.stringify({
                    input_language: "English",
                    target_language: "Spanish",
                    input: "Hello",
                }),
                streamId: "stream_1",
            }),
            signal: args.abortController.signal,
        });
    });

    it("reports external aborts as cancellation", async () => {
        mockGetConvexAccessTokenWithUserId.mockResolvedValue({ token: "convex-token", userId: "user_1" });
        mockExpoFetch.mockImplementation(async (_url, init) => new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
                const error = new Error("Aborted");
                error.name = "AbortError";
                reject(error);
            });
        }));
        const args = createArguments();
        const resultPromise = runTranslationStream(args, createCallbacks());

        await Promise.resolve();
        args.abortController.abort();

        await expect(resultPromise).resolves.toEqual({ type: "cancelled" });
    });

    it("parses respell tokens", async () => {
        mockGetConvexAccessTokenWithUserId.mockResolvedValue({ token: "convex-token", userId: "user_1" });
        mockExpoFetch.mockResolvedValue(streamingResponse([
            'data: {"type":"word","output":"Hello"}\n\ndata: <end:)>\n\n',
        ]));
        const callbacks = createCallbacks();
        const args = { ...createArguments(), operation: "respell" as const };

        await expect(runTranslationStream(args, callbacks)).resolves.toEqual({ type: "stopped" });
        expect(callbacks.onToken).toHaveBeenCalledWith({ type: "word", output: "Hello" });
    });

    it.each(["text/event-stream", "text/plain"])("rejects truncated %s streams", async (contentType) => {
        mockGetConvexAccessTokenWithUserId.mockResolvedValue({ token: "token", userId: "user_1" });
        const payload = contentType === "text/plain" ? "Hola\n" : "event: token\ndata: Hola\n\n";
        const callbacks = createCallbacks();

        for (const response of [streamingResponse([payload], contentType), textResponse(payload, 200, contentType)]) {
            mockExpoFetch.mockResolvedValue(response);
            await expect(runTranslationStream(createArguments(), callbacks)).resolves.toMatchObject({
                type: "protocol-error",
                error: expect.any(Error),
            });
        }
        expect(callbacks.onDone).not.toHaveBeenCalled();
    });

    it("preserves marker-shaped translation text and releases the response reader", async () => {
        mockGetConvexAccessTokenWithUserId.mockResolvedValue({ token: "token", userId: "user_1" });
        const response = streamingResponse([
            "event: token\ndata: <end:)>\n\nevent: token\ndata: <error:/>\n\nevent: done\ndata: <end:)>\n\n",
        ]);
        const reader = response.body!.getReader();
        jest.spyOn(response.body!, "getReader").mockReturnValue(reader);
        mockExpoFetch.mockResolvedValue(response);
        const callbacks = createCallbacks();

        await expect(runTranslationStream(createArguments(), callbacks)).resolves.toEqual({ type: "stopped" });
        expect(callbacks.onToken).toHaveBeenNthCalledWith(1, { type: "translate", value: "<end:)>" });
        expect(callbacks.onToken).toHaveBeenNthCalledWith(2, { type: "translate", value: "<error:/>" });
        expect(callbacks.onDone).toHaveBeenCalledTimes(1);
        expect(callbacks.onStreamError).not.toHaveBeenCalled();
        expect(reader.cancel).toHaveBeenCalledTimes(1);
        expect(reader.releaseLock).toHaveBeenCalledTimes(1);
    });

    it("maps HTTP quota errors", async () => {
        mockGetConvexAccessTokenWithUserId.mockResolvedValue({ token: "convex-token", userId: "user_1" });
        mockExpoFetch.mockResolvedValue(textResponse('{"error":"monthly_limit_exceeded"}', 429));

        await expect(runTranslationStream(createArguments(), createCallbacks())).resolves.toEqual({
            type: "http-error",
            status: 429,
            message: "Quota limit reached.",
        });
    });

    it("distinguishes temporary rate limits from exhausted monthly quota", async () => {
        mockGetConvexAccessTokenWithUserId.mockResolvedValue({ token: "token", userId: "user_1" });
        mockExpoFetch.mockResolvedValue(textResponse('{"error":"request_rate_limited"}', 429));

        await expect(runTranslationStream(createArguments(), createCallbacks())).resolves.toMatchObject({
            type: "http-error",
            status: 429,
            message: "Too many requests. Please wait a moment and try again.",
        });
    });

    it("maps subscription access errors", async () => {
        mockGetConvexAccessTokenWithUserId.mockResolvedValue({ token: "convex-token", userId: "user_1" });
        mockExpoFetch.mockResolvedValue(textResponse('{"error":"subscription_required"}', 403));

        await expect(runTranslationStream(createArguments(), createCallbacks())).resolves.toEqual({
            type: "http-error",
            status: 403,
            message: "An active subscription is required.",
        });
    });

    it("reports stream error markers through the callback", async () => {
        mockGetConvexAccessTokenWithUserId.mockResolvedValue({ token: "convex-token", userId: "user_1" });
        mockExpoFetch.mockResolvedValue(streamingResponse(["data: <error:/>\n\n"]));
        const callbacks = createCallbacks();

        await expect(runTranslationStream(createArguments(), callbacks)).resolves.toEqual({ type: "stopped" });
        expect(callbacks.onStreamError).toHaveBeenCalledWith("An error occurred", "marker");
    });

    it("returns malformed respell payloads as protocol errors", async () => {
        mockGetConvexAccessTokenWithUserId.mockResolvedValue({ token: "convex-token", userId: "user_1" });
        mockExpoFetch.mockResolvedValue(streamingResponse(["data: not-json\n\n"]));
        const args = { ...createArguments(), operation: "respell" as const };

        await expect(runTranslationStream(args, createCallbacks())).resolves.toMatchObject({
            type: "protocol-error",
            error: expect.any(Error),
        });
    });

    it("supports line-delimited non-SSE responses", async () => {
        mockGetConvexAccessTokenWithUserId.mockResolvedValue({ token: "convex-token", userId: "user_1" });
        mockExpoFetch.mockResolvedValue(textResponse("Hola\nmundo\n<end:)>\n", 200, "text/plain"));
        const callbacks = createCallbacks();

        await expect(runTranslationStream(createArguments(), callbacks)).resolves.toEqual({ type: "stopped" });
        expect(callbacks.onToken).toHaveBeenNthCalledWith(1, { type: "translate", value: "Hola" });
        expect(callbacks.onToken).toHaveBeenNthCalledWith(2, { type: "translate", value: "mundo" });
    });

    it("distinguishes a response timeout from external cancellation", async () => {
        jest.useFakeTimers();
        mockGetConvexAccessTokenWithUserId.mockResolvedValue({ token: "convex-token", userId: "user_1" });
        mockExpoFetch.mockImplementation(async (_url, init) => new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
                const error = new Error("Aborted");
                error.name = "AbortError";
                reject(error);
            });
        }));
        const args = createArguments();
        const resultPromise = runTranslationStream(args, createCallbacks());

        await Promise.resolve();
        await jest.advanceTimersByTimeAsync(15_000);

        await expect(resultPromise).resolves.toEqual({ type: "timeout", reason: "response" });
        expect(args.abortController.signal.aborted).toBe(true);
    });
});
