import { runTranslationStream } from "@sapo/client-core/translation-stream";
import { getAuthClient, getConvexAccessToken } from "./auth-client";
import type {
    TranslationRequest,
    TranslationStreamToken,
} from "@/types/translation";

export async function streamTranslation(
    request: TranslationRequest,
    controller: AbortController,
    onToken: (token: TranslationStreamToken) => void,
    expectedUserId: string,
) {
    let streamError: string | null = null;
    const result = await runTranslationStream(
        {
            ...request,
            convexSiteUrl: import.meta.env.VITE_CONVEX_SITE_URL,
            streamId: crypto.randomUUID(),
            abortController: controller,
        },
        {
            isActive: () => !controller.signal.aborted,
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
                if (!before || before !== expectedUserId) return null;
                const token = await getConvexAccessToken();
                const after = (await client.getSession()).data?.user.id;
                return before === expectedUserId && before === after
                    ? { token, userId: before }
                    : null;
            },
        },
    );
    if (controller.signal.aborted) return;
    if (streamError) throw new Error(streamError);
    if (result.type === "http-error") {
        if (result.status === 401)
            throw new Error("Your session has expired. Please sign in again.");
        throw new Error(result.message);
    }
    if (result.type === "auth-error")
        throw new Error("Your session has expired. Please sign in again.");
    if (result.type === "timeout")
        throw new Error("The request timed out. Please try again.");
    if (result.type === "protocol-error")
        throw new Error("The response was interrupted. Please try again.");
    if (result.type === "transport-error")
        throw new Error(
            "Couldn’t connect. Check your connection and try again.",
        );
}
