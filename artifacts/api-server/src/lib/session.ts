/**
 * session.ts — JWT-based session management.
 *
 * Issues signed JWTs (HS256) instead of opaque random tokens.
 * The JWT payload contains { sub (userId), email, iat, exp }.
 * Tokens are signed with JWT_SECRET from the environment.
 *
 * A local in-memory revocation set (destroyedTokens) tracks logged-out
 * tokens so logout is effective before the JWT naturally expires.
 * Revoked entries are pruned automatically once their exp passes.
 *
 * Session TTL: 24 hours (configurable via SESSION_TTL_SECONDS).
 */

import jwt from "jsonwebtoken";
import { db } from "./firebase.js";
import { logger } from "./logger.js";

const SESSION_TTL_SECONDS = 24 * 60 * 60; // 24 hours

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "JWT_SECRET env var is required and must be at least 32 characters. " +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\""
    );
  }
  return secret;
}

export interface SessionData {
  email: string;
  userId: string;
  issuedAt: number;
  expiresAt: number;
}

export interface JwtPayload {
  sub: string;   // userId
  email: string;
  iat: number;
  exp: number;
}

/** Revocation set: tokens that have been explicitly logged out. */
const revokedTokens: Map<string, number> = new Map(); // token → expiresAt (ms)

/** Prune expired entries from the revocation set. */
function pruneRevoked(): void {
  const now = Date.now();
  for (const [token, exp] of revokedTokens) {
    if (now > exp) revokedTokens.delete(token);
  }
}

/** Issue a signed JWT for the given user. Returns the token string. */
export function createSession(email: string, userId: string): string {
  const secret = getJwtSecret();
  const token = jwt.sign(
    { sub: userId, email },
    secret,
    { algorithm: "HS256", expiresIn: SESSION_TTL_SECONDS }
  );

  // Fire-and-forget: persist session metadata to Firestore for audit log
  if (db) {
    const now = Date.now();
    db.collection("sessions").doc(userId + "_" + now).set({
      userId,
      email,
      issuedAt: now,
      expiresAt: now + SESSION_TTL_SECONDS * 1000,
    }).catch((err: any) => {
      logger.warn({ err: err.message }, "Firestore session write failed (non-fatal)");
    });
  }

  return token;
}

/**
 * Verify and decode a JWT. Returns SessionData if valid, null otherwise.
 * Also checks the revocation set so logged-out tokens are rejected.
 */
export function getSession(token: string): SessionData | null {
  // Check revocation set first (fast path)
  if (revokedTokens.has(token)) return null;

  try {
    const secret = getJwtSecret();
    const payload = jwt.verify(token, secret, { algorithms: ["HS256"] }) as JwtPayload;
    return {
      email: payload.email,
      userId: payload.sub,
      issuedAt: payload.iat * 1000,
      expiresAt: payload.exp * 1000,
    };
  } catch {
    // jwt.verify throws for expired, malformed, or bad-signature tokens
    return null;
  }
}

/** Check if a token is valid (not expired, not revoked, valid signature). */
export function isValidToken(token: string): boolean {
  return getSession(token) !== null;
}

/**
 * Revoke a token (logout). The token is added to the revocation set
 * and will be pruned automatically once its exp passes.
 */
export function destroySession(token: string): void {
  try {
    const secret = getJwtSecret();
    const payload = jwt.decode(token) as JwtPayload | null;
    if (payload?.exp) {
      revokedTokens.set(token, payload.exp * 1000);
      pruneRevoked();
    }
  } catch {
    // ignore decode errors on destroy
  }
}

/**
 * activeSessions shim — kept for backwards compatibility with any code
 * that imports this symbol. JWT tokens don't need an in-memory map, but
 * some middleware references this. The Map is always empty; auth uses
 * getSession() / isValidToken() instead.
 */
export const activeSessions: Map<string, SessionData> = new Map();
