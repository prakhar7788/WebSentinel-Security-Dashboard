/**
 * session.ts — session store with crypto-secure tokens and expiry.
 *
 * Replaces the original Math.random()-based token generation with
 * crypto.randomUUID(). Sessions expire after SESSION_TTL_MS (24 hours).
 *
 * The activeSessions Map is the key shared state between auth.ts (which
 * creates/destroys sessions) and the requireAuth middleware in
 * subdomains.ts and tls.ts (which check token validity).
 *
 * To maintain backwards compatibility, the Map is exported as the same
 * `activeSessions` name used by the route files.
 */

import crypto from "node:crypto";
import { db } from "./firebase.js";
import { logger } from "./logger.js";

// 24 hours in milliseconds
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export interface SessionData {
  email: string;
  userId: string;
  issuedAt: number;
  expiresAt: number;
}

/** Token → SessionData mapping. Primary store — always in-memory for fast reads. */
export const activeSessions: Map<string, SessionData> = new Map();

/** Generate a cryptographically secure opaque token. */
export function generateToken(): string {
  return "tok_" + crypto.randomUUID();
}

/** Create and store a new session for the given user. Returns the token. */
export function createSession(email: string, userId: string): string {
  const token = generateToken();
  const now = Date.now();
  const session: SessionData = { email, userId, issuedAt: now, expiresAt: now + SESSION_TTL_MS };
  activeSessions.set(token, session);

  // Fire-and-forget: persist to Firestore for crash recovery
  if (db) {
    db.collection("sessions").doc(token).set(session).catch((err: any) => {
      logger.warn({ err: err.message }, "Firestore session write failed (non-fatal)");
    });
  }

  return token;
}

/** Look up a session by token. Returns null if not found or expired. */
export function getSession(token: string): SessionData | null {
  const session = activeSessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    activeSessions.delete(token);
    return null;
  }
  return session;
}

/** Check if a token is valid (exists and not expired). */
export function isValidToken(token: string): boolean {
  return getSession(token) !== null;
}

/** Destroy a session by token. No-op if the token doesn't exist. */
export function destroySession(token: string): void {
  activeSessions.delete(token);
  if (db) {
    db.collection("sessions").doc(token).delete().catch(() => {});
  }
}

/** Remove all expired sessions from the store. */
export function pruneExpiredSessions(): number {
  const now = Date.now();
  let pruned = 0;
  for (const [token, session] of activeSessions) {
    if (now > session.expiresAt) { activeSessions.delete(token); pruned++; }
  }
  return pruned;
}
