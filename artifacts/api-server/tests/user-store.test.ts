import { describe, it, expect } from "vitest";
import {
  findByEmail,
  createUser,
  toPublic,
  type UserRecord,
  type PublicUser,
} from "../src/lib/user-store.js";

describe("user-store.ts — in-memory user store with bcrypt-hashed passwords", async () => {
  // ── findByEmail ──────────────────────────────────────────────────────────
  describe("findByEmail", async () => {
    it("should return a user for a known email (admin demo user)", async () => {
      const user = await findByEmail("admin@websentinel.io");
      expect(user).not.toBeNull();
      expect(user!.email).toBe("admin@websentinel.io");
      expect(user!.name).toBe("Alex Morgan");
      expect(user!.role).toBe("Security Analyst");
    });

    it("should return a user for a known email (demo user)", async () => {
      const user = await findByEmail("demo@websentinel.io");
      expect(user).not.toBeNull();
      expect(user!.email).toBe("demo@websentinel.io");
      expect(user!.role).toBe("Viewer");
    });

    it("should return null for an unknown email", async () => {
      expect(await findByEmail("nobody@nowhere.com")).toBeNull();
    });

    it("should be case-insensitive (lowercases the email)", async () => {
      const user = await findByEmail("ADMIN@WEBSENTINEL.IO");
      expect(user).not.toBeNull();
      expect(user!.email).toBe("admin@websentinel.io");
    });

    it("should return the full UserRecord including passwordHash", async () => {
      const user = await findByEmail("admin@websentinel.io");
      expect(user).not.toBeNull();
      expect(user!.passwordHash).toBeDefined();
      expect(user!.passwordHash).toMatch(/^\$2[ab]\$12\$/);
    });

    it("should NOT store plaintext passwords", async () => {
      const admin = await findByEmail("admin@websentinel.io");
      const demo = await findByEmail("demo@websentinel.io");
      expect(admin!.passwordHash).not.toBe("demo1234");
      expect(demo!.passwordHash).not.toBe("demo");
    });
  });

  // ── createUser ────────────────────────────────────────────────────────────
  describe("createUser", async () => {
    it("should create a new user and return PublicUser", async () => {
      const user = await createUser({
        email: "newuser@test.com",
        password: "SecurePass123!",
        name: "New User",
        role: "Viewer",
      });
      expect(user).not.toBeNull();
      expect(user!.email).toBe("newuser@test.com");
      expect(user!.name).toBe("New User");
      expect(user!.role).toBe("Viewer");
      expect(user!.scansRun).toBe(0);
    });

    it("should generate an ID starting with 'usr_'", async () => {
      const user = await createUser({
        email: "idtest@test.com",
        password: "SecurePass123!",
        name: "ID Test",
      });
      expect(user!.id).toMatch(/^usr_/);
    });

    it("should derive avatar from name initials", async () => {
      const user = await createUser({
        email: "avatar@test.com",
        password: "SecurePass123!",
        name: "John Doe",
      });
      expect(user!.avatar).toBe("JD");
    });

    it("should set joinedAt to a readable date string", async () => {
      const user = await createUser({
        email: "datetest@test.com",
        password: "SecurePass123!",
        name: "Date Test",
      });
      expect(user!.joinedAt).toBeTruthy();
      expect(typeof user!.joinedAt).toBe("string");
    });

    it("should default role to 'Viewer' when not specified", async () => {
      const user = await createUser({
        email: "defaultrole@test.com",
        password: "SecurePass123!",
        name: "Default Role",
      });
      expect(user!.role).toBe("Viewer");
    });

    it("should return null for a duplicate email", async () => {
      // First creation succeeds
      const first = await createUser({
        email: "duplicate@test.com",
        password: "SecurePass123!",
        name: "First User",
      });
      expect(first).not.toBeNull();

      // Second creation should return null
      const second = await createUser({
        email: "duplicate@test.com",
        password: "DifferentPassword!",
        name: "Second User",
      });
      expect(second).toBeNull();
    });

    it("should lowercase the email before storing", async () => {
      const user = await createUser({
        email: "MIXEDCASE@Test.COM",
        password: "SecurePass123!",
        name: "Mixed Case",
      });
      expect(user!.email).toBe("mixedcase@test.com");
    });

    it("should trim the name", async () => {
      const user = await createUser({
        email: "trimtest@test.com",
        password: "SecurePass123!",
        name: "  Trimmed Name  ",
      });
      expect(user!.name).toBe("Trimmed Name");
    });

    it("should not include passwordHash in the returned PublicUser", async () => {
      const user = await createUser({
        email: "hashcheck@test.com",
        password: "SecurePass123!",
        name: "Hash Check",
      });
      expect(user).not.toHaveProperty("passwordHash");
    });

    it("should store a bcrypt hash (not plaintext) in the internal record", async () => {
      // The created user should be findable with findByEmail
      const user = await findByEmail("hashcheck@test.com");
      expect(user).not.toBeNull();
      expect(user!.passwordHash).toMatch(/^\$2[ab]\$12\$/);
      expect(user!.passwordHash).not.toBe("SecurePass123!");
    });
  });

  // ── toPublic ─────────────────────────────────────────────────────────────
  describe("toPublic", async () => {
    it("should strip passwordHash from a UserRecord", async () => {
      const user = await findByEmail("admin@websentinel.io")!;
      const publicUser = toPublic(user);
      expect(publicUser).not.toHaveProperty("passwordHash");
      expect(publicUser.id).toBe(user.id);
      expect(publicUser.email).toBe(user.email);
      expect(publicUser.name).toBe(user.name);
      expect(publicUser.role).toBe(user.role);
      expect(publicUser.avatar).toBe(user.avatar);
      expect(publicUser.joinedAt).toBe(user.joinedAt);
      expect(publicUser.scansRun).toBe(user.scansRun);
    });
  });

  // ── Security: no plaintext anywhere ─────────────────────────────────────
  describe("security: no plaintext passwords", async () => {
    it("demo user passwords should not be stored as plaintext", async () => {
      const admin = await findByEmail("admin@websentinel.io");
      const demo = await findByEmail("demo@websentinel.io");
      expect(admin!.passwordHash).not.toContain("demo1234");
      expect(demo!.passwordHash).not.toContain("demo");
    });

    it("newly created users should not have plaintext passwords", async () => {
      const password = "MyPlaintextPassword123";
      await createUser({
        email: "plaintext@test.com",
        password,
        name: "Plain Test",
      });
      const user = await findByEmail("plaintext@test.com");
      expect(user!.passwordHash).not.toContain(password);
      expect(user!.passwordHash).not.toContain("MyPlaintext");
    });
  });
});
