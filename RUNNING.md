# Running WebSentinel Locally

This project is designed to run on **Replit** (Linux). Here's how to run it locally on Windows.

## Prerequisites
- Node.js 20+
- pnpm 9+ — install with: `npm install -g pnpm`

---

## Step 1 — Install dependencies

Open a terminal at the workspace root and run:

```powershell
pnpm install --ignore-scripts
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

In a **new terminal tab**, run:

```powershell
$env:PORT = "3000"
$env:NODE_ENV = "development"
Set-Location "c:\Users\prakhar\Desktop\WebSentinel-Security-Dashboard\artifacts\api-server"
node --enable-source-maps ./dist/index.mjs
```

Keep this terminal open — the server must stay running.

---

## Step 4 — Start the frontend dev server

In another **new terminal tab**, run:

```powershell
$env:PORT = "5173"
$env:BASE_PATH = "/"
$env:VITE_API_URL = "http://localhost:3000"
Set-Location "c:\Users\prakhar\Desktop\WebSentinel-Security-Dashboard\artifacts\websentinel"
pnpm run dev
```

> `PORT` and `BASE_PATH` are required by `vite.config.ts` (Replit conventions).

Then open **http://localhost:5173** in your browser.

---

## Demo credentials

| Role             | Email                    | Password   |
|------------------|--------------------------|------------|
| Security Analyst | admin@websentinel.io     | demo1234   |
| Viewer           | demo@websentinel.io      | demo       |

The login page also has quick-fill buttons for both accounts.

---

## Features

| Feature | Status |
|---------|--------|
| Login / logout | ✅ Live |
| Profile page | ✅ Live |
| Subdomain enumeration — Passive | ✅ Live (crt.sh + DNS lookup) |
| Subdomain enumeration — Active | ✅ Live (DNS brute-force) |
| TLS / certificate check | ✅ Live (real TLS connection) |
| Security headers check | ✅ Live (real HTTP request) |
| TLS 1.0/1.1/1.2/1.3 version probing | ✅ Live |
| Overview / Findings / Assets | 🟡 Sample / illustrative data |
| DOM inspector | 🟡 Placeholder (not yet implemented) |

---

## Troubleshooting

**`pnpm run dev` gives a rollup error on Windows**

The workspace excludes Windows rollup native binaries (it targets Replit/Linux). The dev server (`pnpm run dev`) should still work. If you see a rollup binary error on dev, try:

```powershell
Set-Location "c:\Users\prakhar\Desktop\WebSentinel-Security-Dashboard"
pnpm add -D @rollup/rollup-win32-x64-msvc --ignore-scripts
```

Then retry `pnpm run dev` in the websentinel directory.

**API calls fail (CORS / connection refused)**

Make sure the API server (Step 3) is running before you open the frontend. Check that `VITE_API_URL` is set to `http://localhost:3000` before starting the dev server.

**Port already in use**

Change `$env:PORT = "3001"` and `$env:VITE_API_URL = "http://localhost:3001"` to use a different port.
