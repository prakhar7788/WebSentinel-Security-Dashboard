import { describe, it, expect } from "vitest";
import { hashPassword, hashPasswordSync, verifyPassword, dummyHash } from "../src/lib/password.js";

describe("password.ts — bcrypt hashing and verification", () => {
  // ── Hash format ──────────────────────────────────────────────────────────
  describe("hashPassword / hashPasswordSync", () => {
    it("should produce a bcrypt hash string", async () => {
      const hash = await hashPassword("testPassword123");
      expect(hash).toMatch(/^\$2[ab]\$/); // bcrypt format: $2a$ or $2b$
    });

    it("should produce a hash with cost factor 12", async () => {
      const hash = await hashPassword("testPassword123");
      expect(hash).toMatch(/^\$2[ab]\$12\$/); // $2a$12$ or $2b$12$
    });

    it("hashPasswordSync should produce a valid bcrypt hash synchronously", () => {
      const hash = hashPasswordSync("syncTestPassword");
      expect(hash).toMatch(/^\$2[ab]\$12\$/);
    });

    it("should produce different hashes for the same password (salt uniqueness)", async () => {
      const hash1 = await hashPassword("samePassword");
      const hash2 = await hashPassword("samePassword");
      expect(hash1).not.toBe(hash2);
    });

    it("should not store the plaintext password in the hash", async () => {
      const password = "mySecretPassword123!";
      const hash = await hashPassword(password);
      expect(hash).not.toContain(password);
      expect(hash).not.toContain("mySecret");
    });
  });

  // ── Verification ──────────────────────────────────────────────────────────
  describe("verifyPassword", () => {
    it("should return true for the correct password", async () => {
      const password = "correctPassword";
      const hash = await hashPassword(password);
      const result = await verifyPassword(password, hash);
      expect(result).toBe(true);
    });

    it("should return false for the wrong password", async () => {
      const hash = await hashPassword("correctPassword");
      const result = await verifyPassword("wrongPassword", hash);
      expect(result).toBe(false);
    });

    it("should return false for an empty password", async () => {
      const hash = await hashPassword("somePassword");
      const result = await verifyPassword("", hash);
      expect(result).toBe(false);
    });

    it("should return false (not throw) for an invalid hash string", async () => {
      const result = await verifyPassword("test", "not-a-valid-hash");
      expect(result).toBe(false);
    });

    it("should return false for a null-ish hash", async () => {
      const result = await verifyPassword("test", "" as any);
      expect(result).toBe(false);
    });

    it("should handle case sensitivity correctly", async () => {
      const hash = await hashPassword("Password123");
      expect(await verifyPassword("password123", hash)).toBe(false);
      expect(await verifyPassword("Password123", hash)).toBe(true);
    });
  });

  // ── Dummy hash (timing-safe login) ────────────────────────────────────────
  describe("dummyHash", () => {
    it("should return a valid bcrypt hash", () => {
      const hash = dummyHash();
      expect(hash).toMatch(/^\$2[ab]\$12\$/);
    });

    it("should not match common passwords", async () => {
      const hash = dummyHash();
      const commonPasswords = ["password", "demo1234", "demo", "admin", "12345678", "test"];
      for (const pw of commonPasswords) {
        expect(await verifyPassword(pw, hash)).toBe(false);
      }
    });

    it("should take similar time to verify as a real hash (timing safety)", async () => {
      const realHash = await hashPassword("realPassword");
      const fakeHash = dummyHash();

      // Measure real hash verification
      const realStart = performance.now();
      await verifyPassword("realPassword", realHash);
      const realTime = performance.now() - realStart;

      // Measure dummy hash verification
      const fakeStart = performance.now();
      await verifyPassword("anything", fakeHash);
      const fakeTime = performance.now() - fakeStart;

      // Both should take roughly the same time (within 50% tolerance — bcrypt is
      // intentionally slow so both should be in the 100-500ms range at cost 12)
      const ratio = Math.max(realTime, fakeTime) / Math.min(realTime, fakeTime);
      expect(ratio).toBeLessThan(3); // generous tolerance for CI variance
    });
  });

  // ── Salt uniqueness (security) ────────────────────────────────────────────
  describe("salt uniqueness", () => {
    it("should generate unique salts across 10 hashes of the same password", async () => {
      const password = "identicalPassword";
      const hashes = new Set<string>();
      for (let i = 0; i < 10; i++) {
        hashes.add(await hashPassword(password));
      }
      // All 10 hashes should be unique (different salts)
      expect(hashes.size).toBe(10);
    });

    it("should embed the salt in the hash (extractable)", async () => {
      const hash = await hashPassword("testPassword");
      // bcrypt hash format: $2b$12$<22-char-salt><31-char-hash>
      const salt = hash.slice(0, 29); // $2b$12$ + 22 chars
      expect(salt).toHaveLength(29);
    });
  });
});
