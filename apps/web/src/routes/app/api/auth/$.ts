import { createFileRoute } from "@tanstack/solid-router";
import { getWebAuthServer } from "@/lib/server/auth";

const handler = ({ request }: { request: Request }) =>
    getWebAuthServer()?.proxy(request) ??
    new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });

export const Route = createFileRoute("/app/api/auth/$")({
    server: { handlers: { GET: handler, POST: handler } },
});
