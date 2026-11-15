/**
 * app.ts — Express app setup with security hardening.
 *
 * Middleware stack (order matters):
 *   1. pino-http        — request/response logging (redacts auth headers)
 *   2. Security headers — CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy
 *   3. CORS             — explicit origin allowlist
 *   4. express.json     — JSON body parser
 *   5. express.urlencoded — URL-encoded body parser
 *   6. /api router      — all application routes
 *
 * Rate limiting is applied at the router level (see routes/index.ts → auth.ts)
 * so different limits can be set per endpoint.
 */

import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Trust the first proxy (Render, Vercel, etc.) so express-rate-limit
// can correctly identify client IPs from the X-Forwarded-For header.
app.set("trust proxy", 1);

// ── 1. Request/response logging ─────────────────────────────────────────────
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// ── 2. Security headers ──────────────────────────────────────────────────────
app.use((req, res, next) => {
  // Prevent clickjacking
  res.setHeader("X-Frame-Options", "DENY");
  // Prevent MIME-type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Limit referrer leakage
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  // Force HTTPS in production (1 year, includeSubDomains)
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  // Content Security Policy — restrict to self, no inline (mitigates XSS)
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:; object-src 'none'; base-uri 'self'",
  );
  next();
});

// ── 3. CORS — explicit origin allowlist ──────────────────────────────────────
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  ...(process.env.CORS_ORIGINS ?? "").split(",").map(s => s.trim()).filter(Boolean),
];

app.use(
  cors({
    origin(origin, cb) {
      // Allow requests with no Origin header (e.g. curl, Postman, server-side)
      if (!origin || allowedOrigins.includes(origin)) {
        cb(null, true);
      } else {
        logger.warn({ origin, allowedOrigins }, "CORS blocked origin");
        cb(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// ── 4-5. Body parsers ────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── 6. Routes ────────────────────────────────────────────────────────────────
app.use("/api", router);

export default app;
