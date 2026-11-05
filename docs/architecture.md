# WebSentinel — System Architecture

How the pieces fit together, how data flows, and where the boundaries are.

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        pnpm Monorepo                                │
│                                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌───────────┐ │
│  │  api-spec   │  │   api-zod    │  │  api-client │  │    db     │ │
│  │ (OpenAPI)   │  │  (Zod gen)   │  │  (RQ gen)   │  │ (Drizzle) │ │
│  └──────┬──────┘  └──────┬───────┘  └──────┬──────┘  └─────┬─────┘ │
│         │  orval codegen  │               │               │       │
│         └─────────────────┘               │               │       │
│                           │ consumed by   │               │       │
│                    ┌──────▼──────┐  ┌─────▼─────┐         │       │
│                    │  api-server │  │ websentinel│         │       │
│                    │  (Express)  │  │  (Vite)    │         │       │
│                    └──────┬──────┘  └─────┬─────┘         │       │
│                           │   HTTP/JSON  │               │       │
│                           │◄────────────►│               │       │
│                           │              │               │       │
│  ┌──────────┐  ┌─────────┴──┐  ┌────────┴──┐  ┌─────────┘       │
│  │  bin/    │  │ passive-    │  │ scan store │  │ (not yet        │
│  │ subfinder│  │ sources.ts  │  │ localStorage│  │  connected)     │
│  │ amass    │  │ (8 APIs)    │  │             │                  │
│  │ sublist3r│  └─────────────┘  └─────────────┘                  │
│  └──────────┘                                                    │
└─────────────────────────────────────────────────────────────────────┘
```

### Package dependency graph

```
@workspace/api-spec  (OpenAPI YAML + orval config)
  │ codegen
  ├── @workspace/api-zod      → consumed by api-server (health route)
  └── @workspace/api-client-react → consumed by websentinel (declared)

@workspace/db  → consumed by api-server (declared, not yet imported)

@workspace/api-server
  ├── imports @workspace/api-zod
  ├── imports @workspace/db (declared)
  └── spawns bin/subfinder, bin/amass, sublist3r

@workspace/websentinel
  ├── imports @workspace/api-client-react (declared)
  ├── calls api-server via fetch (VITE_API_URL)
  └── generates PDFs via jsPDF (client-side, no server)
```

---

## 2. API Server Architecture

### Request lifecycle

```
HTTP Request
  │
  ▼
┌─────────────────────────────────────────────┐
│ pino-http middleware                         │
│ • attaches req.log (child logger)            │
│ • strips query strings from logged URLs       │
│ • redacts Authorization + Cookie headers     │
└──────────────────┬──────────────────────────┘
                   ▼
┌─────────────────────────────────────────────┐
│ cors() — permissive (any origin)            │
└──────────────────┬──────────────────────────┘
                   ▼
┌─────────────────────────────────────────────┐
│ express.json() + express.urlencoded()       │
│ • parses req.body                            │
└──────────────────┬──────────────────────────┘
                   ▼
┌─────────────────────────────────────────────┐
│ router mounted at /api                       │
│ • tries each sub-router in order            │
└──────────────────┬──────────────────────────┘
                   ▼
┌─────────────────────────────────────────────┐
│ Route handler                                │
│ • Zod safeParse(req.body) → 400 on invalid   │
│ • requireAuth middleware (subdomains/tls)   │
│ • business logic                             │
│ • res.json(result)                           │
└─────────────────────────────────────────────┘
```

### Route map

| Method | Path | Auth | Handler file |
|--------|------|------|-------------|
| GET | `/api/healthz` | No | `routes/health.ts` |
| POST | `/api/auth/login` | No | `routes/auth.ts` |
| POST | `/api/auth/logout` | Bearer | `routes/auth.ts` |
| GET | `/api/auth/me` | Bearer | `routes/auth.ts` |
| POST | `/api/subdomains/enumerate` | Bearer | `routes/subdomains.ts` |
| POST | `/api/tls/check` | Bearer | `routes/tls.ts` |

### Subdomain enumeration pipeline

```
POST /api/subdomains/enumerate
  │
  ├── Zod validation (domain regex, mode, wordlistSize, tools[], passiveSources[])
  │
  ├── Stage 1+2 (parallel via Promise.all):
  │   ├── runAllPassiveSources(domain)     ← lib/passive-sources.ts
  │   │   ├── crt.sh          (CT logs)
  │   │   ├── HackerTarget    (host search)
  │   │   ├── RapidDNS        (HTML scrape)
  │   │   ├── AlienVault OTX  (passive DNS)
  │   │   ├── ThreatCrowd     (threat intel)
  │   │   ├── VirusTotal       (VT_API_KEY optional)
  │   │   ├── URLScan.io       (scan history)
  │   │   └── Anubis-DB       (passive DB)
  │   │
  │   └── runAllTools(domain)             ← lib/tool-runner.ts
  │       ├── subfinder  (spawn bin/subfinder.exe -d domain -silent)
  │       ├── amass      (spawn bin/amass.exe enum -passive -d domain -json -)
  │       └── sublist3r  (spawn sublist3r -d domain -t 10 -v)
  │
  ├── Stage 3: built-in prefix guessing (14 common prefixes)
  │
  ├── Stage 4: DNS brute-force (wordlist, batches of 15)
  │
  ├── Stage 5: DNS resolve + optional HTTP probe for all found FQDNs
  │
  └── Response: { domain, totalFound, resolvedCount, sourceSummaries[], subdomains[] }
      Each subdomain entry has: fqdn, resolved, ipAddresses, source, sources[],
      httpStatus, httpsAvailable, responseTime, cnames
```

### TLS check pipeline

```
POST /api/tls/check
  │
  ├── Zod validation (host, port, checkHeaders, checkTlsVersions)
  │
  ├── Promise.allSettled (all three run in parallel):
  │   ├── getCertificate(host, port)
  │   │   └── tls.connect → getPeerCertificate → parse subject, issuer, SANs,
  │   │       validity, fingerprint, self-signed, wildcard detection
  │   │
  │   ├── getSecurityHeaders(host, port)
  │   │   ├── https.request GET / → collect response headers
  │   │   ├── parse HSTS (max-age, includeSubDomains, preload)
  │   │   └── http.request HEAD :80 → check redirect to https://
  │   │
  │   └── checkTlsVersion(host, "TLSv1" | "TLSv1.1" | "TLSv1.2" | "TLSv1.3")
  │       └── 4× tls.connect with pinned min/max version
  │
  ├── computeGrade(cert, headers, redirect, tlsSupport)
  │   └── starts at 100, deducts for: expiring cert, self-signed,
  │       deprecated TLS, missing headers, no HSTS, no redirect
  │
  ├── buildFindings(cert, headers, redirect, tlsSupport)
  │   └── translates numeric results into { severity, title, detail }[]
  │
  └── Response: { host, cert, securityHeaders[], httpsRedirect,
                  tlsSupport, overallGrade, findings[], elapsedMs }
```

### Auth architecture

```
Login flow:
  POST /api/auth/login { email, password }
    → Zod validate → DEMO_USERS lookup → plaintext compare
    → generateToken() → activeSessions.set(token, email)
    → returns { token, user (without passwordHash) }

Session rehydration:
  GET /api/auth/me (Authorization: Bearer <token>)
    → activeSessions.get(token) → email → DEMO_USERS[email]
    → returns user profile

Protected routes:
  requireAuth middleware → activeSessions.has(token) → next() or 401

State:
  DEMO_USERS    — in-memory Record<email, user> (resets on restart)
  activeSessions — in-memory Map<token, email> (shared module singleton)
```

---

## 3. Frontend Architecture

### Provider tree (outer → inner)

```
<QueryClientProvider>          TanStack React Query (server state)
  <TooltipProvider>            Radix tooltip context
    <AuthProvider>              Auth state + login/logout + token in localStorage
      <WorkspaceProvider>       Named workspaces + active workspace ID
        <ScanStoreProvider>     Scan history (localStorage, per-workspace)
          <WouterRouter>        Client-side routing
            <RoutedErrorBoundary>  Recovers on route change
              <DashboardRoutes>  Route switch
```

### Routing

```
/                → Landing (public)
/login           → Login (public)
/*               → AuthGuard → Shell → Switch:
  /overview      → Overview dashboard (charts, metrics, recent scans)
  /scans/new     → New scan launcher (target + module selection)
  /scans/:id     → Scan detail (subdomain or TLS results)
  /findings      → Findings list (all TLS findings across scans)
  /subdomains    → Subdomain enumeration tool (config + results table)
  /tls           → TLS check tool (config + rich results)
  /reports       → PDF report generator (config + generate button)
  /history       → Scan history (all records, delete, clear)
  /assets        → Asset inventory (derived from subdomain scans)
  /dom-inspector → Placeholder (not implemented)
  /settings      → Workspace settings
  /profile       → User profile + preferences
  /*             → 404 NotFound
```

### Data persistence

```
localStorage keys (per-workspace namespaced):
  ws_workspaces              → Workspace[] (all workspaces)
  ws_active_workspace         → string (active workspace ID)
  ws_scan_history             → ScanRecord[] (default workspace)
  ws_scan_history_{id}        → ScanRecord[] (per named workspace)
  ws_token                    → string (auth bearer token, global)

ScanRecord = SubdomainScanRecord | TlsScanRecord
  Each stores the raw API response in .data — no transformation.
  Findings are derived: allFindings = TLS scans → flatMap(data.findings)
  Max 50 records per workspace (FIFO).
```

### Frontend → API communication

```
Auth:     lib/auth.tsx → fetch(VITE_API_URL/api/auth/...)
Scans:    pages/subdomains.tsx → apiFetch(VITE_API_URL/api/subdomains/enumerate, token)
          pages/tls-check.tsx   → apiFetch(VITE_API_URL/api/tls/check, token)

apiFetch() helper attaches:
  Content-Type: application/json
  Authorization: Bearer <token> (if token exists)
```

### PDF report generation

```
Reports page (App.tsx)
  → user configures: sections[], targetDomain, assessor, org, classification
  → dynamic import('@/lib/report-engine')
  → generateSecurityReport(scans, allFindings, options)
  → jsPDF builds PDF client-side (no server round-trip)
  → pdf.save() triggers browser download

Report engine (lib/report-engine.ts):
  12 modular section builders, each toggleable:
  1. Cover page (classification banner)
  2. Executive summary (stat boxes + posture narrative)
  3. Subdomain enumeration (asset inventory, source breakdown)
  4. Certificate transparency (CT-sourced hostnames, wildcards)
  5. DNS analysis (IP mapping, CNAME takeover, dangling records)
  6. HTTPS/TLS assessment (cert details, version support, HSTS)
  7. Security headers (per-header status + recommendations)
  8. Findings (per-severity with IDs, impact, evidence)
  9. Risk assessment (scoring methodology, per-domain scores)
  10. Mitigation (remediation steps, teams, timelines, verification)
  11. Analytics (score trends, discovery stats, compliance rates)
  12. Appendices (execution log, tool versions, limitations)
```

---

## 4. Build & Deployment

### API server build

```
src/index.ts
  ↓ esbuild (bundle: true, format: esm, platform: node)
  ↓ esbuildPluginPino (rewrites worker thread imports)
  ↓ CJS compatibility banner (globalThis.require, __dirname, __filename)
  ↓ externals list (bcrypt, pg-native, sharp, etc. excluded from bundle)
  → dist/index.mjs (single file, ~1.4 MB)
```

### Frontend build

```
src/main.tsx
  ↓ Vite (React plugin + Tailwind plugin)
  ↓ code splitting (dynamic import for report-engine)
  → dist/public/ (static assets + index.html)
```

### Environment loading

```
API server:  node --env-file=.env --enable-source-maps ./dist/index.mjs
  .env file provides: PORT, NODE_ENV, LOG_LEVEL, DATABASE_URL?, VT_API_KEY?

Frontend:    vite (auto-loads .env)
  .env file provides: PORT, BASE_PATH, VITE_API_URL, REPL_ID?
```

---

## 5. Security Boundaries

```
                    ┌─────────────────────────────┐
                    │       Browser (client)       │
                    │                             │
  localStorage:     │  ws_token (bearer token)   │ ← XSS-accessible (prototype)
  ws_scan_history   │  scan history (per workspace)│
                    │                             │
                    └──────────┬──────────────────┘
                               │ HTTPS (production)
                               │ Authorization: Bearer <token>
                    ┌──────────▼──────────────────┐
                    │     API Server (Express)     │
                    │                             │
  In-memory:        │  activeSessions Map          │ ← token → email lookup
  In-memory:        │  DEMO_USERS record           │ ← plaintext passwords (proto)
                    │                             │
  Middleware:       │  pino-http (log redaction)   │ ← strips auth headers
  Middleware:       │  cors() (permissive)         │ ← any origin (proto)
  Validation:       │  Zod safeParse on all inputs │ ← rejects malformed JSON
  Auth:             │  requireAuth on scan routes  │ ← Bearer token check
                    └─────────────────────────────┘
```

### Current security posture (prototype)

| Control | Status | Notes |
|---------|--------|-------|
| Password hashing | ❌ Plaintext | `DEMO_USERS` stores plaintext; marked prototype-only |
| Token generation | ⚠️ `Math.random()` | Not cryptographically secure |
| Token expiry | ❌ Never expires | No TTL on `activeSessions` entries |
| Token storage | ⚠️ `localStorage` | XSS-accessible; HttpOnly cookie preferred for production |
| CORS | ⚠️ Permissive | `cors()` accepts any origin |
| Rate limiting | ❌ None | No brute-force protection on auth endpoints |
| Security headers | ❌ None on API | No CSP, HSTS, X-Frame-Options on API responses |
| Log redaction | ✅ Active | pino redacts Authorization + Cookie headers |
| Input validation | ✅ Active | Zod `safeParse()` on all route bodies |
| Domain validation | ✅ Active | RFC-compliant regex on domain/host inputs |

---

## 6. Scaling Considerations

The current architecture is single-process, in-memory. Horizontal scaling would require:

| Component | Current | Scaled |
|-----------|---------|--------|
| Session store | In-memory `Map` | Redis or signed JWT (stateless) |
| User store | In-memory `DEMO_USERS` | PostgreSQL via `@workspace/db` (Drizzle) |
| Scan history | Browser `localStorage` | API-backed, per-user scan records |
| Tool runners | Local `child_process.spawn` | Job queue (BullMQ + Redis) on worker nodes |
| Passive sources | Direct `fetch` from API process | Same — no scaling issue (I/O bound) |
| CORS | Permissive | Explicit origin allowlist |

The `@workspace/db` package (Drizzle + PostgreSQL) is already scaffolded and declared as a dependency of the API server. Connecting routes to the database is the primary production-readiness step.
