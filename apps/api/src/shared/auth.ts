import { createHash, timingSafeEqual } from 'node:crypto';

import type { FastifyReply, FastifyRequest } from 'fastify';

import { problem, sendProblem } from './problem';

export function sha256(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/**
 * Constant-time comparison of a presented secret against a stored SHA-256 digest. Hashing first
 * gives both sides the same length, so neither length nor content leaks through timing.
 */
export function matchesHash(presented: string, expectedDigest: Buffer): boolean {
  const digest = sha256(presented);
  return digest.length === expectedDigest.length && timingSafeEqual(digest, expectedDigest);
}

/** The token from `Authorization: Bearer <token>`, or null. */
export function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return match?.[1] ?? null;
}

export function sendUnauthorized(reply: FastifyReply, detail: string) {
  reply.header('www-authenticate', 'Bearer');
  return sendProblem(reply, problem(401, detail));
}

/**
 * `onRequest` hook for owner-only routes. Runs before body parsing and validation, so
 * unauthenticated callers learn nothing about the route's schema.
 */
export function requireOwner(ownerToken: string) {
  const expected = sha256(ownerToken);
  return async function ownerAuth(request: FastifyRequest, reply: FastifyReply) {
    const token = bearerToken(request);
    if (!token || !matchesHash(token, expected)) {
      return sendUnauthorized(reply, 'A valid owner token is required.');
    }
  };
}
