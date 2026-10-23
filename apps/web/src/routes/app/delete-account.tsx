import { createFileRoute } from "@tanstack/solid-router";
import { legacyTranslatorRedirect } from "@/lib/legacy-translator-redirect";

export const Route = createFileRoute("/app/delete-account")({
    beforeLoad: legacyTranslatorRedirect("/account/delete-account/"),
});
