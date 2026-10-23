import { createFileRoute } from "@tanstack/solid-router";
import DeleteAccountScreen from "@/components/settings/DeleteAccountScreen";
export const Route = createFileRoute("/_translator/account/delete-account")({
    component: DeleteAccountScreen,
});
