/**
 * auth.ts — Authentication routes: login, signup, logout, /me.
 *
 * Security features:
 *   • Passwords hashed with bcrypt (cost 12) via lib/password.ts
 *   • Tokens are signed JWTs (HS256, 24h expiry) via lib/session.ts
 *   • Timing-safe login (dummy hash comparison for unknown users)
 *   • Same generic error for unknown email and wrong password (no enumeration)
 *   • Rate limiting: 10 login attempts / 15 min per IP
 *   • Rate limiting: 5 signup attempts / 1 hour per IP
 *   • Zod validation on all request bodies
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { verifyPassword, dummyHash } from "../lib/password.js";
import { createSession, getSession, destroySession, isValidToken, activeSessions } from "../lib/session.js";
import { findByEmail, createUser, toPublic } from "../lib/user-store.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

// Re-export session helpers for use in route middleware (requireAuth)
export { activeSessions, isValidToken, getSession };

// ── Rate limiters ───────────────────────────────────────────────────────────

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again in 15 minutes." },
});

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
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128)
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  name: z.string().min(1).max(100),
  role: z.enum(["Security Analyst", "Viewer"]).default("Viewer"),
});

// ── Helper ──────────────────────────────────────────────────────────────────

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
    // Timing-safe: dummy hash comparison so response time is the same
    // whether the email exists or not — prevents user enumeration.
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

  if (await findByEmail(email)) {
    res.status(409).json({ error: "An account with this email already exists." });
    return;
  }

  const publicUser = await createUser({ email, password, name, role });
  if (!publicUser) {
    res.status(409).json({ error: "An account with this email already exists." });
    return;
  }

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
