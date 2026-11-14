/**
 * user-store.ts — user store with Firestore + in-memory fallback.
 *
 * When Firebase is configured (FIREBASE_* env vars set), users are stored
 * in the Firestore `users` collection. Otherwise, an in-memory Map is used.
 *
 * Passwords are always hashed with bcrypt (cost 12) — this provides proper
 * encryption with salting. The bcrypt hash embeds a unique per-password salt,
 * preventing rainbow table attacks. Firestore stores only the hash, never
 * the plaintext password.
 *
 * Interface:
 *   findByEmail(email): Promise<UserRecord | null>   ← async (Firestore read)
 *   createUser(input):  Promise<PublicUser | null>    ← async (hash + write)
 *   toPublic(u):        PublicUser                    ← sync (strips hash)
 */

import crypto from "node:crypto";
import { hashPasswordSync, hashPassword } from "./password.js";
import { db, isFirebaseEnabled } from "./firebase.js";
import { logger } from "./logger.js";

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  role: string;
  passwordHash: string;
  avatar: string;
  joinedAt: string;
  scansRun: number;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: string;
  avatar: string;
  joinedAt: string;
  scansRun: number;
}

export interface CreateUserInput {
  email: string;
  password: string;
  name: string;
  role?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function toPublicUser(u: UserRecord): PublicUser {
  return {
    id: u.id, email: u.email, name: u.name, role: u.role,
    avatar: u.avatar, joinedAt: u.joinedAt, scansRun: u.scansRun,
  };
}

function initials(name: string): string {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

function generateUserId(): string {
  return "usr_" + crypto.randomUUID().slice(0, 8);
}

const USERS_COLLECTION = "users";

// ── In-memory store (fallback when Firebase is not configured) ──────────────
const memUsers = new Map<string, UserRecord>();

function seedDemoUsers() {
  const seeds = [
    { email: "admin@websentinel.io", name: "Alex Morgan", role: "Security Analyst", password: "demo1234", joinedAt: "Jan 2025", scansRun: 28 },
    { email: "demo@websentinel.io",  name: "Demo User",   role: "Viewer",           password: "demo",     joinedAt: "Oct 2026", scansRun: 3 },
  ];
  for (const s of seeds) {
    memUsers.set(s.email.toLowerCase(), {
      id: generateUserId(), email: s.email.toLowerCase(), name: s.name, role: s.role,
      passwordHash: hashPasswordSync(s.password), avatar: initials(s.name),
      joinedAt: s.joinedAt, scansRun: s.scansRun,
    });
  }
}

seedDemoUsers();

// ── Firestore seeding (runs once when Firebase is first available) ──────────
let firestoreSeeded = false;
async function seedFirestoreIfEmpty() {
  if (!db || firestoreSeeded) return;
  firestoreSeeded = true;

  try {
    const snapshot = await db.collection(USERS_COLLECTION).limit(1).get();
    if (!snapshot.empty) return; // already has users

    const seeds = [
      { email: "admin@websentinel.io", name: "Alex Morgan", role: "Security Analyst", password: "demo1234", joinedAt: "Jan 2025", scansRun: 28 },
      { email: "demo@websentinel.io",  name: "Demo User",   role: "Viewer",           password: "demo",     joinedAt: "Oct 2026", scansRun: 3 },
    ];

    for (const s of seeds) {
      await db.collection(USERS_COLLECTION).doc(s.email.toLowerCase()).set({
        id: generateUserId(), email: s.email.toLowerCase(), name: s.name, role: s.role,
        passwordHash: hashPasswordSync(s.password), avatar: initials(s.name),
        joinedAt: s.joinedAt, scansRun: s.scansRun,
      });
    }
    logger.info("Firestore seeded with demo users");
  } catch (err: any) {
    logger.error({ err: err.message }, "Failed to seed Firestore");
  }
}

// Fire-and-forget seeding
if (isFirebaseEnabled) seedFirestoreIfEmpty();

// ── Store API ───────────────────────────────────────────────────────────────

export async function findByEmail(email: string): Promise<UserRecord | null> {
  const lower = email.toLowerCase();

  // Fast path: in-memory cache
  const cached = memUsers.get(lower);
  if (cached) return cached;

  // Firestore path
  if (db) {
    try {
      const doc = await db.collection(USERS_COLLECTION).doc(lower).get();
      if (doc.exists) {
        const data = doc.data() as UserRecord;
        memUsers.set(lower, data); // cache for future reads
        return data;
      }
    } catch (err: any) {
      logger.error({ err: err.message, email: lower }, "Firestore findByEmail failed");
    }
  }

  return null;
}

export async function createUser(input: CreateUserInput): Promise<PublicUser | null> {
  const email = input.email.toLowerCase();

  // Check if user already exists
  const existing = await findByEmail(email);
  if (existing) return null;

  const record: UserRecord = {
    id: generateUserId(),
    email,
    name: input.name.trim(),
    role: input.role ?? "Viewer",
    passwordHash: await hashPassword(input.password),
    avatar: initials(input.name.trim()),
    joinedAt: new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" }),
    scansRun: 0,
  };

  // Store in memory
  memUsers.set(email, record);

  // Store in Firestore
  if (db) {
    try {
      await db.collection(USERS_COLLECTION).doc(email).set(record);
    } catch (err: any) {
      logger.error({ err: err.message, email }, "Firestore createUser failed");
      // Already in memory — return the user anyway
    }
  }

  return toPublicUser(record);
}

export function toPublic(u: UserRecord): PublicUser {
  return toPublicUser(u);
}
