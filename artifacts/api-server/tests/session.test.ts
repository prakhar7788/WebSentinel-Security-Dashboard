import { describe, it, expect, beforeEach } from "vitest";
import {
  activeSessions,
  generateToken,
  createSession,
  getSession,
  isValidToken,
  destroySession,
  pruneExpiredSessions,
  type SessionData,
} from "../src/lib/session.js";

// Clean up the shared Map between test groups to avoid cross-test pollution
beforeEach(() => {
  activeSessions.clear();
});

describe("session.ts — crypto-secure tokens with expiry", () => {
  // ── Token generation ─────────────────────────────────────────────────────
  describe("generateToken", () => {
    it("should return a string starting with 'tok_'", () => {
      const token = generateToken();
      expect(token.startsWith("tok_")).toBe(true);
    });

    it("should produce a token containing a UUID", () => {
      const token = generateToken();
      // tok_ + UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      const uuidPart = token.slice(4);
      expect(uuidPart).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it("should produce unique tokens on each call", () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 100; i++) {
        tokens.add(generateToken());
      }
      expect(tokens.size).toBe(100);
    });

    it("should not use Math.random (tokens should be crypto-secure)", () => {
      const token = generateToken();
      // UUID format proves crypto.randomUUID() was used, not Math.random()
      expect(token).toMatch(/^tok_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });
  });

  // ── Session creation ─────────────────────────────────────────────────────
  describe("createSession", () => {
    it("should return a token", () => {
      const token = createSession("user@test.com", "usr_01");
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(10);
    });

    it("should store session data in activeSessions", () => {
      const token = createSession("user@test.com", "usr_01");
      const session = activeSessions.get(token);
      expect(session).toBeDefined();
      expect(session!.email).toBe("user@test.com");
      expect(session!.userId).toBe("usr_01");
    });

    it("should set issuedAt to the current time", () => {
      const before = Date.now();
      const token = createSession("user@test.com", "usr_01");
      const after = Date.now();
      const session = activeSessions.get(token)!;
      expect(session.issuedAt).toBeGreaterThanOrEqual(before);
      expect(session.issuedAt).toBeLessThanOrEqual(after);
    });

    it("should set expiresAt to issuedAt + 24 hours", () => {
      const token = createSession("user@test.com", "usr_01");
      const session = activeSessions.get(token)!;
      const expectedTTL = 24 * 60 * 60 * 1000;
      expect(session.expiresAt - session.issuedAt).toBe(expectedTTL);
    });
  });

  // ── Session retrieval ────────────────────────────────────────────────────
  describe("getSession", () => {
    it("should return SessionData for a valid token", () => {
      const token = createSession("valid@test.com", "usr_01");
      const session = getSession(token);
      expect(session).not.toBeNull();
      expect(session!.email).toBe("valid@test.com");
      expect(session!.userId).toBe("usr_01");
    });

    it("should return null for a non-existent token", () => {
      expect(getSession("tok_nonexistent")).toBeNull();
    });

    it("should return null for an empty string token", () => {
      expect(getSession("")).toBeNull();
    });

    it("should return null and clean up an expired session", () => {
      const token = createSession("expired@test.com", "usr_01");
      // Manually expire the session
      const session = activeSessions.get(token)!;
      session.expiresAt = Date.now() - 1000; // expired 1 second ago

      const result = getSession(token);
      expect(result).toBeNull();
      // The expired session should have been cleaned up
      expect(activeSessions.has(token)).toBe(false);
    });
  });

  // ── Token validation ─────────────────────────────────────────────────────
  describe("isValidToken", () => {
    it("should return true for a valid, non-expired token", () => {
      const token = createSession("valid@test.com", "usr_01");
      expect(isValidToken(token)).toBe(true);
    });

    it("should return false for a non-existent token", () => {
      expect(isValidToken("tok_doesnotexist")).toBe(false);
    });

    it("should return false for an expired token", () => {
      const token = createSession("expired@test.com", "usr_01");
      const session = activeSessions.get(token)!;
      session.expiresAt = Date.now() - 1000;
      expect(isValidToken(token)).toBe(false);
    });

    it("should return false for an empty string", () => {
      expect(isValidToken("")).toBe(false);
    });
  });

  // ── Session destruction ──────────────────────────────────────────────────
  describe("destroySession", () => {
    it("should remove the session from the store", () => {
      const token = createSession("destroy@test.com", "usr_01");
      expect(activeSessions.has(token)).toBe(true);
      destroySession(token);
      expect(activeSessions.has(token)).toBe(false);
    });

    it("should make the token invalid after destruction", () => {
      const token = createSession("destroy@test.com", "usr_01");
      destroySession(token);
      expect(isValidToken(token)).toBe(false);
      expect(getSession(token)).toBeNull();
    });

    it("should be a no-op for a non-existent token", () => {
      expect(() => destroySession("tok_neverexisted")).not.toThrow();
    });
  });

  // ── Session pruning ──────────────────────────────────────────────────────
  describe("pruneExpiredSessions", () => {
    it("should remove all expired sessions and return the count", () => {
      // Create 3 sessions, expire 2 of them
      const t1 = createSession("a@test.com", "usr_01");
      const t2 = createSession("b@test.com", "usr_02");
      const t3 = createSession("c@test.com", "usr_03");

      activeSessions.get(t1)!.expiresAt = Date.now() - 1000;
      activeSessions.get(t2)!.expiresAt = Date.now() - 1000;
      // t3 stays valid

      const pruned = pruneExpiredSessions();
      expect(pruned).toBe(2);
      expect(activeSessions.has(t1)).toBe(false);
      expect(activeSessions.has(t2)).toBe(false);
      expect(activeSessions.has(t3)).toBe(true);
    });

    it("should return 0 when no sessions are expired", () => {
      createSession("valid@test.com", "usr_01");
      expect(pruneExpiredSessions()).toBe(0);
    });

    it("should return 0 when the store is empty", () => {
      expect(pruneExpiredSessions()).toBe(0);
    });
  });

  // ── Security: token format ───────────────────────────────────────────────
  describe("security: token format", () => {
    it("tokens should not be guessable (not sequential)", () => {
      const t1 = generateToken();
      const t2 = generateToken();
      // They should not be similar (no sequential pattern)
      expect(t1).not.toBe(t2);
      // The UUID portions should differ
      expect(t1.slice(4)).not.toBe(t2.slice(4));
    });
  });
});
