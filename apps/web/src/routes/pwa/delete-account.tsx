import { createFileRoute } from "@tanstack/solid-router";
import DeleteAccountScreen from "@/components/settings/DeleteAccountScreen";
export const Route = createFileRoute("/pwa/delete-account")({ component: DeleteAccountScreen });
