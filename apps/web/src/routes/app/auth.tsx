import { createFileRoute } from "@tanstack/solid-router";
import AuthScreen from "@/components/auth/AuthScreen";

export const Route = createFileRoute("/app/auth")({ component: AuthScreen });
