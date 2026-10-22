import { DeviceList, DeviceWithToken, Device, Id, RegisterDeviceRequest } from '@nexa/contracts';
import type { FastifyReply } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { requireOwner } from '../../shared/auth';
import { problem, sendProblem } from '../../shared/problem';

import * as repo from './repo';
import { registerDevice, rotateDeviceToken, toApiDevice } from './service';

const Params = z.strictObject({ id: Id });

/** Responses carrying a device token must never be cached by anything in between. */
const noStore = (reply: FastifyReply) => reply.header('cache-control', 'no-store');

export const deviceRoutes: FastifyPluginAsyncZod<{ ownerToken: string }> = async (app, { ownerToken }) => {
  // Every route in this plugin is owner-only.
  app.addHook('onRequest', requireOwner(ownerToken));

  app.post('/v1/devices', { schema: { body: RegisterDeviceRequest, response: { 201: DeviceWithToken } } }, async (request, reply) => {
    const created = await registerDevice(app.database.db, request.body);
    return noStore(reply).code(201).send(created);
  });

  app.get('/v1/devices', { schema: { response: { 200: DeviceList } } }, async () => {
    const rows = await repo.listDevices(app.database.db);
    const now = new Date();
    return { items: rows.map(({ device, latest }) => toApiDevice(device, latest, now)) };
  });

  app.get('/v1/devices/:id', { schema: { params: Params, response: { 200: Device } } }, async (request, reply) => {
    const row = await repo.findDeviceWithLatest(app.database.db, request.params.id);
    return row ? toApiDevice(row.device, row.latest) : sendProblem(reply, problem(404, 'No device with this id.'));
  });

  app.post('/v1/devices/:id/token', { schema: { params: Params, response: { 200: DeviceWithToken } } }, async (request, reply) => {
    const rotated = await rotateDeviceToken(app.database.db, request.params.id);
    return rotated ? noStore(reply).send(rotated) : sendProblem(reply, problem(404, 'No device with this id.'));
  });
};
