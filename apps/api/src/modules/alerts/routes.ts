import { AlertEvent, AlertEventList, AlertEventListQuery, AlertRule, AlertRuleList, AlertRuleListQuery, CreateAlertRuleRequest, Id, UpdateAlertRuleRequest } from '@nexa/contracts';
import type { FastifyReply } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { requireOwner } from '../../shared/auth';
import { problem, sendProblem } from '../../shared/problem';
import type { Issue } from '../telemetry/service';

import * as repo from './repo';
import { createRule, deleteRule, listEvents, toApiEvent, toApiRule, updateRule } from './service';

const Params = z.strictObject({ id: Id });

const invalid = (reply: FastifyReply, errors: Issue[]) =>
  sendProblem(reply, problem(422, 'The request does not match the expected schema.', { title: 'Invalid request', errors }));
const ruleNotFound = (reply: FastifyReply) => sendProblem(reply, problem(404, 'No alert rule with this id.'));

/** Owner-only alert rules and events. Evaluation itself runs during telemetry ingestion. */
export const alertRoutes: FastifyPluginAsyncZod<{ ownerToken: string }> = async (app, { ownerToken }) => {
  app.addHook('onRequest', requireOwner(ownerToken));

  app.post('/v1/alert-rules', { schema: { body: CreateAlertRuleRequest, response: { 201: AlertRule } } }, async (request, reply) => {
    const result = await createRule(app.database.db, request.body, new Date());
    if ('issues' in result) return invalid(reply, result.issues);
    return reply.code(201).header('location', `/v1/alert-rules/${result.id}`).send(result);
  });

  app.get('/v1/alert-rules', { schema: { querystring: AlertRuleListQuery, response: { 200: AlertRuleList } } }, async (request) => {
    const rows = await repo.listRules(app.database.db, request.query.deviceId);
    return { items: rows.map(toApiRule) };
  });

  app.get('/v1/alert-rules/:id', { schema: { params: Params, response: { 200: AlertRule } } }, async (request, reply) => {
    const row = await repo.findRule(app.database.db, request.params.id);
    return row ? toApiRule(row) : ruleNotFound(reply);
  });

  app.patch('/v1/alert-rules/:id', { schema: { params: Params, body: UpdateAlertRuleRequest, response: { 200: AlertRule } } }, async (request, reply) => {
    const result = await updateRule(app.database.db, request.params.id, request.body, new Date());
    if (!result) return ruleNotFound(reply);
    if ('issues' in result) return invalid(reply, result.issues);
    return result;
  });

  app.delete('/v1/alert-rules/:id', { schema: { params: Params } }, async (request, reply) => {
    return (await deleteRule(app.database.db, request.params.id, new Date())) ? reply.code(204).send() : ruleNotFound(reply);
  });

  app.get('/v1/alert-events', { schema: { querystring: AlertEventListQuery, response: { 200: AlertEventList } } }, async (request, reply) => {
    const result = await listEvents(app.database.db, request.query);
    return 'issues' in result ? invalid(reply, result.issues) : result;
  });

  app.post('/v1/alert-events/:id/acknowledge', { schema: { params: Params, response: { 200: AlertEvent } } }, async (request, reply) => {
    const row = await repo.acknowledgeEvent(app.database.db, request.params.id, new Date());
    return row ? toApiEvent(row) : sendProblem(reply, problem(404, 'No alert event with this id.'));
  });
};
