import { STATUS_CODES } from 'node:http';

import type { Problem } from '@nexa/contracts';
import type { FastifyError, FastifyInstance, FastifyReply } from 'fastify';
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from 'fastify-type-provider-zod';

export const PROBLEM_CONTENT_TYPE = 'application/problem+json; charset=utf-8';

/** Problem `type`s are URNs: stable identifiers that don't imply a documentation URL we don't host. */
const typeFor = (slug: string) => `urn:nexa:problem:${slug}`;

const slugs: Record<number, string> = {
  400: 'bad-request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not-found',
  405: 'method-not-allowed',
  409: 'conflict',
  413: 'payload-too-large',
  415: 'unsupported-media-type',
  422: 'validation',
  429: 'rate-limited',
  500: 'internal',
  503: 'unavailable',
};

export function problem(status: number, detail?: string, extra: Partial<Problem> = {}): Problem {
  return {
    type: typeFor(slugs[status] ?? 'error'),
    title: STATUS_CODES[status] ?? 'Error',
    status,
    ...(detail && { detail }),
    ...extra,
  };
}

export function sendProblem(reply: FastifyReply, body: Problem) {
  // Serialized here: Fastify only auto-serializes objects for application/json.
  return reply.code(body.status).type(PROBLEM_CONTENT_TYPE).send(JSON.stringify(body));
}

/** `/readings/0/humidityPct` in the body → `readings.0.humidityPct`; other parts are prefixed, e.g. `query.limit`. */
function issuePath(instancePath: string, context: string | undefined): string {
  const path = instancePath.replace(/^\//, '').split('/').filter(Boolean).join('.');
  const prefix = context && context !== 'body' ? (context === 'querystring' ? 'query' : context) : '';
  return [prefix, path].filter(Boolean).join('.') || '(root)';
}

/** Every error leaves the API as problem+json. 5xx details are logged, never sent. */
export function registerProblemHandlers(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      const errors = error.validation.map((v) => ({ path: issuePath(v.instancePath, error.validationContext), message: v.message ?? 'Invalid value' }));
      return sendProblem(reply, problem(422, 'The request does not match the expected schema.', { title: 'Invalid request', errors }));
    }

    if (isResponseSerializationError(error)) {
      request.log.error({ err: error, issues: error.cause.issues }, 'response failed its schema');
      return sendProblem(reply, problem(500));
    }

    const status = error.statusCode ?? 500;
    if (status >= 400 && status < 500) {
      // Fastify's own client errors (bad JSON, body too large, wrong content type) have safe, generic messages.
      return sendProblem(reply, problem(status, error.message));
    }

    request.log.error({ err: error }, 'unhandled error');
    return sendProblem(reply, problem(status >= 500 && status < 600 ? status : 500));
  });

  app.setNotFoundHandler((request, reply) => sendProblem(reply, problem(404, `No route for ${request.method} ${request.url.split('?')[0]}`)));
}
