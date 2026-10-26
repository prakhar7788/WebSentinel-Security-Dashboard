import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";

const router: IRouter = Router();

// Simple in-memory user store for prototype (no real persistence)
const DEMO_USERS: Record<string, { id: string; email: string; name: string; role: string; passwordHash: string; avatar: string; joinedAt: string; scansRun: number }> = {
  "admin@websentinel.io": {
    id: "usr_01",
    email: "admin@websentinel.io",
    name: "Alex Morgan",
    role: "Security Analyst",
    passwordHash: "demo1234", // plaintext for prototype only
    avatar: "AM",
    joinedAt: "Jan 2025",
    scansRun: 28,
  },
  "demo@websentinel.io": {
    id: "usr_02",
    email: "demo@websentinel.io",
    name: "Demo User",
    role: "Viewer",
    passwordHash: "demo",
    avatar: "DU",
    joinedAt: "Oct 2026",
    scansRun: 3,
  },
};

// In-memory token store for prototype
const activeSessions: Map<string, string> = new Map(); // token -> email

function generateToken(): string {
  return "tok_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /api/auth/login
router.post("/auth/login", (req: Request, res: Response) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }

  const { email, password } = parsed.data;
  const user = DEMO_USERS[email.toLowerCase()];

  if (!user || user.passwordHash !== password) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const token = generateToken();
  activeSessions.set(token, email.toLowerCase());

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatar: user.avatar,
      joinedAt: user.joinedAt,
      scansRun: user.scansRun,
    },
  });
});

// POST /api/auth/logout
router.post("/auth/logout", (req: Request, res: Response) => {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    activeSessions.delete(auth.slice(7));
  }
  res.json({ ok: true });
});

// GET /api/auth/me
router.get("/auth/me", (req: Request, res: Response) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = auth.slice(7);
  const email = activeSessions.get(token);
  if (!email) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const user = DEMO_USERS[email];
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatar: user.avatar,
    joinedAt: user.joinedAt,
    scansRun: user.scansRun,
  });
});

export { activeSessions };
export default router;
