import { Id, ReadingHistory, ReadingHistoryQuery, TelemetryRequest, TelemetryResponse } from '@nexa/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import type { DeviceRow } from '../../db/schema';
import { bearerToken, requireOwner, sendUnauthorized } from '../../shared/auth';
import { problem, sendProblem } from '../../shared/problem';
import * as devicesRepo from '../devices/repo';
import { authenticateDevice } from '../devices/service';

import { ingestTelemetry, prepareReadings, readingHistory, resolveHistoryRange, type Issue } from './service';

declare module 'fastify' {
  interface FastifyRequest {
    /** The device whose token authenticated this request (telemetry routes only). */
    device: DeviceRow | null;
  }
}

export type TelemetryRateLimit = { max: number; timeWindowMs: number };

const invalid = (reply: FastifyReply, errors: Issue[]) =>
  sendProblem(reply, problem(422, 'The request does not match the expected schema.', { title: 'Invalid request', errors }));

/** Rate-limit key: the verified device id. Never taken from the request body or URL. */
function deviceKey(request: FastifyRequest): string {
  if (!request.device) throw new Error('telemetry rate limit ran before device authentication');
  return `device:${request.device.id}`;
}

/** Device-authenticated ingestion: `POST /v1/telemetry`. */
const ingestRoutes: FastifyPluginAsyncZod<{ rateLimit: TelemetryRateLimit }> = async (app, { rateLimit }) => {
  app.decorateRequest('device', null);

  // Before body parsing and validation, like owner auth. The owner token is not a device token.
  app.addHook('onRequest', async (request, reply) => {
    const token = bearerToken(request);
    const device = token ? await authenticateDevice(app.database.db, token) : null;
    if (!device) return sendUnauthorized(reply, 'A valid device token is required.');
    request.device = device;
  });

  app.post(
    '/v1/telemetry',
    {
      schema: { body: TelemetryRequest, response: { 202: TelemetryResponse } },
      config: {
        rateLimit: {
          max: rateLimit.max,
          timeWindow: rateLimit.timeWindowMs,
          // After authentication (onRequest) and body parsing, before validation, so a device's
          // invalid requests count against its own limit too.
          hook: 'preValidation',
          keyGenerator: deviceKey,
        },
      },
    },
    async (request, reply) => {
      const device = request.device;
      if (!device) throw new Error('unreachable: device auth hook did not run');
      const receivedAt = new Date();

      const prepared = prepareReadings(request.body.readings, receivedAt);
      if ('issues' in prepared) return invalid(reply, prepared.issues);

      const result = await ingestTelemetry(app.database.db, device, prepared.rows, request.body, receivedAt);
      if (!result) return sendUnauthorized(reply, 'A valid device token is required.');
      if (result.conflicts) request.log.warn({ deviceId: device.id, conflicts: result.conflicts }, 'readings conflict with stored readings at the same recordedAt; kept the stored ones');
      return reply.code(202).send(result);
    },
  );
};

/** Owner-authenticated history: `GET /v1/devices/:id/readings`. */
const historyRoutes: FastifyPluginAsyncZod<{ ownerToken: string }> = async (app, { ownerToken }) => {
  app.addHook('onRequest', requireOwner(ownerToken));

  app.get(
    '/v1/devices/:id/readings',
    { schema: { params: z.strictObject({ id: Id }), querystring: ReadingHistoryQuery, response: { 200: ReadingHistory } } },
    async (request, reply) => {
      const range = resolveHistoryRange(request.query, new Date());
      if ('issues' in range) return invalid(reply, range.issues);
      if (!(await devicesRepo.findDevice(app.database.db, request.params.id))) return sendProblem(reply, problem(404, 'No device with this id.'));
      return readingHistory(app.database.db, request.params.id, request.query, range);
    },
  );
};

export const telemetryRoutes: FastifyPluginAsyncZod<{ ownerToken: string; rateLimit: TelemetryRateLimit }> = async (app, options) => {
  await app.register(ingestRoutes, { rateLimit: options.rateLimit });
  await app.register(historyRoutes, { ownerToken: options.ownerToken });
};
