import { createTursoReader, type Database } from "./turso-client.ts";

let client: Database | undefined;

export function getTursoClient(): Database {
    return (client ??= createTursoReader(
        process.env.TURSO_DATABASE_URL ?? "",
        process.env.TURSO_AUTH_TOKEN ?? "",
    ));
}
