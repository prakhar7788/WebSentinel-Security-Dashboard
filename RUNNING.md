# Running WebSentinel Locally

This project is designed to run on **Replit** (Linux). Here's how to run it locally on Windows.

All environment variables are pre-configured in `.env` files — you no longer need to set them manually.

> **Related docs:** [`docs/techstack.md`](docs/techstack.md) · [`docs/architecture.md`](docs/architecture.md) · [`docs/codebase.md`](docs/codebase.md) · [`docs/auth-architecture.md`](docs/auth-architecture.md)

---

## Quick Start (4 commands)

```powershell
# 1. Install deps (one time)
pnpm install --ignore-scripts
pip install sublist3r

# 2. Build + start the API server (auto-loads .env)
cd "c:\Users\prakhar\Desktop\WebSentinel-Security-Dashboard\artifacts\api-server"
pnpm run dev

# 3. In a new terminal — start the frontend (Vite auto-loads .env)
cd "c:\Users\prakhar\Desktop\WebSentinel-Security-Dashboard\artifacts\websentinel"
pnpm run dev

# 4. Open http://localhost:5173 — log in with admin@websentinel.io / demo1234
```

---

## Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| Node.js | 20.6+ (needs `--env-file` support) | `node --version` |
| pnpm | 9+ | `pnpm --version` — install with `npm install -g pnpm` |
| Python | 3.8+ | `python --version` — needed for Sublist3r |

> Go is **not** required. Subfinder and Amass pre-built binaries are in `bin/`.

---

## Step 1 — Install dependencies (one time)

```powershell
# from the repo root
pnpm install --ignore-scripts
pip install sublist3r
```

> `--ignore-scripts` skips the `sh`-based preinstall check (Linux-only).

---

## Step 2 — Build the API server

```powershell
Set-Location "c:\Users\prakhar\Desktop\WebSentinel-Security-Dashboard\artifacts\api-server"
node ./build.mjs
```

---

## Step 3 — Start the API server

The server auto-loads `artifacts/api-server/.env` via `--env-file=.env`.

```powershell
Set-Location "c:\Users\prakhar\Desktop\WebSentinel-Security-Dashboard\artifacts\api-server"
node --env-file=.env --enable-source-maps ./dist/index.mjs
```

You should see:

```
[INFO]: Server listening  port: 3000
```

Keep this terminal open — the server must stay running.

> **One-liner** (build + start): `node ./build.mjs ; node --env-file=.env --enable-source-maps ./dist/index.mjs`
>
> **Or use the dev script**: `pnpm run dev` (builds then starts with env file)

---

## Step 4 — Start the frontend dev server

Vite auto-loads `artifacts/websentinel/.env`. No manual env vars needed.

```powershell
Set-Location "c:\Users\prakhar\Desktop\WebSentinel-Security-Dashboard\artifacts\websentinel"
pnpm run dev
```

Then open **http://localhost:5173** in your browser.

---

## Environment files

All configuration lives in `.env` files. They are git-ignored (never committed).
Templates are in `.env.example` — copy those if `.env` is missing.

### API server — `artifacts/api-server/.env`

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3000` | Port the Express API listens on |
| `NODE_ENV` | `development` | `development` = pretty logs, `production` = JSON logs |
| `LOG_LEVEL` | `info` | Log verbosity (trace/debug/info/warn/error) |
| `DATABASE_URL` | _(commented)_ | PostgreSQL connection string (optional — prototype uses in-memory) |
| `VT_API_KEY` | _(commented)_ | VirusTotal API key (optional — enables the VirusTotal source) |

### Frontend — `artifacts/websentinel/.env`

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `5173` | Vite dev server port |
| `BASE_PATH` | `/` | App base path (Replit convention) |
| `VITE_API_URL` | `http://localhost:3000` | API server URL (must match backend `PORT`) |
| `REPL_ID` | _(unset)_ | Replit project ID (optional — activates Replit plugins) |

### Changing ports

If you want different ports, edit the `.env` files:

1. Set `PORT=3001` in `artifacts/api-server/.env`
2. Set `PORT=5174` and `VITE_API_URL=http://localhost:3001` in `artifacts/websentinel/.env`
3. Restart both servers

---

## Demo credentials

| Role             | Email                    | Password   |
|------------------|--------------------------|------------|
| Security Analyst | admin@websentinel.io     | demo1234   |
| Viewer           | demo@websentinel.io      | demo       |

The login page has quick-fill buttons for both accounts.

---

## Features

| Feature | Status |
|---------|--------|
| Login / logout | ✅ Live |
| Profile page | ✅ Live |
| Subdomain enumeration — crt.sh | ✅ Live |
| Subdomain enumeration — HackerTarget | ✅ Live |
| Subdomain enumeration — RapidDNS | ✅ Live |
| Subdomain enumeration — AlienVault OTX | ✅ Live (rate limited on large domains) |
| Subdomain enumeration — ThreatCrowd | ✅ Live (may time out occasionally) |
| Subdomain enumeration — VirusTotal | ✅ Live (requires `VT_API_KEY` in .env) |
| Subdomain enumeration — URLScan.io | ✅ Live |
| Subdomain enumeration — Anubis-DB | ✅ Live |
| Subdomain enumeration — Subfinder | ✅ Live (`bin/subfinder.exe` included) |
| Subdomain enumeration — Amass | ✅ Live (`bin/amass.exe` included) |
| Subdomain enumeration — Sublist3r | ✅ Live (requires `pip install sublist3r`) |
| Subdomain enumeration — Active DNS | ✅ Live (DNS brute-force) |
| TLS / certificate check | ✅ Live (real TLS connection) |
| Security headers check | ✅ Live (real HTTP request) |
| TLS 1.0/1.1/1.2/1.3 version probing | ✅ Live |
| PDF Security Report | ✅ Live (jsPDF — generates comprehensive report) |
| Overview / Findings / Assets | 🟡 Sample / illustrative data |
| DOM inspector | 🟡 Placeholder (not yet implemented) |

---

## Troubleshooting

**`pnpm run dev` gives a rollup error on Windows**

```powershell
Set-Location "c:\Users\prakhar\Desktop\WebSentinel-Security-Dashboard"
pnpm add -D @rollup/rollup-win32-x64-msvc --ignore-scripts
```

Then retry `pnpm run dev` in the websentinel directory.

---

**API calls fail (CORS / connection refused)**

- Make sure the API server (Step 3) is running before you open the frontend.
- Check `VITE_API_URL` in `artifacts/websentinel/.env` matches the backend `PORT`.
- If you changed the backend port, update `VITE_API_URL` and restart the frontend.

---

**Port already in use (EADDRINUSE)**

Find and kill the process on that port:
```powershell
netstat -ano | findstr :3000
taskkill /PID <the_pid> /F
```

Or change the port in the `.env` file (see "Changing ports" above).

---

**Subfinder / Amass not found**

The binaries live in `bin/` at the repo root. Verify:
```powershell
Get-ChildItem "c:\Users\prakhar\Desktop\WebSentinel-Security-Dashboard\bin"
```
Expected: `amass.exe` (~51 MB) and `subfinder.exe` (~30 MB).

---

**Sublist3r not found**

```powershell
pip install sublist3r
sublist3r --help
```

---

**Some passive sources show errors in the source panel**

Normal — ThreatCrowd, AlienVault, and crt.sh can be slow or rate-limited.
The scan completes using whichever sources succeed. Errors are shown per-source.
