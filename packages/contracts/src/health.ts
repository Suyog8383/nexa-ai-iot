import { z } from 'zod';

/** GET /v1/health — 200 when everything is up, 503 when the database is unreachable. */
export const Health = z.object({
  status: z.enum(['ok', 'degraded']),
  db: z.enum(['ok', 'unavailable']),
  version: z.string(),
});
export type Health = z.infer<typeof Health>;
