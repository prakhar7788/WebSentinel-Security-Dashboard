/**
 * auth.ts — Authentication routes: login, signup, logout, /me.
 *
 * Security features implemented per docs/auth-architecture.md:
 *   • Passwords hashed with bcrypt (cost 12) via lib/password.ts
 *   • Tokens generated with crypto.randomUUID() via lib/session.ts
 *   • Sessions expire after 24 hours (checked on every /auth/me)
 *   • Timing-safe login (dummy hash comparison for unknown users)
 *   • Same generic error for unknown email and wrong password (no enumeration)
 *   • Zod validation on all request bodies
 *   • Signup creates new users with hashed passwords
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { verifyPassword, dummyHash } from "../lib/password.js";
import { createSession, getSession, destroySession, isValidToken } from "../lib/session.js";
import { findByEmail, createUser, toPublic, type UserRecord } from "../lib/user-store.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

// ── Re-export the session store for route middleware ────────────────────────
import { activeSessions, isValidToken, getSession } from "../lib/session.js";
export { activeSessions, isValidToken, getSession };

// ── Rate limiters ───────────────────────────────────────────────────────────
// Login: 10 attempts per 15 minutes per IP (brute-force protection)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again in 15 minutes." },
});

// Signup: 5 signups per hour per IP (prevents automated account creation)
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many signup attempts. Please try again later." },
});

// ── Zod schemas ─────────────────────────────────────────────────────────────

const LoginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

const SignupSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(100),
  role: z.enum(["Security Analyst", "Viewer"]).default("Viewer"),
});

// ── Helper: extract Bearer token from request ──────────────────────────────

function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

// ── POST /api/auth/login ────────────────────────────────────────────────────

router.post("/auth/login", loginLimiter, async (req: Request, res: Response) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }

  const { email, password } = parsed.data;
  const user = await findByEmail(email);

  if (!user) {
    // Timing-safe: perform a dummy hash comparison so the response time is
    // similar whether the email exists or not. Prevents user enumeration.
    await verifyPassword(password, dummyHash());
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const token = createSession(user.email, user.id);
  logger.info({ email: user.email, userId: user.id }, "auth: login success");

  res.json({ token, user: toPublic(user) });
});

// ── POST /api/auth/signup ───────────────────────────────────────────────────

router.post("/auth/signup", signupLimiter, async (req: Request, res: Response) => {
  const parsed = SignupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }

  const { email, password, name, role } = parsed.data;

  // Check for existing user before creating
  if (await findByEmail(email)) {
    res.status(409).json({ error: "An account with this email already exists." });
    return;
  }

  const publicUser = await createUser({ email, password, name, role });
  if (!publicUser) {
    res.status(409).json({ error: "An account with this email already exists." });
    return;
  }

  // Issue a token so the user is logged in immediately
  const token = createSession(publicUser.email, publicUser.id);
  logger.info({ email: publicUser.email, userId: publicUser.id }, "auth: signup success");

  res.status(201).json({ token, user: publicUser });
});

// ── POST /api/auth/logout ───────────────────────────────────────────────────

router.post("/auth/logout", (req: Request, res: Response) => {
  const token = extractToken(req);
  if (token) {
    destroySession(token);
  }
  res.json({ ok: true });
});

// ── GET /api/auth/me ────────────────────────────────────────────────────────

router.get("/auth/me", async (req: Request, res: Response) => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const session = getSession(token);
  if (!session) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const user = await findByEmail(session.email);
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  res.json(toPublic(user));
});

export default router;
