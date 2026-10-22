import { createFileRoute } from "@tanstack/solid-router";
import { databaseResponse } from "@/lib/server/database-response";
import { listPronunciations, parsePronunciationQuery } from "@/lib/server/pronunciations";
import { getTursoClient } from "@/lib/server/turso";
export const Route = createFileRoute("/api/pronunciations")({
    server: {
        handlers: {
            GET: ({ request }) =>
                databaseResponse(() => {
                    const query = parsePronunciationQuery(new URL(request.url).searchParams);
                    return listPronunciations(getTursoClient(), query);
                }, 300),
        },
    },
});
