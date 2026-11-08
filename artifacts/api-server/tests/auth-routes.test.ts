/**
 * auth-routes.test.ts — Integration tests for the auth API endpoints.
 *
 * Uses supertest against a minimal Express app that mounts only the auth
 * router. To avoid hitting the rate limiter (10 logins / 15 min), tests that
 * need a valid token but aren't testing the login endpoint itself use
 * createSession() directly from the session module.
 *
 * Tests cover:
 *   • Login: success, wrong password, unknown email, invalid body, no enumeration
 *   • Signup: success, duplicate email, short password, missing fields
 *   • /me: valid token, no token, invalid token, no passwordHash leak
 *   • Logout: destroys session
 *   • Rate limiting: headers present
 *   • Security: passwordHash never in any response
 */

import { describe, it, expect, beforeAll } from "vitest";
import express from "express";
import request from "supertest";
import authRouter from "../src/routes/auth.js";
import { createSession } from "../src/lib/session.js";

// ── Minimal test app (auth routes only) ────────────────────────────────────
const app = express();
app.use(express.json());
app.use("/api", authRouter);

// ── Shared token (created directly, not via login API, to save rate-limit budget) ──
let sharedToken: string;

beforeAll(() => {
  // Create a session directly — bypasses the login route so we don't
  // consume the rate limiter's 10-attempt budget.
  sharedToken = createSession("admin@websentinel.io", "usr_01");
});

// ── Login ──────────────────────────────────────────────────────────────────
describe("POST /api/auth/login", () => {
  it("should return 200 with token and user for valid admin credentials", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@websentinel.io", password: "demo1234" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
    expect(res.body).toHaveProperty("user");
    expect(res.body.token).toMatch(/^tok_/);
    expect(res.body.user.email).toBe("admin@websentinel.io");
    expect(res.body.user.name).toBe("Alex Morgan");
    expect(res.body.user.role).toBe("Security Analyst");
  });

  it("should return 401 for wrong password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@websentinel.io", password: "wrongpassword" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid email or password");
  });

  it("should return 401 for unknown email", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nonexistent@test.com", password: "anything" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid email or password");
  });

  it("should return the same error for unknown email and wrong password (no user enumeration)", async () => {
    const wrongPasswordRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@websentinel.io", password: "wrong" });

    const unknownEmailRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "nonexistent2@test.com", password: "wrong" });

    expect(wrongPasswordRes.body.error).toBe(unknownEmailRes.body.error);
    expect(wrongPasswordRes.status).toBe(unknownEmailRes.status);
  });

  it("should return 400 for missing email field", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ password: "test" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("should return 400 for missing password field", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "test@test.com" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("should not include passwordHash in the user response", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@websentinel.io", password: "demo1234" });

    expect(res.body.user).not.toHaveProperty("passwordHash");
  });

  it("should include rate limit headers on login responses", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "ratetest@test.com", password: "test" });

    expect(res.headers["ratelimit-limit"]).toBeDefined();
    expect(res.headers["ratelimit-remaining"]).toBeDefined();
  });
});

// ── Signup ─────────────────────────────────────────────────────────────────
describe("POST /api/auth/signup", () => {
  it("should return 201 with token and user for valid signup (with role + no passwordHash)", async () => {
    const email = `signup-${Date.now()}@test.com`;
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ email, password: "SecurePass123!", name: "New Signup", role: "Security Analyst" });

    expect(res.status).toBe(201);
    expect(res.body.token).toMatch(/^tok_/);
    expect(res.body.user.email).toBe(email);
    expect(res.body.user.name).toBe("New Signup");
    expect(res.body.user.role).toBe("Security Analyst");
    expect(res.body.user.scansRun).toBe(0);
    // Security: passwordHash must never appear in any API response
    expect(res.body.user).not.toHaveProperty("passwordHash");
  });

  it("should return 409 for duplicate email", async () => {
    const email = `dup-${Date.now()}@test.com`;
    await request(app)
      .post("/api/auth/signup")
      .send({ email, password: "SecurePass123!", name: "First" });

    const res = await request(app)
      .post("/api/auth/signup")
      .send({ email, password: "DifferentPass!", name: "Second" });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("already exists");
  });

  it("should return 400 for password shorter than 8 characters", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ email: "shortpw@test.com", password: "short", name: "Test" });

    expect(res.status).toBe(400);
  });

  it("should return 400 for missing name", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ email: "noname@test.com", password: "SecurePass123!" });

    expect(res.status).toBe(400);
  });
});

// ── GET /api/auth/me ───────────────────────────────────────────────────────
describe("GET /api/auth/me", () => {
  it("should return 200 with user data for a valid token", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${sharedToken}`);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe("admin@websentinel.io");
    expect(res.body.name).toBe("Alex Morgan");
  });

  it("should return 401 when no Authorization header is present", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("should return 401 for an invalid token", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer tok_invalid123456");

    expect(res.status).toBe(401);
    expect(res.body.error).toContain("Invalid or expired");
  });

  it("should return 401 for a malformed Authorization header", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "NotBearer someToken");

    expect(res.status).toBe(401);
  });

  it("should not include passwordHash in the /me response", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${sharedToken}`);

    expect(res.body).not.toHaveProperty("passwordHash");
  });
});

// ── POST /api/auth/logout ──────────────────────────────────────────────────
describe("POST /api/auth/logout", () => {
  it("should destroy the session and return ok", async () => {
    // Create a fresh token directly (not via login, to save rate-limit budget)
    const token = createSession("admin@websentinel.io", "usr_01");

    const logoutRes = await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${token}`);

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.ok).toBe(true);

    // The token should no longer be valid
    const meRes = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(meRes.status).toBe(401);
  });

  it("should return ok even without a token", async () => {
    const res = await request(app).post("/api/auth/logout");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
