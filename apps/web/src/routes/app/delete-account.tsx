import { createFileRoute } from "@tanstack/solid-router";
import DeleteAccountScreen from "@/components/settings/DeleteAccountScreen";
export const Route = createFileRoute("/app/delete-account")({ component: DeleteAccountScreen });
