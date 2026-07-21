import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { handleSapopinguinoRequest } from "../../sapopinguinoHttp";
import { handleSapopinguinoTranslateRequest } from "../../sapopinguinoTranslate";

jest.mock("../../httpAuth", () => ({
    authenticatedHttpAction: (handler: unknown) => handler,
}));

const originalOpenAIKey = process.env.OPENAI_API_KEY;

function createAbortError() {
    const error = new Error("aborted");
    error.name = "AbortError";
    return error;
}

afterEach(() => {
    jest.restoreAllMocks();

    if (originalOpenAIKey === undefined) {
        delete process.env.OPENAI_API_KEY;
    } else {
        process.env.OPENAI_API_KEY = originalOpenAIKey;
    }
});

describe("endpoint response cancellation", () => {
    const endpoints: [
        string,
        typeof handleSapopinguinoRequest | typeof handleSapopinguinoTranslateRequest,
    ][] = [
        ["respell", handleSapopinguinoRequest],
        ["translate", handleSapopinguinoTranslateRequest],
    ];

    it.each(endpoints)("aborts the OpenAI fetch when the %s response body is cancelled", async (_name, handler) => {
        process.env.OPENAI_API_KEY = "test-key";
        let openAISignal: AbortSignal | null = null;
        jest.spyOn(global, "fetch").mockImplementation((_input, init) => {
            openAISignal = init?.signal as AbortSignal;
            return new Promise<Response>((_resolve, reject) => {
                openAISignal?.addEventListener("abort", () => reject(createAbortError()), {
                    once: true,
                });
            });
        });
        const ctx = {
            runAction: async () => ({ status: "already_fresh" }),
            runMutation: async (_mutation: unknown, args: Record<string, unknown>) => {
                if ("req_id" in args) {
                    return {
                        allowed: true,
                        usage_event_id: "usage_event_1",
                    };
                }

                return { status: "failed" };
            },
        } as never;
        const request = new Request("https://example.com/stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ input: "hello", streamId: "stream_1" }),
        });
        const auth = {
            userId: "user_1",
            user: { createdAt: 1_000 },
        } as never;

        const response = await handler(ctx, request, auth);
        await response.body?.cancel();

        expect(openAISignal).not.toBeNull();
        expect((openAISignal as unknown as AbortSignal).aborted).toBe(true);
    });
});
