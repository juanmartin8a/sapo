import { runTranslationStream } from "@sapo/client-core/translation-stream";
import { getAuthClient, getConvexAccessToken } from "./auth-client";
import type { TranslationRequest, TranslationStreamToken } from "@/types/translation";

export async function streamTranslation(
    request: TranslationRequest,
    controller: AbortController,
    onToken: (token: TranslationStreamToken) => void,
    expectedUserId: string,
) {
    const streamController = new AbortController();
    const cancel = () => streamController.abort(controller.signal.reason);
    if (controller.signal.aborted) cancel();
    else controller.signal.addEventListener("abort", cancel, { once: true });
    try {
        let streamError: string | null = null;
        const result = await runTranslationStream(
            {
                ...request,
                convexSiteUrl: import.meta.env.VITE_CONVEX_SITE_URL,
                streamId: crypto.randomUUID(),
                abortController: streamController,
            },
            {
                isActive: () => !streamController.signal.aborted,
                onToken: (token) => {
                    onToken(token);
                    return "continue";
                },
                onDone: () => undefined,
                onStreamError: (message) => {
                    streamError = message;
                },
            },
            {
                fetch: globalThis.fetch.bind(globalThis),
                getAuthContext: async () => {
                    const client = getAuthClient();
                    const before = (await client.getSession()).data?.user.id;
                    if (streamController.signal.aborted || !before || before !== expectedUserId)
                        return null;
                    const token = await getConvexAccessToken();
                    if (streamController.signal.aborted) return null;
                    const after = (await client.getSession()).data?.user.id;
                    return before === expectedUserId && before === after
                        ? { token, userId: before }
                        : null;
                },
            },
        );
        if (controller.signal.aborted) return;
        // Internal deadlines can also return inactive/stopped after aborting. Only
        // the caller's controller represents an intentional cancellation.
        if (streamController.signal.aborted || result.type === "timeout")
            throw new Error("The request timed out. Please try again.");
        if (streamError) throw new Error(streamError);
        if (result.type === "http-error") {
            if (result.status === 401)
                throw new Error("Your session has expired. Please sign in again.");
            throw new Error(result.message);
        }
        if (result.type === "auth-error")
            throw new Error("Your session has expired. Please sign in again.");
        if (result.type === "protocol-error")
            throw new Error("The response was interrupted. Please try again.");
        if (result.type === "transport-error")
            throw new Error("Couldn’t connect. Check your connection and try again.");
    } finally {
        controller.signal.removeEventListener("abort", cancel);
    }
}
