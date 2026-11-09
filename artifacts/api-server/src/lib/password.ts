/**
 * password.ts — bcrypt password hashing and verification.
 *
 * Uses bcryptjs (pure JS, no native compilation required) with cost factor 12.
 * The library's compare() runs in constant time, preventing timing attacks.
 */

import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

/** Hash a plaintext password. Returns a bcrypt hash string. */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/** Synchronous hash — used only for seeding demo users at module load. */
export function hashPasswordSync(plain: string): string {
  return bcrypt.hashSync(plain, SALT_ROUNDS);
}

/**
 * Verify a plaintext password against a stored bcrypt hash.
 * Uses constant-time comparison via bcrypt.compare().
 * Returns false if the user doesn't exist or the hash is invalid.
 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/**
 * Generate a dummy hash for timing-safe login when the user is not found.
 * This ensures the response time is similar whether the account exists or not,
 * preventing user enumeration via timing analysis.
 */
export function dummyHash(): string {
  return bcrypt.hashSync("dummy-password-for-timing", SALT_ROUNDS);
}
