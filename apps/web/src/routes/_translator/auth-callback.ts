import { createFileRoute } from "@tanstack/solid-router";
import { getWebAuthServer } from "@/lib/server/auth";

export const Route = createFileRoute("/_translator/auth-callback")({
    server: {
        handlers: {
            GET: ({ request }) =>
                getWebAuthServer()?.callback(request) ??
                new Response(null, {
                    status: 303,
                    headers: {
                        Location: "/auth/?error=sign_in_failed",
                        "Cache-Control": "no-store",
                    },
                }),
        },
    },
});
