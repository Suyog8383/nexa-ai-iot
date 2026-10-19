import { Health } from '@nexa/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { isDatabaseReachable } from '../../db/client';

import pkg from '../../../package.json' with { type: 'json' };

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/v1/health', { schema: { response: { 200: Health, 503: Health } } }, async (_request, reply) => {
    const dbOk = await isDatabaseReachable(app.database.pool);
    const body = { status: dbOk ? 'ok' : 'degraded', db: dbOk ? 'ok' : 'unavailable', version: pkg.version } as const;
    return reply.code(dbOk ? 200 : 503).send(body);
  });
};
