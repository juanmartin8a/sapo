import { createFileRoute } from "@tanstack/solid-router";
import { databaseResponse } from "@/lib/server/database-response";
import { listLanguages } from "@/lib/server/pronunciations";
import { getTursoClient } from "@/lib/server/turso";
export const Route = createFileRoute("/api/languages")({
    server: {
        handlers: { GET: () => databaseResponse(() => listLanguages(getTursoClient()), 3600) },
    },
});
