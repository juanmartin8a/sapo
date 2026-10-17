import { fetch as expoFetch } from "expo/fetch";
import { getConvexAccessTokenWithUserId } from "@/lib/auth-client";
import {
    runTranslationStream as runPlatformTranslationStream,
    type TranslationStreamArguments,
    type TranslationStreamCallbacks,
} from "@sapo/client-core/translation-stream";

export { getTranslationStreamEndpointPath } from "@sapo/client-core/translation-stream";
export type {
    TranslationStreamToken,
    TranslationStreamArguments,
    TranslationStreamCallbacks,
} from "@sapo/client-core/translation-stream";

export function runTranslationStream(
    args: TranslationStreamArguments,
    callbacks: TranslationStreamCallbacks,
) {
    return runPlatformTranslationStream(args, callbacks, {
        fetch: expoFetch as typeof globalThis.fetch,
        getAuthContext: getConvexAccessTokenWithUserId,
    });
}
