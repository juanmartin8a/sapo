import { createEffect } from "solid-js";
import type { createAuthStore } from "@/stores/authStore";
import type { createTranslationStore } from "@/stores/translationStore";

export function watchRespellAccess(
    auth: Pick<ReturnType<typeof createAuthStore>["state"], "status" | "hasActiveSubscription">,
    translation: Pick<ReturnType<typeof createTranslationStore>, "state" | "setPreferences">,
) {
    createEffect(
        () =>
            translation.state.operation === "respell" &&
            (auth.status === "signed_out" ||
                (auth.status === "authenticated" && auth.hasActiveSubscription === false)),
        (unavailable) => {
            if (unavailable) translation.setPreferences({ operation: "translate" });
        },
    );
}
