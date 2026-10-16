import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	// Runtime-only, private credentials. Validate lazily so static pages still work
	// without database configuration, and builds never need a database connection.
	TURSO_DATABASE_URL: { schema: (value) => value },
	TURSO_AUTH_TOKEN: { schema: (value) => value }
});
