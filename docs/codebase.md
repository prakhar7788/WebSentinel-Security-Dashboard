# WebSentinel Security Dashboard — Full Codebase Reference

> A complete, cited walkthrough of every package, file, and data-flow in the project. Written from a direct reading of the source.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Repository Layout](#2-repository-layout)
3. [Monorepo Configuration](#3-monorepo-configuration)
   - 3.1 pnpm workspace
   - 3.2 TypeScript base config
   - 3.3 Root package.json
4. [Shared Libraries (`lib/`)](#4-shared-libraries-lib)
   - 4.1 `@workspace/api-spec` — OpenAPI contract
   - 4.2 `@workspace/api-zod` — Generated Zod schemas
   - 4.3 `@workspace/api-client-react` — Generated React-Query client
   - 4.4 `@workspace/db` — Database layer (Drizzle + PostgreSQL)
5. [API Server (`artifacts/api-server`)](#5-api-server-artifactsapi-server)
   - 5.1 Entry point (`index.ts`)
   - 5.2 Express app (`app.ts`)
   - 5.3 Logger (`lib/logger.ts`)
   - 5.4 Route registry (`routes/index.ts`)
   - 5.5 Health route (`routes/health.ts`)
   - 5.6 Auth routes (`routes/auth.ts`)
   - 5.7 Subdomain enumeration (`routes/subdomains.ts`)
   - 5.8 TLS/certificate check (`routes/tls.ts`)
   - 5.9 Build system (`build.mjs`)
6. [Frontend (`artifacts/websentinel`)](#6-frontend-artifactswebsentinel)
   - 6.1 Entry point (`main.tsx`)
   - 6.2 Vite configuration (`vite.config.ts`)
   - 6.3 App bootstrap and provider tree (`App.tsx`)
   - 6.4 Routing (wouter)
   - 6.5 AuthGuard
   - 6.6 Auth context (`lib/auth.tsx`)
   - 6.7 Workspace store (`lib/workspaces.tsx`)
   - 6.8 Scan store (`lib/scans.tsx`)
   - 6.9 Utility (`lib/utils.ts`)
   - 6.10 Hooks (`hooks/`)
   - 6.11 Error boundary (`components/error-boundary.tsx`)
   - 6.12 UI components (`components/ui/`)
   - 6.13 Pages
7. [Data Flows — End to End](#7-data-flows--end-to-end)
   - 7.1 Bootstrap / session rehydration
   - 7.2 Login
   - 7.3 Subdomain enumeration
   - 7.4 TLS check
   - 7.5 Scan history persistence
8. [Dependency Map](#8-dependency-map)
9. [Key Design Decisions](#9-key-design-decisions)
10. [Prototype Limitations vs Production Gap](#10-prototype-limitations-vs-production-gap)

---

## 1. Project Overview

WebSentinel is a **security reconnaissance dashboard** built as a full-stack TypeScript monorepo. It lets authenticated users run two live scans against internet-facing targets:

- **Subdomain enumeration** — queries crt.sh certificate transparency logs + optional DNS brute-force.
- **TLS / certificate check** — connects directly to the target over TLS, inspects the certificate, probes deprecated protocol versions, and audits HTTP security headers.

Scan results are persisted to browser `localStorage`, displayed on an overview dashboard, and broken down into per-severity security findings.

The project is designed to run on **Replit** (Linux) but is documented and runnable locally on Windows (see `RUNNING.md`).

---

## 2. Repository Layout

```
WebSentinel-Security-Dashboard/
├── package.json               ← Root workspace manifest
├── pnpm-workspace.yaml        ← pnpm workspace + catalog definitions
├── tsconfig.base.json         ← Shared TS compiler settings
├── tsconfig.json              ← Root project references
├── .npmrc                     ← pnpm registry/config overrides
├── RUNNING.md                 ← Windows developer guide
├── replit.md                  ← Replit project notes
│
├── lib/                       ← Shared packages (imported by artifacts)
│   ├── api-spec/              ← @workspace/api-spec  (OpenAPI + orval codegen)
│   ├── api-zod/               ← @workspace/api-zod   (generated Zod schemas)
│   ├── api-client-react/      ← @workspace/api-client-react (React-Query hooks)
│   └── db/                    ← @workspace/db         (Drizzle ORM + pg)
│
├── artifacts/                 ← Runnable applications
│   ├── api-server/            ← @workspace/api-server (Express 5 backend)
│   ├── websentinel/           ← @workspace/websentinel (React frontend)
│   └── mockup-sandbox/        ← UI mockup preview sandbox (standalone)
│
├── scripts/                   ← Workspace-level build/maintenance scripts
└── docs/                      ← Project documentation (this file lives here)
```

---

## 3. Monorepo Configuration

### 3.1 pnpm workspace (`pnpm-workspace.yaml`)

**File:** `pnpm-workspace.yaml`

All packages under `artifacts/*`, `lib/*`, and `scripts` are declared as workspace members. This means pnpm resolves cross-package `workspace:*` references from disk rather than npm.

**Key safety setting:**
```yaml
minimumReleaseAge: 1440   # 24-hour hold before any new npm version is installable
```
This blocks same-day package versions, defending against supply-chain attacks where malicious versions are typically discovered and removed within hours.

**Catalog protocol:** The `catalog:` section pins exact version ranges for shared dependencies (e.g. `react: 19.1.0`, `zod: ^3.25.76`, `tailwindcss: ^4.1.14`). When any package writes `"zod": "catalog:"` in its own `package.json`, pnpm resolves it to the catalog entry. This prevents version drift across packages without requiring every `package.json` to repeat the same range.

**Platform overrides:** Extensive `overrides` entries (e.g. `"esbuild>@esbuild/darwin-arm64": "-"`) explicitly remove native binary packages for platforms other than `linux-x64` (the Replit runtime), keeping the lockfile lean and preventing accidental cross-platform downloads.

### 3.2 TypeScript base config (`tsconfig.base.json`)

**File:** `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "esnext",
    "moduleResolution": "bundler",
    "lib": ["es2022"],
    "strictNullChecks": true,
    "noImplicitAny": true,
    "noImplicitReturns": true,
    "alwaysStrict": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "customConditions": ["workspace"]
  }
}
```

All package-level `tsconfig.json` files extend this base. Notable settings:
- `"moduleResolution": "bundler"` — uses the modern resolution algorithm (supports `exports` field in `package.json`), required for the `workspace:` exports.
- `"customConditions": ["workspace"]` — allows packages to declare a `"workspace"` export condition in their `package.json`, letting TypeScript resolve source `.ts` files directly instead of compiled `.js` output during development.
- `"isolatedModules": true` — each file is compiled independently, required for esbuild and Vite compatibility.

### 3.3 Root `package.json`

**File:** `package.json`

```json
{
  "scripts": {
    "preinstall": "sh -c '...; case \"$npm_config_user_agent\" in pnpm/*) ;; *) echo \"Use pnpm instead\" >&2; exit 1 ;; esac'",
    "build": "pnpm run typecheck && pnpm -r --if-present run build",
    "typecheck:libs": "tsc --build",
    "typecheck": "pnpm run typecheck:libs && pnpm -r --filter \"./artifacts/**\" ..."
  }
}
```

- `preinstall` — enforces pnpm as the only allowed package manager. Running `npm install` or `yarn` causes an immediate exit-1.
- `typecheck:libs` — runs `tsc --build` at the root, which uses project references to type-check all `lib/` packages in dependency order.
- `typecheck` — type-checks `lib/` first, then runs each `artifact`'s own `typecheck` script.
- `build` — type-checks everything, then recursively runs each package's `build` script.

---

## 4. Shared Libraries (`lib/`)

These packages have no runtime of their own — they exist to share contract definitions, type-safe schemas, and reusable clients across the workspace.

### 4.1 `@workspace/api-spec` — OpenAPI contract

**File:** `lib/api-spec/openapi.yaml`

The single source of truth for the HTTP API contract. Currently covers only one endpoint:

```yaml
paths:
  /healthz:
    get:
      operationId: healthCheck
      tags: [health]
      responses:
        "200":
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/HealthStatus"
components:
  schemas:
    HealthStatus:
      type: object
      properties:
        status:
          type: string
      required: [status]
```

The `auth`, `subdomains`, and `tls` routes were added directly in TypeScript and are not yet reflected in this OpenAPI spec. The health endpoint is the only one that uses the code-generation pipeline.

**Code generation** is triggered by running `pnpm codegen` inside `lib/api-spec/`:

```typescript
// lib/api-spec/orval.config.ts
export default defineConfig({
  "api-client-react": {
    input: { target: "./openapi.yaml" },
    output: {
      workspace: apiClientReactSrc,
      client: "react-query",           // ← generates TanStack Query hooks
      mutator: { path: "custom-fetch.ts", name: "customFetch" },
    },
  },
  zod: {
    input: { target: "./openapi.yaml" },
    output: {
      workspace: apiZodSrc,
      client: "zod",                   // ← generates Zod validators
      zod: { version: 3 },             // pinned to match the catalog's zod ^3.x
    },
  },
});
```

Orval reads the OpenAPI YAML and writes two sets of generated files:
1. React-Query hooks → `lib/api-client-react/src/generated/`
2. Zod schemas → `lib/api-zod/src/generated/`

### 4.2 `@workspace/api-zod` — Generated Zod schemas

**Files:** `lib/api-zod/src/generated/api.ts`, `lib/api-zod/src/index.ts`

The only generated schema right now is:

```typescript
// lib/api-zod/src/generated/api.ts
export const HealthCheckResponse = zod.object({
  status: zod.string(),
});
```

This is imported and used by the health route in the API server:

```typescript
// artifacts/api-server/src/routes/health.ts
import { HealthCheckResponse } from "@workspace/api-zod";
const data = HealthCheckResponse.parse({ status: "ok" });
res.json(data);
```

The `.parse()` call here guarantees the response shape conforms to the OpenAPI spec at runtime — not just at compile time.

### 4.3 `@workspace/api-client-react` — Generated React-Query client

**Files:** `lib/api-client-react/src/generated/api.ts`, `api.schemas.ts`, `custom-fetch.ts`, `index.ts`

Orval generated a `useHealthCheck()` hook:

```typescript
// lib/api-client-react/src/generated/api.ts
export function useHealthCheck(options?) {
  return useQuery({ queryKey: ['/api/healthz'], queryFn: healthCheck });
}
```

The hook delegates to `customFetch()` defined in `custom-fetch.ts`. This is the most sophisticated file in the shared libraries — it is a production-grade `fetch` wrapper with:

- **Base URL injection** (`setBaseUrl()`) — prepends a configurable base URL to any relative path. Used for environments (e.g. React Native) where the API lives at a different origin.
- **Auth token injection** (`setAuthTokenGetter()`) — registers a callback that is called before every request; if it returns a token, `Authorization: Bearer <token>` is added automatically.
- **Smart response parsing** — detects `Content-Type` to auto-select JSON, text, or blob parsing (`responseType: "auto"`).
- **Structured error class** — `ApiError<T>` carries `status`, `statusText`, `data`, `method`, `url`, and the original `Response`. It builds a human-readable message by inspecting common error payload shapes (`error`, `message`, `title`, `detail`).
- **BOM stripping** — handles JSON responses that start with a byte-order mark (`\uFEFF`).
- **No-body detection** — correctly handles 204/205/304 and `HEAD` responses (no body to parse).
- **GET/HEAD body guard** — throws synchronously if a body is attached to a `GET` or `HEAD` request.

The `@workspace/websentinel` frontend lists `@workspace/api-client-react` as a dependency but **does not yet use the generated hooks** for auth/scan routes. Those are called directly via the hand-written `apiFetch()` helper in `lib/auth.tsx`. The generated hooks are ready but unused for the new routes that aren't in the OpenAPI spec.

### 4.4 `@workspace/db` — Database layer (Drizzle + PostgreSQL)

**Files:** `lib/db/src/index.ts`, `lib/db/src/schema/index.ts`, `lib/db/drizzle.config.ts`

```typescript
// lib/db/src/index.ts
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });
export * from "./schema";
```

- Exports a Drizzle `db` instance connected to PostgreSQL via `DATABASE_URL`.
- The schema file (`src/schema/index.ts`) is currently empty — only a comment template exists. No tables are defined.
- The `drizzle.config.ts` configures schema path and dialect for `drizzle-kit push` (schema sync to the database).

**Current status:** `@workspace/db` is declared as a dependency of `@workspace/api-server` (`package.json`) and referenced in `api-server/tsconfig.json`, but **no route imports `db`**. The database package is scaffolded and ready, but all current data is in-memory. Connecting routes to the database is the main production-readiness step.

---

## 5. API Server (`artifacts/api-server`)

Express 5 Node.js backend. All routes live under the `/api` prefix. The server is ESM-only (`"type": "module"`), bundled with esbuild for deployment.

### 5.1 Entry point (`index.ts`)

**File:** `artifacts/api-server/src/index.ts`

```typescript
const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required...");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);
app.listen(port, (err) => { ... });
```

Two-stage PORT validation: presence check first, then numeric range. Throws synchronously before `app.listen` if invalid — the process dies with a clear message rather than silently binding to `NaN`. On success, logs `{ port }` via pino.

### 5.2 Express app (`app.ts`)

**File:** `artifacts/api-server/src/app.ts`

The middleware stack, in order:

| # | Middleware | Purpose |
|---|-----------|---------|
| 1 | `pinoHttp({ logger, serializers })` | Attaches `req.log` to every request; logs method + path (query strings stripped) + status code on completion |
| 2 | `cors()` | Permissive CORS — accepts any origin. No allowlist. |
| 3 | `express.json()` | Parses JSON bodies → `req.body` |
| 4 | `express.urlencoded({ extended: true })` | Parses URL-encoded bodies |
| 5 | `app.use("/api", router)` | Mounts all routes under `/api` |

The pino-http serializer strips query strings from logged URLs:
```typescript
req(req) {
  return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
}
```
This prevents sensitive query parameters from appearing in application logs.

### 5.3 Logger (`lib/logger.ts`)

**File:** `artifacts/api-server/src/lib/logger.ts`

```typescript
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  // non-production: pino-pretty (colorized human-readable output)
  // production: raw JSON (for log aggregators)
});
```

Three fields are **automatically redacted** from every log entry: the `Authorization` header (which carries bearer tokens), incoming cookies, and outgoing `Set-Cookie` headers. These will never appear in any log line regardless of log level.

### 5.4 Route registry (`routes/index.ts`)

**File:** `artifacts/api-server/src/routes/index.ts`

```typescript
const router = Router();
router.use(healthRouter);
router.use(authRouter);
router.use(subdomainsRouter);
router.use(tlsRouter);
export default router;
```

Four sub-routers, each self-declaring their path segments. Express tries them in registration order. Combined with the `/api` mount in `app.ts`, the full route table is:

| Method | Path | Auth required |
|--------|------|--------------|
| GET | `/api/healthz` | No |
| POST | `/api/auth/login` | No |
| POST | `/api/auth/logout` | No |
| GET | `/api/auth/me` | Token in header |
| POST | `/api/subdomains/enumerate` | Yes |
| POST | `/api/tls/check` | Yes |

### 5.5 Health route (`routes/health.ts`)

**File:** `artifacts/api-server/src/routes/health.ts`

```typescript
router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});
```

Validates its own response shape using the generated Zod schema before sending. This ensures the live endpoint always conforms to the OpenAPI contract. Used for liveness probes.

### 5.6 Auth routes (`routes/auth.ts`)

**File:** `artifacts/api-server/src/routes/auth.ts`

#### Data model (prototype)

```typescript
const DEMO_USERS: Record<string, {
  id: string; email: string; name: string; role: string;
  passwordHash: string; // plaintext — prototype only
  avatar: string; joinedAt: string; scansRun: number;
}> = {
  "admin@websentinel.io": { id: "usr_01", name: "Alex Morgan", role: "Security Analyst", passwordHash: "demo1234", ... },
  "demo@websentinel.io":  { id: "usr_02", name: "Demo User",  role: "Viewer",           passwordHash: "demo", ... },
};
```

Two hardcoded users. The field is named `passwordHash` but stores plaintext — commented as `// plaintext for prototype only`.

#### Session store

```typescript
const activeSessions: Map<string, string> = new Map(); // token → email
export { activeSessions };
```

A module-level `Map`. Because Node caches module instances, `subdomains.ts` and `tls.ts` import this exact same Map object to check tokens without any shared state mechanism. Sessions are lost on server restart.

#### Token generation

```typescript
function generateToken(): string {
  return "tok_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
```

Combines a `Math.random()` base-36 string with a base-36 timestamp. Not cryptographically secure — adequate for a prototype. Tokens look like `tok_abc123xyz1k8b2f`.

#### `POST /api/auth/login`

1. `LoginSchema.safeParse(req.body)` — validates `{ email: z.string().email(), password: z.string().min(1) }`. Returns 400 with structured errors on failure.
2. Lowercases the email and looks it up in `DEMO_USERS`.
3. Compares `user.passwordHash !== password` (direct equality, plaintext).
4. On success: generates a token, stores `token → email` in `activeSessions`, returns `{ token, user }` (password field excluded).
5. On failure: returns `401 { error: "Invalid email or password" }` — same message for unknown email and wrong password (no user enumeration).

#### `POST /api/auth/logout`

Reads `Authorization: Bearer <token>`, deletes the token from `activeSessions`, always returns `{ ok: true }`.

#### `GET /api/auth/me`

Validates the `Authorization: Bearer` header, looks up the email from `activeSessions`, returns the user profile. Three distinct 401 paths: missing header, unknown token, user not found (defensive — shouldn't happen if sessions are consistent).

### 5.7 Subdomain enumeration (`routes/subdomains.ts`)

**File:** `artifacts/api-server/src/routes/subdomains.ts`

#### Auth middleware

```typescript
function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return; }
  const token = auth.slice(7);
  if (!activeSessions.has(token)) { res.status(401).json({ error: "Invalid or expired token" }); return; }
  next();
}
```

Imported `activeSessions` from `./auth.js` — uses the same in-memory Map. The same pattern is duplicated in `tls.ts`.

#### Wordlists

- `ACTIVE_WORDLIST` (~100 entries): common subdomains — `www`, `mail`, `api`, `admin`, `dev`, `staging`, `cdn`, `git`, `db`, `grafana`, `swagger`, etc.
- `PASSIVE_COMMON_PREFIXES` (14 entries): a smaller subset for the passive mode's local prefix guessing.

#### Input schema

```typescript
const EnumerateSchema = z.object({
  domain: z.string().min(3).max(253)
    .regex(/^[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?(\.[...)+$/, "Invalid domain format"),
  mode: z.enum(["passive", "active", "both"]).default("passive"),
  checkHttp: z.boolean().default(false),
  wordlistSize: z.enum(["small", "medium", "full"]).default("small"),
});
```

The domain regex enforces RFC-compliant hostname format, preventing traversal-style strings.

#### Helper: `resolveSubdomain(fqdn)`

Uses Node's `dns/promises`. Tries `resolve4` first, falls back to `resolve6`, also resolves CNAMEs via `resolveCname`. Returns `{ resolved, ips, cnames }`.

#### Helper: `checkHttp(fqdn, timeoutMs=4000)`

Tries an HTTPS HEAD to port 443 with `rejectUnauthorized: false` (so broken certs still respond). If HTTPS fails, falls back to HTTP port 80. Returns `{ status, httpsAvailable, responseTimeMs }`.

#### `POST /api/subdomains/enumerate` — execution flow

1. Validates and normalizes the domain (lowercased, `www.` prefix stripped).
2. Maintains a `Set<string>` (`seen`) for deduplication; `addResult()` checks before pushing.
3. **Passive mode:**
   - **crt.sh real network call:** `fetch("https://crt.sh/?q=%.{domain}&output=json")` with an 8-second `AbortController` timeout. Parses the JSON array, extracts `name_value` and `common_name` fields, strips wildcard prefixes (`*.`), filters to names that end with `.{domain}`, deduplicates, resolves each via DNS, and optionally HTTP-probes.
   - **Common prefix guessing:** resolves all `PASSIVE_COMMON_PREFIXES` (or first 30 of `ACTIVE_WORDLIST` for medium/full) in parallel via `Promise.allSettled`.
4. **Active mode (DNS brute-force):**
   - Slices the wordlist: `small` = 40, `medium` = 80, `full` = all.
   - Processes in **batches of 15** (`BATCH_SIZE = 15`) using `Promise.allSettled` per batch, avoiding DNS flooding.
5. **Response:**
   ```json
   {
     "domain": "example.com",
     "mode": "passive",
     "totalFound": 5,
     "resolvedCount": 4,
     "elapsedMs": 1234,
     "subdomains": [{ "fqdn": "...", "resolved": true, "ipAddresses": [...], "source": "cert-transparency", ... }]
   }
   ```
   Results are sorted resolved-first, then alphabetically.

### 5.8 TLS/certificate check (`routes/tls.ts`)

**File:** `artifacts/api-server/src/routes/tls.ts`

The most complex route — implements a full TLS security scanner.

#### Input schema

```typescript
const TlsCheckSchema = z.object({
  host: z.string().min(3).max(253).regex(...),
  port: z.number().int().min(1).max(65535).default(443),
  checkHeaders: z.boolean().default(true),
  checkTlsVersions: z.boolean().default(true),
});
```

#### Helper: `getCertificate(host, port=443)`

Opens a raw `tls.connect()` socket with `rejectUnauthorized: false` (intentional — a scanner must be able to inspect expired/self-signed certs). On handshake:
- `socket.getPeerCertificate(true)` — full certificate chain.
- `socket.getCipher()` and `socket.getProtocol()` — negotiated cipher suite and TLS version string.
- Parses SANs from `peer.subjectaltname` (comma-separated `DNS:...` entries).
- Computes `daysUntilExpiry` (negative = expired), `isExpiringSoon` (< 30 days).
- Detects `isSelfSigned` by comparing subject CN/O with issuer CN/O.
- Detects `isWildcard` from wildcard SANs or CN.
- 8-second timeout on both connect and socket operations.

#### Helper: `checkTlsVersion(host, version)`

Pins both `minVersion` and `maxVersion` to a single TLS version in a `tls.connect()` call. Returns `true` if the handshake succeeds (the server accepts that version), `false` on error or timeout.

#### Helper: `getSecurityHeaders(host, port=443)`

1. Makes a real HTTPS GET `/` with `rejectUnauthorized: false` — collects all response headers.
2. Parses HSTS: extracts `max-age`, `includeSubDomains`, and `preload` directives via regex.
3. Makes an HTTP HEAD to port 80 — checks for redirect (3xx) to `https://`.
4. Maps the results to `SecurityHeaderInfo[]` for 8 headers:

| Header | Severity |
|--------|---------|
| `strict-transport-security` | high |
| `content-security-policy` | high |
| `x-content-type-options` | medium |
| `x-frame-options` | medium |
| `referrer-policy` | low |
| `permissions-policy` | low |
| `x-xss-protection` | info |
| `cache-control` | info |

#### Helper: `computeGrade(cert, headers, httpsRedirect, tlsSupport)`

Starts at 100, deducts:
- cert expiringSoon: −20, isSelfSigned: −30
- TLS 1.0: −20, TLS 1.1: −10, neither 1.2 nor 1.3: −40
- Each missing critical/high header: −5
- HTTP open without redirect: −10, missing HSTS: −10, HSTS max-age < 1yr: −5

Grade thresholds: ≥95 → A+, ≥80 → A, ≥65 → B, ≥50 → C, ≥35 → D, else F. Returns F immediately for expired/null cert, N/A if HTTPS isn't available.

#### Helper: `buildFindings(cert, headers, httpsRedirect, tlsSupport)`

Translates the numeric scan results into human-readable `{ severity, title, detail }` finding objects. Covers: no cert, expired cert, expiring-soon cert, self-signed cert, deprecated TLS 1.0/1.1, missing HTTP→HTTPS redirect, missing/short HSTS, and each missing high/medium security header.

#### `POST /api/tls/check` — execution flow

```typescript
const [certResult, headerResult, tlsVersions] = await Promise.allSettled([
  getCertificate(host, port),
  checkHeaders ? getSecurityHeaders(host, port) : Promise.resolve(null),
  checkTlsVersions
    ? Promise.all([checkTlsVersion(host, "TLSv1"), checkTlsVersion(host, "TLSv1.1"),
                   checkTlsVersion(host, "TLSv1.2"), checkTlsVersion(host, "TLSv1.3")])
    : Promise.resolve([false, false, false, false]),
]);
```

All three major checks (certificate, security headers, TLS version probes) run **in parallel** via `Promise.allSettled`. An error in any single check doesn't abort the others. Results are merged into a `TlsCheckResult` and returned as JSON.

### 5.9 Build system (`build.mjs`)

**File:** `artifacts/api-server/build.mjs`

A standalone Node ESM script that drives esbuild:

- **Input:** `src/index.ts` — bundles everything transitively.
- **Output:** `dist/index.mjs` — single ESM bundle.
- **`bundle: true`** — statically resolves all imports at build time.
- **`external: [...]`** — a large explicit list of unbundleable packages (native add-ons, heavy optional deps like `bcrypt`, `pg-native`, etc.) so esbuild doesn't try and fail to bundle them.
- **`banner`** — injects CJS compatibility shims at the top of the output:
  ```javascript
  globalThis.require = createRequire(import.meta.url);
  globalThis.__filename = ...;
  globalThis.__dirname = ...;
  ```
  This is required because Express (and several of its dependencies) are CommonJS and internally reference `require`, `__dirname`, and `__filename`.
- **`esbuildPluginPino`** — pino uses worker threads with dynamically resolved worker scripts. This plugin rewrites those references so they bundle correctly.
- **`sourcemap: "linked"`** — generates `.js.map` files and links them from the bundle, enabling source-mapped stack traces in production.

---

## 6. Frontend (`artifacts/websentinel`)

React 18 SPA bundled with Vite. Written in TypeScript with Tailwind CSS v4 (via `@tailwindcss/vite`). UI components are from the shadcn/ui collection built on Radix UI primitives.

### 6.1 Entry point (`main.tsx`)

**File:** `artifacts/websentinel/src/main.tsx`

```typescript
createRoot(document.getElementById('root')!, {
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
```

Renders `App` wrapped in a top-level `ErrorBoundary`. The `onCaughtError` callback keeps caught errors off React's `reportError()` (which would pop the dev overlay in non-error-boundary scenarios), routing them to `console.error` instead.

### 6.2 Vite configuration (`vite.config.ts`)

**File:** `artifacts/websentinel/vite.config.ts`

Key settings:
- **`base: basePath`** — reads `BASE_PATH` env var (set to `/` locally, set by Replit's routing layer in production).
- **`PORT` validation** — same two-stage validation as the API server. Throws at config-load time if `PORT` is missing or non-numeric.
- **Path alias:** `@` → `src/`, so `import '@/lib/auth'` works from any depth.
- **Plugins:** `@vitejs/plugin-react` (JSX transform), `@tailwindcss/vite` (Tailwind CSS v4 JIT), `@replit/vite-plugin-runtime-error-modal` (dev overlay), and Replit-specific `cartographer`/`devBanner` plugins when `REPL_ID` is set.
- **`resolve.dedupe: ['react', 'react-dom']`** — prevents duplicate React instances, which cause hook errors.
- **Build output:** `dist/public/` (separate from TypeScript's `dist/` to avoid confusion).

### 6.3 App bootstrap and provider tree (`App.tsx`)

**File:** `artifacts/websentinel/src/App.tsx`

The root `App` component composes the full provider tree in this order (outer to inner):

```tsx
<QueryClientProvider client={queryClient}>   // TanStack React Query
  <TooltipProvider>                          // Radix tooltip context
    <AuthProvider>                           // Auth state + login/logout
      <WorkspaceProvider>                    // Workspace switching
        <ScanStoreProvider>                  // Scan history (localStorage)
          <WouterRouter base={BASE_URL}>     // Client-side routing
            <RoutedErrorBoundary>            // Error recovery on navigation
              <DashboardRoutes />            // Route tree
            </RoutedErrorBoundary>
          </WouterRouter>
        </ScanStoreProvider>
      </WorkspaceProvider>
    </AuthProvider>
    <Toaster />                              // Toast notifications
  </TooltipProvider>
</QueryClientProvider>
```

A `QueryClient` instance is created at module level (outside the component) so it survives re-renders.

`App.tsx` also contains most of the inline page components (`Overview`, `NewScan`, `ScanDetails`, `Findings`, `Landing`, `Shell`, etc.) and the shared UI primitives (`Button`, `Card`, `Eyebrow`, `StatusPill`, `PrototypeBanner`, `PageHeading`). This is a deliberate prototype choice — fewer files to navigate while iterating on the UI. The split-out pages (`Login`, `Profile`, `Subdomains`, `TlsCheck`) were extracted as they grew complex.

### 6.4 Routing (wouter)

**File:** `artifacts/websentinel/src/App.tsx` — `DashboardRoutes` function

wouter is a minimalist routing library (~2 KB). `DashboardRoutes` handles the top-level routing logic:

```tsx
function DashboardRoutes() {
  const [loc] = useLocation();
  if (loc === '/') return <Landing />;
  if (loc === '/login') return <Login />;
  return (
    <AuthGuard>
      <Shell>
        <Switch>
          <Route path="/overview"      component={Overview} />
          <Route path="/scans/new"     component={NewScan} />
          <Route path="/scans/:id"     component={ScanDetails} />
          <Route path="/findings"      component={Findings} />
          <Route path="/dom-inspector" component={DOMInspector} />
          <Route path="/assets"        component={Assets} />
          <Route path="/history"       component={HistoryPage} />
          <Route path="/reports"       component={Reports} />
          <Route path="/settings"      component={Settings} />
          <Route path="/subdomains"    component={Subdomains} />
          <Route path="/tls"           component={TlsCheck} />
          <Route path="/profile"       component={Profile} />
          <Route component={NotFound} />
        </Switch>
      </Shell>
    </AuthGuard>
  );
}
```

`/` and `/login` are **public** — they render without going through `AuthGuard` or `Shell`. Every other route is protected and rendered inside the `Shell` layout (sidebar + header + main content area).

`RoutedErrorBoundary` wraps `DashboardRoutes` and passes `location` as the `resetKey` — when the user navigates away from an errored route, the error boundary automatically resets.

### 6.5 AuthGuard

**File:** `artifacts/websentinel/src/App.tsx` — `AuthGuard` function

```typescript
function AuthGuard({ children }) {
  const { user, loading } = useAuth();
  const [loc] = useLocation();

  if (loading) return <SplashScreen />;         // shield + spinner

  if (!user && loc !== '/login') {
    window.location.replace('/login');           // hard redirect (not push)
    return null;
  }

  return <>{children}</>;
}
```

Three states: loading (shows a spinner), unauthenticated (hard-redirects to `/login`), authenticated (renders children). Uses `window.location.replace()` rather than wouter's `navigate()` to ensure a full page reload and prevent back-button returning to a protected route.

### 6.6 Auth context (`lib/auth.tsx`)

**File:** `artifacts/websentinel/src/lib/auth.tsx`

```typescript
const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
```

The API base URL is read from the `VITE_API_URL` environment variable (injected at Vite build/dev time), defaulting to `localhost:3000`. This is the only place the backend URL is configured on the frontend.

**Provider state:**
- `user: AuthUser | null` — the authenticated user profile.
- `token: string | null` — initialized lazily from `localStorage.getItem('ws_token')`.
- `loading: boolean` — true while the `useEffect` session rehydration is running.

**Session rehydration (on mount):**
```typescript
useEffect(() => {
  if (!token) { setLoading(false); return; }
  fetch(`${API_BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
    .then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then((u: AuthUser) => setUser(u))
    .catch(() => { localStorage.removeItem('ws_token'); setToken(null); })
    .finally(() => setLoading(false));
}, []);
```
On mount, if a token exists in `localStorage`, it is validated against `GET /api/auth/me`. On success, the user is populated without needing another login. On failure (expired or unknown token), the token is cleared.

**`login(email, password)`** — POSTs to `/api/auth/login`, stores the returned token in both state and `localStorage`, sets the user.

**`logout()`** — POSTs to `/api/auth/logout` (fire-and-forget), removes the token from `localStorage`, clears state, then hard-navigates to `/login` via `window.location.href`.

**`apiFetch(path, token, init)`** — a thin `fetch` wrapper that attaches `Content-Type: application/json` and the `Authorization: Bearer` header. Consumed by `pages/subdomains.tsx` and `pages/tls-check.tsx`.

### 6.7 Workspace store (`lib/workspaces.tsx`)

**File:** `artifacts/websentinel/src/lib/workspaces.tsx`

Manages named workspaces, each with its own isolated scan history. Workspaces are persisted to `localStorage` under the key `ws_workspaces`. The active workspace ID is stored separately under `ws_active_workspace`.

**Data shape:**
```typescript
interface Workspace {
  id: string;        // "ws_01", "ws_abc123" etc.
  name: string;      // display name
  createdAt: string; // ISO date
}
```

The default workspace (`ws_default`, `"My Workspace"`) is created if none exists in storage.

**API exposed through `useWorkspace()`:**
- `workspaces` — full list.
- `activeId` / `active` — the currently selected workspace.
- `setActive(id)` — switches workspace, persists choice.
- `createWorkspace(name)` — generates a UID (`ws_` + random base36 + timestamp), persists, and sets it active.
- `renameWorkspace(id, name)` — updates name in place.
- `deleteWorkspace(id)` — removes the workspace and its associated scan history (`ws_scan_history_{id}`). Guards against deleting the last workspace. If the deleted workspace was active, switches to the first remaining one.

The workspace ID is the key discriminator used by `ScanStoreProvider` to namespace its `localStorage` key, giving each workspace an isolated scan list.

### 6.8 Scan store (`lib/scans.tsx`)

**File:** `artifacts/websentinel/src/lib/scans.tsx`

The largest and most important context in the frontend. Manages all scan history, persistence, and derived data.

**Storage keys:**
- Default workspace: `ws_scan_history`
- Named workspaces: `ws_scan_history_{workspaceId}`
- Max records: 50 (oldest pushed out when exceeded).

**Type hierarchy:**
```
ScanRecord
  ├── SubdomainScanRecord  { type: 'subdomain', data: SubdomainScanData }
  └── TlsScanRecord        { type: 'tls', data: TlsScanData, grade, findingsCount }
```

The `SubdomainScanData` and `TlsScanData` interfaces mirror the API response shapes exactly (same field names, same types). This means API responses can be stored directly without transformation.

**API exposed through `useScanStore()`:**

| Function | Description |
|----------|-------------|
| `scans` | All records, newest-first |
| `addSubdomainScan(data)` | Creates a `SubdomainScanRecord` with auto-incremented `WS-XXXX` ID, persists |
| `addTlsScan(data)` | Creates a `TlsScanRecord` with grade + per-severity finding counts, persists |
| `deleteScan(id)` | Removes one record |
| `clearAll()` | Empties the store |
| `allFindings` | Derived: flattens all findings from all TLS scans into `Finding[]`, each with a stable `{scanId}-F{NNN}` ID |
| `latestScanFor(domain)` | Most recent scan for a domain (any type) |

**`allFindings` derivation:**
```typescript
const allFindings: Finding[] = scans
  .filter((s): s is TlsScanRecord => s.type === 'tls')
  .flatMap(s =>
    s.data.findings.map((f, i) => ({
      id: `${s.id}-F${String(i + 1).padStart(3, '0')}`,
      scanId: s.id,
      domain: s.domain,
      severity: capitalize(f.severity) as Finding['severity'],
      category: deriveCategory(f.title),   // keyword-based classifier
      ...
    }))
  );
```

`deriveCategory()` classifies findings into buckets (TLS & transport, Certificate, Security headers, HTTPS enforcement, Clickjacking, Information disclosure, Security configuration) by matching keywords in the finding title.

**Utility functions (exported):**

- `scoreFromTlsScan(s)` — maps TLS grade to a 0–100 score base, then subtracts penalty points for critical (×8), high (×4), and medium (×2) findings.
- `elapsedLabel(ms)` — `"1.4s"` or `"320ms"`.
- `relativeTime(iso)` — `"just now"`, `"5m ago"`, `"3h ago"`, `"Yesterday"`, `"Oct 29"`.

### 6.9 Utility (`lib/utils.ts`)

**File:** `artifacts/websentinel/src/lib/utils.ts`

```typescript
import { twMerge } from 'tailwind-merge';
import { clsx, type ClassValue } from 'clsx';
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

The standard shadcn/ui utility. `clsx` builds a conditional class string; `twMerge` resolves Tailwind class conflicts (e.g. `cn('p-2 p-4')` → `'p-4'`). Used throughout `components/ui/`.

### 6.10 Hooks (`hooks/`)

**File:** `artifacts/websentinel/src/hooks/use-mobile.tsx`

```typescript
const MOBILE_BREAKPOINT = 768;
export function useIsMobile() {
  // subscribes to window.matchMedia('(max-width: 767px)')
  // returns boolean, undefined during SSR
}
```

Responsive breakpoint hook using `matchMedia` with a `change` event listener. Returns `false` during server-side rendering (where `window` is undefined).

---

**File:** `artifacts/websentinel/src/hooks/use-toast.ts`

A module-level reducer-based toast notification system (from shadcn/ui). It avoids a Context Provider by storing state in a module-level variable and notifying React components via a subscribers array.

- `TOAST_LIMIT = 1` — only one toast visible at a time.
- `TOAST_REMOVE_DELAY = 1000000ms` — effectively keeps toasts visible until manually dismissed.
- `toast({ title, description, variant })` — adds a toast; returns `{ id, dismiss, update }`.
- `useToast()` — subscribes the calling component to toast state changes.

### 6.11 Error boundary (`components/error-boundary.tsx`)

**File:** `artifacts/websentinel/src/components/error-boundary.tsx`

A class component implementing React's error boundary pattern. Key behaviors:
- `getDerivedStateFromError` — catches any thrown value and converts it to an `Error` (handles non-Error throws via `JSON.stringify` or `String()` fallback).
- `componentDidUpdate` — when `resetKey` changes (set to the current route in `RoutedErrorBoundary`), the boundary resets automatically. This means navigating away from an errored page clears the error state without user action.
- **Dev mode** — shows the raw error message in a `<pre>` block (gated on `import.meta.env.DEV`).
- **Default fallback** — a centered card with a "Try again" button.
- Accepts an optional `FallbackComponent` prop for custom error UIs.

### 6.12 UI components (`components/ui/`)

**Directory:** `artifacts/websentinel/src/components/ui/` — 54 files

The complete shadcn/ui component collection, each built on Radix UI primitives. All components use the `cn()` utility and `class-variance-authority` (CVA) for variant-based styling.

Key components referenced by the main app:

| File | Radix primitive | Usage |
|------|----------------|-------|
| `button.tsx` | `@radix-ui/react-slot` | Polymorphic button with `variant` and `size` props |
| `card.tsx` | none | Simple `div` wrappers (Header, Content, Footer) |
| `tooltip.tsx` | `@radix-ui/react-tooltip` | `TooltipProvider` wraps the whole app in `App.tsx` |
| `toast.tsx` / `toaster.tsx` | `@radix-ui/react-toast` | Notification system, `<Toaster>` at root |
| `chart.tsx` | Recharts wrapper | Chart context + `ChartContainer`, `ChartTooltip` |
| `sidebar.tsx` | `@radix-ui/react-slot` | Complex sidebar with mobile sheet, keyboard shortcut |
| `dialog.tsx` | `@radix-ui/react-dialog` | Modal dialogs |
| `dropdown-menu.tsx` | `@radix-ui/react-dropdown-menu` | Accessible dropdown menus |
| `select.tsx` | `@radix-ui/react-select` | Native-replacement select |
| `table.tsx` | none | Styled `<table>` wrappers |
| `badge.tsx` | none | Status/label pills |
| `input.tsx` | none | Styled `<input>` |
| `label.tsx` | `@radix-ui/react-label` | Accessible form labels |
| `separator.tsx` | `@radix-ui/react-separator` | Horizontal/vertical dividers |

Note: The main app (`App.tsx`) and individual pages define their own inline `Card`, `Button`, and `Eyebrow` components rather than importing from `components/ui/`. This is intentional for tighter control over the dark-themed design system used in the dashboard.

### 6.13 Pages

#### `pages/login.tsx`

**File:** `artifacts/websentinel/src/pages/login.tsx`

The public login page. Key details:
- Two controlled inputs (email, password) with a show/hide password toggle (`Eye`/`EyeOff` icons from lucide).
- `autoComplete="email"` / `autoComplete="current-password"` — correct autocomplete hints for password managers.
- Error state displayed in a styled alert box (clears on input change).
- Loading state on the submit button during the API call.
- **Demo credentials quick-fill section** — two buttons at the bottom pre-populate email/password for either demo account. This is purely for prototype demonstration.
- On success: `navigate('/overview')` via wouter.

#### `pages/profile.tsx`

**File:** `artifacts/websentinel/src/pages/profile.tsx`

Profile page using `useAuth()` for the current user. Features:
- Avatar card showing `user.avatar` (initials), name, role, email, joinedAt, and scansRun — all from the token-authenticated `/api/auth/me` response.
- Edit profile form (name and role fields). Email is disabled with a note ("cannot be changed in this prototype"). `handleSave` is purely local state — no API call is made.
- Notification preferences (local state only, not persisted).
- Account security section (password/2FA buttons are UI-only, not functional).
- Recent activity (hardcoded illustrative items).

#### `pages/subdomains.tsx`

**File:** `artifacts/websentinel/src/pages/subdomains.tsx`

Two-panel layout: config form (left/top) + results (right/bottom).

**Config panel:**
- Domain input (pre-populated from `?domain=` query param — set by `NewScan` page when navigating here).
- Mode selector: passive / active / both (radio buttons).
- Wordlist size selector: small / medium / full (shown only for active/both modes).
- HTTP probe toggle.
- Clear button on the domain input.

**Form submission:**
1. Strips protocol prefixes and trailing paths from the input.
2. Validates the domain with the same regex as the backend.
3. Calls `apiFetch('/api/subdomains/enumerate', token, { method: 'POST', body: ... })`.
4. On success: stores result in local state, calls `addSubdomainScan(data)` from `useScanStore`, saves the returned scan ID.

**Results panel:**
- Summary stats bar (total found, resolved, elapsed, source count).
- Filterable table with source filter dropdown and text search (`query` state).
- Expandable rows — clicking a row toggles a detail section showing all IPs, CNAMEs, and an "Open in browser" link.
- CSV export: creates a `Blob`, uses `URL.createObjectURL` + programmatic `<a>` click.
- "Scan saved" banner with a link to the scan detail page (`/scans/{id}`).

#### `pages/tls-check.tsx`

**File:** `artifacts/websentinel/src/pages/tls-check.tsx`

Two-panel layout: config (left) + rich results (right).

**Config panel:**
- Hostname input (pre-populated from `?host=` query param).
- Port input (default 443).
- Two check toggles: security headers, TLS version probing.

**Form submission:**
1. Strips protocol and path from hostname. Validates with domain regex.
2. Validates port (1–65535).
3. Calls `apiFetch('/api/tls/check', token, { method: 'POST', body: ... })`.
4. On success: stores result, calls `addTlsScan(data)`.

**Results panel** (all shown in collapsible/sectioned cards):
- **Grade bubble** — large colored letter grade with description text.
- **Quick-status badges** — valid cert, TLS 1.3, HSTS, TLS 1.0 warning.
- **Security findings** — each finding in a color-coded card with severity badge. Count badges for critical/high/medium.
- **Certificate details** — collapsible sections: Identity & validity, Subject Alt Names, Fingerprints.
- **TLS version support** — 4 badges (TLS 1.0/1.1 amber/deprecated, 1.2/1.3 green/supported).
- **Security headers** — each of the 8 checked headers shown with ✓/✗ and severity badge for missing ones.
- **HTTPS redirect & HSTS** — shows HTTP→HTTPS redirect status, HSTS presence, max-age, includeSubDomains, preload.

---

## 7. Data Flows — End to End

### 7.1 Bootstrap / session rehydration

```
Browser loads page
  → main.tsx: createRoot().render(<ErrorBoundary><App /></ErrorBoundary>)
  → App.tsx: QueryClientProvider, TooltipProvider, AuthProvider (mounts)
  → AuthProvider useEffect fires:
      token = localStorage.getItem('ws_token')
      if token exists:
        fetch GET /api/auth/me  Authorization: Bearer <token>
        → api-server: app.ts middleware → routes/auth.ts GET /auth/me
        → activeSessions.get(token) → email → DEMO_USERS[email] → user
        ← { id, email, name, role, avatar, joinedAt, scansRun }
        setUser(u), setLoading(false)
      else:
        setLoading(false)
  → AuthGuard: loading=false, user exists → renders Shell + routes
```

### 7.2 Login

```
User fills login form → clicks "Sign in"
  → login.tsx handleSubmit:
      AuthProvider.login(email, password)
        fetch POST /api/auth/login  { email, password }
        → api-server: LoginSchema.safeParse → DEMO_USERS lookup → token gen
        ← { token: "tok_...", user: { ... } }
        localStorage.setItem('ws_token', token)
        setToken(tok), setUser(u)
  → navigate('/overview')
  → AuthGuard: user exists → Shell renders → Overview page loads
```

### 7.3 Subdomain enumeration

```
User fills subdomain form → clicks "Start enumeration"
  → subdomains.tsx handleSubmit:
      apiFetch('/api/subdomains/enumerate', token, { method: 'POST', body: { domain, mode, ... } })
      → Authorization: Bearer <token> header attached
      → api-server: requireAuth checks activeSessions → passes
      → EnumerateSchema.safeParse → normalizes domain
      → passive mode:
          fetch crt.sh (real network) → parse cert names → resolveSubdomain() each
          resolveSubdomain() → dns.resolve4 / resolve6 / resolveCname (real DNS)
          checkHttp() if requested → https/http HEAD request (real network)
      → active mode:
          wordlist batch loop (BATCH_SIZE=15) → resolveSubdomain() each
      ← { domain, mode, totalFound, resolvedCount, elapsedMs, subdomains: [...] }
  → setResult(data)
  → addSubdomainScan(data) → scans.tsx: new SubdomainScanRecord → localStorage saved
  → setSavedId(record.id)  → "Scan saved as WS-XXXX" banner shown
```

### 7.4 TLS check

```
User fills TLS form → clicks "Run TLS check"
  → tls-check.tsx handleSubmit:
      apiFetch('/api/tls/check', token, { method: 'POST', body: { host, port, checkHeaders, checkTlsVersions } })
      → api-server: requireAuth → TlsCheckSchema.safeParse
      → Promise.allSettled([
          getCertificate(host, port)       // tls.connect, real TLS handshake
          getSecurityHeaders(host, port)   // https.request + http.request, real HTTP
          [checkTlsVersion(host, "TLSv1"), ...TLSv1.1, TLSv1.2, TLSv1.3]  // 4× tls.connect
        ])
      → computeGrade(cert, headers, httpsRedirect, tlsSupport)
      → buildFindings(...)
      ← { host, cert, securityHeaders, httpsRedirect, tlsSupport, overallGrade, findings, elapsedMs }
  → setResult(data)
  → addTlsScan(data) → scans.tsx: new TlsScanRecord (with grade + findingsCount) → localStorage saved
  → allFindings (derived) updates → sidebar findings badge count updates
```

### 7.5 Scan history persistence

```
ScanStoreProvider initializes:
  → load(activeId) reads localStorage[`ws_scan_history_${activeId}`]
  → parses JSON → ScanRecord[]

addSubdomainScan / addTlsScan called:
  → setScans(prev => [newRecord, ...prev].slice(0, 50))
  → save(activeId, next) → localStorage.setItem(key, JSON.stringify(next))

Workspace switch:
  → WorkspaceProvider.setActive(newId) → persists ACTIVE_KEY
  → ScanStoreProvider detects activeId change → load(newId) → setScans(newRecords)

Workspace delete:
  → localStorage.removeItem(`ws_scan_history_${id}`) — cleans up orphaned data
```

---

## 8. Dependency Map

```
@workspace/api-spec (openapi.yaml + orval.config.ts)
  ↓ codegen (pnpm codegen)
  ├── @workspace/api-zod
  │     └── lib/api-zod/src/generated/api.ts  (HealthCheckResponse Zod schema)
  │           consumed by: @workspace/api-server → routes/health.ts
  │
  └── @workspace/api-client-react
        ├── lib/api-client-react/src/generated/api.ts  (useHealthCheck hook)
        ├── lib/api-client-react/src/generated/api.schemas.ts  (HealthStatus type)
        └── lib/api-client-react/src/custom-fetch.ts  (customFetch, ApiError)
              consumed by: @workspace/websentinel (declared dep, hooks ready but unused for new routes)

@workspace/db
  └── lib/db/src/index.ts  (pool, db, schema exports)
        consumed by: @workspace/api-server (declared dep, not yet imported in any route)

@workspace/api-server
  ├── src/index.ts  ← src/app.ts ← src/routes/index.ts
  │                                     ├── routes/health.ts → @workspace/api-zod
  │                                     ├── routes/auth.ts  (exports activeSessions)
  │                                     ├── routes/subdomains.ts → activeSessions
  │                                     └── routes/tls.ts        → activeSessions
  └── src/lib/logger.ts (pino)

@workspace/websentinel
  ├── src/main.tsx → App.tsx
  ├── src/App.tsx  → lib/auth.tsx, lib/scans.tsx, lib/workspaces.tsx, pages/*, components/*
  ├── src/lib/auth.tsx  (AuthProvider, useAuth, apiFetch → api-server)
  ├── src/lib/scans.tsx (ScanStoreProvider, useScanStore → localStorage)
  ├── src/lib/workspaces.tsx (WorkspaceProvider, useWorkspace → localStorage)
  ├── src/pages/login.tsx → lib/auth.tsx
  ├── src/pages/subdomains.tsx → lib/auth.tsx (apiFetch), lib/scans.tsx
  ├── src/pages/tls-check.tsx  → lib/auth.tsx (apiFetch), lib/scans.tsx
  └── src/pages/profile.tsx → lib/auth.tsx
```

---

## 9. Key Design Decisions

**Single-file route handlers with inline auth middleware**
The `requireAuth` function is duplicated in both `subdomains.ts` and `tls.ts` rather than shared via an exported middleware. This keeps each route file self-contained and avoids circular imports with `auth.ts` (which exports `activeSessions`). The tradeoff is a small amount of copy-paste.

**`activeSessions` as a module-level export**
The session Map is exported directly from `auth.ts` and imported by the route files that need it. This works because Node's module cache guarantees a single shared instance. It would break with multiple worker threads or processes — a real persistence layer would be needed for horizontal scaling.

**`localStorage` for scan history on the frontend**
Scan history is stored per-browser, per-workspace in `localStorage` with a 50-record cap. This means no backend infrastructure for history, no user accounts needed for storage, and instant access without API calls. The tradeoff: data is browser-local and lost if `localStorage` is cleared.

**Inline page components vs extracted files**
Most pages live inline in `App.tsx` (Overview, NewScan, ScanDetails, Findings, Assets, Settings, etc.). Only pages that grew large enough to be unwieldy were extracted (Login, Profile, Subdomains, TlsCheck). The inline approach is deliberate for a prototype — easier to iterate.

**`Promise.allSettled` for parallel network checks**
Both the subdomain enumerator (batch DNS resolves) and the TLS checker (cert + headers + 4 version probes) use `Promise.allSettled` rather than `Promise.all`. This means a single failing network operation doesn't abort the entire scan — partial results are returned and errors are handled per-check.

**`rejectUnauthorized: false` in TLS socket connections**
The TLS scanner uses `rejectUnauthorized: false` when connecting to the target to inspect the certificate. This is intentional — a scanner must be able to examine expired, self-signed, and mis-issued certificates. It's not a security flaw in the context of a scanning tool.

**Catalog-pinned dependencies**
All shared dependencies use pnpm's `catalog:` protocol rather than repeating version ranges in every `package.json`. Updating a shared dep (e.g. `zod`) requires only one change in `pnpm-workspace.yaml`.

---

## 10. Prototype Limitations vs Production Gap

| Area | Current state | Production requirement |
|------|--------------|----------------------|
| **Password storage** | Plaintext in `DEMO_USERS` | bcrypt (cost≥12) or argon2id hash |
| **Token generation** | `Math.random()` base36 | `crypto.randomUUID()` |
| **Token expiry** | Never expires | Expiry + issued-at check on `/auth/me` |
| **Token storage** | `localStorage` (XSS-accessible) | `HttpOnly; Secure; SameSite=Strict` cookie |
| **User persistence** | In-memory `DEMO_USERS` (resets on restart) | `@workspace/db` Drizzle `users` table |
| **Session persistence** | In-memory `activeSessions` Map | `sessions` DB table or signed JWT |
| **CORS** | `cors()` — any origin | Explicit origin allowlist |
| **Rate limiting** | None | `express-rate-limit` on auth + scan endpoints |
| **Security headers** | None set on API responses | `helmet` or manual `Content-Security-Policy`, `HSTS`, `X-Frame-Options`, `nosniff` |
| **Signup** | Not implemented | `POST /api/auth/signup` + frontend page |
| **OpenAPI coverage** | Health endpoint only | Auth, subdomains, TLS routes should be spec'd |
| **DB schema** | `lib/db/src/schema/index.ts` — empty | `users`, `sessions`, (optionally) `scans` tables |
| **Scan history** | `localStorage` (browser-local) | API-backed, authenticated scan records |
| **Profile edits** | Local state only | PATCH user endpoint |
| **Notification prefs** | Local state only | User preferences table |
| **2FA / MFA** | UI placeholder | TOTP implementation |
| **Activity feed** | Hardcoded illustrative items | Derived from real scan history |
| **DOM inspector** | Placeholder | Not yet implemented |
| **Assets page** | Sample data | Live data from scan history |
| **Findings page** | Derived from TLS scans only | Should include subdomain findings |
| **Reports page** | Placeholder | PDF/JSON export of scan history |
