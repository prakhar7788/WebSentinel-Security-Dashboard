# WebSentinel — Security Dashboard

A full-stack web security dashboard for subdomain enumeration, TLS/certificate analysis, security header inspection, and PDF report generation — all from a browser interface with no terminal access required.

**Live Demo:** [web-sentinel-security-dashboard-44s.vercel.app](https://web-sentinel-security-dashboard-44s.vercel.app)

---

## Features

### Subdomain Enumeration
Aggregates results from 8 passive OSINT sources and 3 binary tools in parallel:

| Source | Type |
|--------|------|
| crt.sh | Certificate Transparency logs |
| HackerTarget | Host search API |
| RapidDNS | Passive database |
| AlienVault OTX | Passive DNS |
| ThreatCrowd | Threat intelligence |
| VirusTotal | Domain report (API key required) |
| URLScan.io | Scan history |
| Anubis-DB | Passive database |
| Subfinder | Go binary (included) |
| Amass | Go binary (included) |
| Sublist3r | Python tool |

Follows up with DNS brute-force, resolution (A/AAAA/CNAME), and optional HTTP probing for every discovered subdomain.

### TLS / Certificate Analysis
- Full certificate inspection (subject, issuer, SANs, expiry, fingerprint, wildcards)
- Security headers audit (HSTS, X-Frame-Options, CSP, X-Content-Type-Options, etc.)
- TLS version probing (1.0, 1.1, 1.2, 1.3)
- HTTP → HTTPS redirect check
- Automated grading with actionable findings

### PDF Security Report
Client-side report generation (no server round-trip) with 12 configurable sections:
Cover page, Executive summary, Subdomain enumeration, Certificate transparency, DNS analysis, HTTPS/TLS assessment, Security headers, Findings, Risk assessment, Mitigation, Analytics, Appendices.

### Additional
- JWT-based authentication with 24h token expiry
- Multi-workspace support with isolated scan history
- Scan history with per-workspace storage (max 50 records, FIFO)
- Rate limiting and account lockout on login

---

## Tech Stack

### Backend (`artifacts/api-server`)
- **Node.js 20+** + **Express v5** (ESM)
- **TypeScript** with esbuild bundler
- **Firebase Admin** + Firestore for persistence
- **bcryptjs** for password hashing
- **jsonwebtoken** (HS256) for session tokens
- **Zod** for request validation
- **pino** for structured logging
- **express-rate-limit** for brute-force protection

### Frontend (`artifacts/websentinel`)
- **React 19** + **Vite 7**
- **Tailwind CSS v4** + **shadcn/ui** (Radix UI)
- **TanStack Query** for server state
- **wouter** for routing
- **jsPDF** + **jspdf-autotable** for PDF generation
- **recharts** for charts
- **framer-motion** for animations

### Monorepo
- **pnpm workspaces** with catalog protocol
- Shared packages: `api-spec` (OpenAPI), `api-zod` (generated validators), `api-client-react` (generated hooks), `db` (Drizzle ORM)

---

## Project Structure

```
WebSentinel-Security-Dashboard/
├── artifacts/
│   ├── api-server/          # Express REST API
│   │   ├── src/
│   │   │   ├── app.ts       # Middleware stack (CORS, auth, logging)
│   │   │   ├── routes/      # auth, subdomains, tls, health, scans
│   │   │   └── lib/         # Firebase, JWT session, bcrypt, passive sources, tool runner
│   │   └── build.mjs        # esbuild bundler
│   └── websentinel/         # React frontend
│       └── src/
│           ├── pages/       # login, signup, subdomains, tls-check, profile
│           ├── components/  # 54 shadcn/ui components
│           └── lib/         # auth, report engine, scan store, workspaces
├── lib/
│   ├── api-spec/            # OpenAPI 3.1 source of truth
│   ├── api-zod/             # Generated Zod validators
│   ├── api-client-react/    # Generated React Query hooks
│   └── db/                  # Drizzle ORM schema (PostgreSQL)
├── bin/
│   ├── subfinder.exe        # Subfinder v2.17 (Go binary)
│   └── amass.exe            # Amass v5.1.3 (Go binary)
└── docs/                    # Architecture, tech stack, auth, deployment guides
```

---

## Getting Started

### Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 20.6+ |
| pnpm | 9+ |
| Python | 3.8+ (for Sublist3r) |

### Install

```bash
pnpm install --ignore-scripts
pip install sublist3r
```

### Environment Setup

Copy the example env files and fill in your values:

```bash
cp artifacts/api-server/.env.example artifacts/api-server/.env
cp artifacts/websentinel/.env.example artifacts/websentinel/.env
```

**`artifacts/api-server/.env`**

```env
PORT=3000
NODE_ENV=development
LOG_LEVEL=info

# Required — generate with: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_SECRET=your-secret-here

# Optional — Firebase persistence (uses in-memory if not set)
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

# Optional — VirusTotal passive source
VT_API_KEY=
```

**`artifacts/websentinel/.env`**

```env
PORT=5173
BASE_PATH=/
VITE_API_URL=http://localhost:3000
```

### Run

```bash
# Terminal 1 — API server
cd artifacts/api-server
pnpm run dev

# Terminal 2 — Frontend
cd artifacts/websentinel
pnpm run dev
```

Open [http://localhost:5173](http://localhost:5173) and sign up for an account.

---

## Deployment

| Service | Platform |
|---------|----------|
| API server | [Render](https://render.com) (Web Service, Node.js) |
| Frontend | [Vercel](https://vercel.com) (Static, Vite) |
| Database | Firebase Firestore |

### Render (API Server)

**Build command:**
```
pnpm install --ignore-scripts && cd artifacts/api-server && node ./build.mjs
```

**Start command:**
```
node --enable-source-maps artifacts/api-server/dist/index.mjs
```

**Environment variables to set on Render:**

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `JWT_SECRET` | generated 48-byte hex string |
| `CORS_ORIGINS` | your Vercel domain (no trailing slash) |
| `FIREBASE_PROJECT_ID` | from Firebase service account JSON |
| `FIREBASE_CLIENT_EMAIL` | from Firebase service account JSON |
| `FIREBASE_PRIVATE_KEY` | from Firebase service account JSON |
| `VT_API_KEY` | VirusTotal API key (optional) |

### Vercel (Frontend)

- **Root Directory:** `artifacts/websentinel`
- **Build Command:** `pnpm run build`
- **Output Directory:** `dist`

**Environment variables to set on Vercel:**

| Variable | Value |
|----------|-------|
| `PORT` | `5173` |
| `BASE_PATH` | `/` |
| `VITE_API_URL` | your Render service URL |

See [`docs/deployment.md`](docs/deployment.md) for the full step-by-step guide including Firebase setup.

---

## API Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/healthz` | No | Health check |
| POST | `/api/auth/login` | No | Login, returns JWT |
| POST | `/api/auth/signup` | No | Create account |
| POST | `/api/auth/logout` | Bearer | Invalidate token |
| GET | `/api/auth/me` | Bearer | Current user profile |
| POST | `/api/subdomains/enumerate` | Bearer | Run subdomain scan |
| POST | `/api/tls/check` | Bearer | Run TLS analysis |

---

## Security

- Passwords hashed with **bcrypt** (cost factor 12)
- Sessions use **signed JWTs** (HS256, 24h expiry) with server-side revocation on logout
- **Rate limiting** on auth endpoints (10 login attempts / 15 min per IP)
- **Client-side lockout** after 5 failed attempts (15 min cooldown)
- **Timing-safe** login (dummy hash comparison prevents user enumeration)
- **CORS** restricted to explicit origin allowlist
- **Security headers** on all API responses (HSTS, CSP, X-Frame-Options, etc.)
- **Zod validation** on all request bodies
- **pino** log redaction strips Authorization and Cookie headers

---

## Docs

| Document | Description |
|----------|-------------|
| [`docs/architecture.md`](docs/architecture.md) | System architecture and data flow |
| [`docs/techstack.md`](docs/techstack.md) | Full technology inventory |
| [`docs/auth-architecture.md`](docs/auth-architecture.md) | Auth flow details |
| [`docs/deployment.md`](docs/deployment.md) | Step-by-step deployment guide |
| [`docs/firebase.md`](docs/firebase.md) | Firebase setup guide |
| [`RUNNING.md`](RUNNING.md) | Local development guide |

---

## License

MIT
