import { defineConfig } from 'drizzle-kit';

// `npm run db:generate` diffs src/db/schema.ts against the committed migrations; it needs no database.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  strict: true,
});
