# WebSentinel — Technology Stack

A complete inventory of every technology, library, and tool used across the project.

---

## Monorepo & Build

| Technology | Version | Purpose |
|------------|---------|---------|
| **pnpm** | 9+ | Package manager, workspace orchestration, catalog protocol |
| **pnpm workspaces** | — | Monorepo package linking (`workspace:*` protocol) |
| **pnpm catalog** | — | Centralised dependency version pinning across all packages |
| **TypeScript** | ~5.9.3 | Type system, strict mode, project references |
| **esbuild** | 0.28.2 | API server production bundler (ESM output) |
| **esbuild-plugin-pino** | ^2.3.3 | Bundles pino's worker-thread transports |
| **Vite** | ^7.3.2 | Frontend dev server and production bundler |
| **@vitejs/plugin-react** | ^5.0.4 | React Fast Refresh + JSX transform |
| **@tailwindcss/vite** | ^4.1.14 | Tailwind CSS v4 JIT compilation plugin |
| **prettier** | ^3.9.10 | Code formatting |

### Supply-chain security

| Setting | Value | Purpose |
|---------|-------|---------|
| `minimumReleaseAge` | 1440 min (24h) | Blocks npm packages published less than 24 hours ago |
| `minimumReleaseAgeExclude` | `@replit/*` | Trusted Replit packages exempt from the age check |
| `autoInstallPeers` | false | Prevents unexpected transitive peer installs |
| `onlyBuiltDependencies` | esbuild, @swc/core, msw, unrs-resolver | Limits which packages run install scripts |
| Platform `overrides` | `-` for non-linux-x64 | Excludes native binaries for platforms other than the target runtime |

---

## API Server (`artifacts/api-server`)

| Technology | Version | Purpose |
|------------|---------|---------|
| **Express** | ^5.3.0 | HTTP framework (Express v5, ESM) |
| **Zod** | ^3.25.76 | Request body validation via `safeParse()` |
| **pino** | ^9.14.0 | Structured JSON logger |
| **pino-http** | ^10.5.0 | Express request/response logging middleware |
| **pino-pretty** | ^13.2.0 | Human-readable log output in development |
| **cors** | ^2.8.6 | Cross-origin resource sharing middleware |
| **cookie-parser** | ^1.4.7 | Cookie parsing (declared, not yet mounted) |
| **drizzle-orm** | ^0.45.2 | PostgreSQL ORM (declared, not yet used in routes) |
| **Node.js `dns/promises`** | built-in | DNS resolution (A, AAAA, CNAME records) |
| **Node.js `tls`** | built-in | TLS certificate inspection and version probing |
| **Node.js `https`/`http`** | built-in | HTTPS/HTTP probing and security header retrieval |
| **Node.js `child_process`** | built-in | Spawns Subfinder, Amass, Sublist3r binaries |

### Build pipeline

The server is bundled with esbuild into a single ESM file (`dist/index.mjs`). A CJS compatibility banner is injected at the top of the bundle (`globalThis.require = createRequire(...)`, `__filename`, `__dirname`) because Express and several dependencies are CommonJS.

---

## Frontend (`artifacts/websentinel`)

| Technology | Version | Purpose |
|------------|---------|---------|
| **React** | 19.1.0 | UI component library |
| **wouter** | ^3.3.5 | Minimalist client-side routing (~2 KB) |
| **TanStack React Query** | ^5.90.21 | Server-state management, caching, retries |
| **Tailwind CSS** | ^4.1.14 | Utility-first CSS framework (v4, Vite plugin) |
| **shadcn/ui** | — | Component collection (Radix UI primitives + CVA) |
| **Radix UI** | ^1.1.x–^2.1.x | Accessible headless UI primitives (54 components) |
| **lucide-react** | ^0.545.0 | SVG icon set |
| **recharts** | ^2.15.2 | Charts (area, bar, line) for dashboard analytics |
| **framer-motion** | ^12.23.24 | Animation library |
| **react-hook-form** | ^7.55.0 | Form state management |
| **@hookform/resolvers** | ^3.10.0 | Zod resolver for react-hook-form |
| **class-variance-authority** | ^0.7.1 | Component variant system (CVA) |
| **clsx** | ^2.1.1 | Conditional className builder |
| **tailwind-merge** | ^3.3.1 | Tailwind class conflict resolution |
| **date-fns** | ^3.6.0 | Date formatting utilities |
| **sonner** | ^2.0.7 | Toast notifications |
| **jsPDF** | ^4.2.1 | Programmatic PDF generation |
| **jspdf-autotable** | ^5.0.9 | Table rendering plugin for jsPDF |

### Vite plugins

| Plugin | Purpose |
|--------|---------|
| `@vitejs/plugin-react` | JSX transform + Fast Refresh |
| `@tailwindcss/vite` | Tailwind CSS v4 JIT |
| `@replit/vite-plugin-runtime-error-modal` | Dev error overlay |
| `@replit/vite-plugin-cartographer` | Replit source mapping (conditional) |
| `@replit/vite-plugin-dev-banner` | Replit dev banner (conditional) |

---

## Shared Libraries (`lib/`)

| Package | Technology | Purpose |
|---------|-----------|---------|
| `@workspace/api-spec` | OpenAPI 3.1 + orval ^8.41.0 | Single source of truth for the API contract |
| `@workspace/api-zod` | Zod ^3.25.76 | Generated Zod validators from OpenAPI spec |
| `@workspace/api-client-react` | React Query + custom fetch | Generated React-Query hooks from OpenAPI spec |
| `@workspace/db` | Drizzle ORM ^0.45.2 + pg ^8.23.1 | PostgreSQL database layer (scaffolded, not yet connected) |

### Code generation flow

```
openapi.yaml (source of truth)
      ↓  pnpm codegen (orval)
      ├── @workspace/api-zod        → Zod schemas (runtime validation)
      └── @workspace/api-client-react → React-Query hooks + TypeScript types
```

Orval reads the OpenAPI spec and generates:
- **Zod schemas** consumed by the API server for response validation
- **React-Query hooks** + TypeScript interfaces consumed by the frontend
- A custom `customFetch()` wrapper that handles auth tokens, error parsing, and response-type detection

---

## Subdomain Enumeration Tools

### External binary runners (`bin/`)

| Tool | Version | Language | Installation |
|------|---------|----------|-------------|
| **Subfinder** | v2.17.0 | Go | Pre-built `bin/subfinder.exe` (30 MB) |
| **Amass** | v5.1.3 | Go | Pre-built `bin/amass.exe` (51 MB) |
| **Sublist3r** | v1.0 | Python | `pip install sublist3r` |

The tool-runner module (`lib/tool-runner.ts`) checks the `bin/` directory first, then falls back to system PATH. Each tool runs in parallel via `Promise.allSettled`. Missing binaries are silently skipped.

### Passive API sources (no binary needed)

| Source | API | Auth | Rate Limit |
|--------|-----|------|------------|
| **crt.sh** | `crt.sh/?q=%.domain&output=json` | None | None |
| **HackerTarget** | `api.hackertarget.com/hostsearch` | None | 100/day |
| **RapidDNS** | `rapiddns.io/subdomain/{domain}` (HTML scrape) | None | None |
| **AlienVault OTX** | `otx.alienvault.com/api/v1/indicators/...` | None | ~429 on burst |
| **ThreatCrowd** | `threatcrowd.org/searchApi/v2/domain/report` | None | ~1 req/10s |
| **VirusTotal** | `virustotal.com/vtapi/v2/domain/report` | `VT_API_KEY` env | 4/min, 500/day |
| **URLScan.io** | `urlscan.io/api/v1/search?q=domain:` | None | None |
| **Anubis-DB** | `jldc.me/anubis/subdomains/{domain}` | None | None |

All 8 sources run in parallel via `Promise.allSettled`. Each handles errors gracefully — a failed source returns an empty array and the pipeline continues.

---

## Environment Management

| Location | Loader | Variables |
|----------|--------|-----------|
| `artifacts/api-server/.env` | `node --env-file=.env` (Node 20.6+) | `PORT`, `NODE_ENV`, `LOG_LEVEL`, `DATABASE_URL`, `VT_API_KEY` |
| `artifacts/websentinel/.env` | Vite auto-load | `PORT`, `BASE_PATH`, `VITE_API_URL`, `REPL_ID` |

`.env` files are git-ignored. `.env.example` templates are tracked.

---

## Language & Runtime Requirements

| Requirement | Minimum | Notes |
|-------------|---------|-------|
| Node.js | 20.6+ | `--env-file` flag support required |
| pnpm | 9+ | Workspace + catalog protocol |
| Python | 3.8+ | Sublist3r dependency |
| Go | not required | Subfinder/Amass binaries pre-built |
| PostgreSQL | optional | Only if `DATABASE_URL` is set (prototype uses in-memory) |
| OS | Windows / Linux / macOS | Pre-built binaries currently Windows amd64 only |
