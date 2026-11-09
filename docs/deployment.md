# WebSentinel ΓÇö Deployment Guide

Deploy the API server to **Render** and the frontend to **Vercel** ΓÇö both free tiers, no credit card required, no terminal needed.

> **Architecture:** Render runs the Express API server. Vercel serves the React frontend as static files. Both connect to Firebase Firestore for persistence.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Before You Deploy ΓÇö One-Time Setup](#2-before-you-deploy--one-time-setup)
3. [Deploy the API Server to Render](#3-deploy-the-api-server-to-render)
4. [Deploy the Frontend to Vercel](#4-deploy-the-frontend-to-vercel)
5. [Connect Frontend to API](#5-connect-frontend-to-api)
6. [Environment Variables Reference](#6-environment-variables-reference)
7. [Firebase Setup](#7-firebase-setup)
8. [Production Security Checklist](#8-production-security-checklist)
9. [Post-Deployment Verification](#9-post-deployment-verification)
10. [Troubleshooting](#10-troubleshooting)
11. [Quick Reference](#11-quick-reference)

---

## 1. Prerequisites

| What | Where to get it |
|------|----------------|
| GitHub account | https://github.com |
| Render account | https://render.com ΓÇö sign up with GitHub |
| Vercel account | https://vercel.com ΓÇö sign up with GitHub |
| Firebase project | https://console.firebase.google.com (optional but recommended) |
| The repo pushed to GitHub | See below |

### Push the repo to GitHub

If it's not on GitHub yet, create a new repository and push:

```powershell
cd "c:\Users\prakhar\Desktop\WebSentinel-Security-Dashboard"
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/websentinel.git
git push -u origin main
```

> Make sure `.env` files are **not** committed ΓÇö they're already in `.gitignore`.

---

## 2. Before You Deploy ΓÇö One-Time Setup

### 2.1 Add a render.yaml (Render config)

Create this file at the repo root so Render knows how to build and run the API server:
<br>

**File: `render.yaml`** (create at repo root)

```yaml
services:
  - type: web
    name: websentinel-api
    runtime: node
    rootDir: .
    buildCommand: pnpm install --ignore-scripts && cd artifacts/api-server && node ./build.mjs
    startCommand: node --enable-source-maps artifacts/api-server/dist/index.mjs
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: "3000"
      - key: LOG_LEVEL
        value: info
```

Render will ask you to fill in the secret env vars (Firebase, VirusTotal) through its dashboard ΓÇö don't put them in this file.

### 2.2 Add a vercel.json (Vercel config)

Create this file at the repo root so Vercel builds the frontend correctly:

**File: `vercel.json`** (create at repo root)

```json
{
  "buildCommand": "pnpm install --ignore-scripts && cd artifacts/websentinel && pnpm run build",
  "outputDirectory": "artifacts/websentinel/dist/public",
  "framework": null,
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

The `rewrites` rule makes client-side routing work ΓÇö all paths serve `index.html` and wouter handles the route in the browser.

### 2.3 Commit and push both files

```powershell
git add render.yaml vercel.json
git commit -m "Add Render and Vercel deployment config"
git push
```

---

## 3. Deploy the API Server to Render

### Step 1 ΓÇö Create a new Web Service

1. Go to **https://dashboard.render.com**
2. Click **New +** ΓåÆ **Web Service**
3. Click **Connect a repository** ΓåÆ select your GitHub repo
4. Click **Connect**

### Step 2 ΓÇö Configure the service

Render should auto-detect most settings from `render.yaml`. Verify:

| Setting | Value |
|---------|-------|
| Name | `websentinel-api` |
| Region | Pick closest to you |
| Branch | `main` |
| Runtime | `Node` |
| Build Command | `pnpm install --ignore-scripts && cd artifacts/api-server && node ./build.mjs` |
| Start Command | `node --enable-source-maps artifacts/api-server/dist/index.mjs` |
| Instance Type | **Free** |

### Step 3 ΓÇö Add environment variables

Scroll down to the **Environment** section. Add each variable individually using the **Add Environment Variable** button:

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `LOG_LEVEL` | `info` |
| `CORS_ORIGINS` | *(leave blank for now ΓÇö fill in after Vercel deploy)* |
| `FIREBASE_PROJECT_ID` | your Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | your Firebase client email |
| `FIREBASE_PRIVATE_KEY` | your Firebase private key (the full `-----BEGIN...-----END-----` string) |
| `VT_API_KEY` | your VirusTotal API key (optional) |

> **For `FIREBASE_PRIVATE_KEY`:** paste the full key value from your JSON file. Render's env var editor handles multi-line values correctly ΓÇö paste the whole string including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`.

### Step 4 ΓÇö Deploy

Click **Create Web Service**. Render will:
1. Clone your repo
2. Run the build command (~2 minutes)
3. Start the server

Watch the **Logs** tab. When you see:
```
Firebase initialized  projectId: websentinel-prod
Server listening  port: 3000
```
your API is live.

### Step 5 ΓÇö Copy your API URL

Render gives you a URL like:
```
https://websentinel-api.onrender.com
```

Copy this ΓÇö you'll need it in the next section.

> **Free tier note:** Render free web services spin down after 15 minutes of inactivity and take ~30 seconds to cold start on the first request. Upgrade to the Starter plan ($7/month) to keep it always on.

---

## 4. Deploy the Frontend to Vercel

### Step 1 ΓÇö Import the project

1. Go to **https://vercel.com/new**
2. Click **Import Git Repository**
3. Select your GitHub repo ΓåÆ click **Import**

### Step 2 ΓÇö Configure the project

Vercel will detect the `vercel.json` automatically. On the configuration screen:

| Setting | Value |
|---------|-------|
| Project Name | `websentinel` |
| Framework Preset | **Other** (not Next.js, not Vite ΓÇö our vercel.json handles it) |
| Root Directory | `.` (leave as repo root) |
| Build Command | *(auto-filled from vercel.json)* |
| Output Directory | *(auto-filled from vercel.json)* |

### Step 3 ΓÇö Add environment variables

Click **Environment Variables** and add:

| Key | Value |
|-----|-------|
| `PORT` | `5173` |
| `BASE_PATH` | `/` |
| `VITE_API_URL` | `https://websentinel-api.onrender.com` ΓåÉ your Render URL from Step 3.5 |

> `VITE_API_URL` is **baked into the frontend bundle at build time**. If you change the API URL later, you must redeploy the frontend.

### Step 4 ΓÇö Deploy

Click **Deploy**. Vercel will:
1. Run the build command (~1ΓÇô2 minutes)
2. Upload the static files to their CDN

When the build finishes you'll get a URL like:
```
https://websentinel.vercel.app
```

Open it in your browser. The frontend is live.

---

## 5. Connect Frontend to API

### Update CORS on Render

Now that you have your Vercel URL, go back to Render and add the CORS origin:

1. Render dashboard ΓåÆ **websentinel-api** ΓåÆ **Environment**
2. Find `CORS_ORIGINS` (which you left blank) ΓåÆ click Edit
3. Set the value to your Vercel URL:
   ```
   https://websentinel.vercel.app
   ```
4. Click **Save Changes** ΓÇö Render redeploys automatically

### Verify the connection

1. Open your Vercel URL in the browser
2. Log in with `admin@websentinel.io` / `demo1234`
3. You should reach the Overview dashboard

If login fails with a network error, check that `VITE_API_URL` in Vercel matches your Render URL exactly (no trailing slash).

---

## 6. Environment Variables Reference

### API server (set in Render dashboard)

| Variable | Required | Value |
|----------|----------|-------|
| `NODE_ENV` | Yes | `production` |
| `PORT` | Yes | `3000` |
| `LOG_LEVEL` | No | `info` |
| `CORS_ORIGINS` | Yes | Your Vercel URL, e.g. `https://websentinel.vercel.app` |
| `FIREBASE_PROJECT_ID` | No* | e.g. `websentinel-prod` |
| `FIREBASE_CLIENT_EMAIL` | No* | e.g. `firebase-adminsdk-xxx@websentinel-prod.iam.gserviceaccount.com` |
| `FIREBASE_PRIVATE_KEY` | No* | Full `-----BEGIN PRIVATE KEY-----...` string |
| `VT_API_KEY` | No | VirusTotal API key |

*Without Firebase the app uses in-memory storage (resets on each Render deploy).

### Frontend (set in Vercel dashboard)

| Variable | Required | Value |
|----------|----------|-------|
| `PORT` | Yes | `5173` |
| `BASE_PATH` | Yes | `/` |
| `VITE_API_URL` | Yes | Your Render URL, e.g. `https://websentinel-api.onrender.com` |

---

## 7. Firebase Setup

See [`docs/firebase.md`](firebase.md) for the full Firebase setup guide.

The short version for production:

1. Create a Firebase project ΓåÆ enable Firestore Database
2. Project Settings ΓåÆ Service Accounts ΓåÆ **Generate New Private Key**
3. Add the three values to Render's env vars:
   - `FIREBASE_PROJECT_ID` = `project_id` from the JSON
   - `FIREBASE_CLIENT_EMAIL` = `client_email` from the JSON
   - `FIREBASE_PRIVATE_KEY` = `private_key` from the JSON
4. Render redeploys automatically ΓÇö watch the logs for `Firebase initialized`

---

## 8. Production Security Checklist

- [ ] `NODE_ENV=production` set in Render
- [ ] `CORS_ORIGINS` set to your Vercel URL only (no wildcards)
- [ ] Firebase private key stored only in Render env vars (not in code or `.env` file in git)
- [ ] Demo users removed from Firestore once you have real user accounts
- [ ] `VT_API_KEY` added if you want VirusTotal subdomain data
- [ ] HTTPS is automatic on both Render and Vercel (no extra setup needed)
- [ ] HSTS header is set automatically when `NODE_ENV=production`

---

## 9. Post-Deployment Verification

Replace `websentinel-api.onrender.com` with your actual Render URL.

### Health check
```bash
curl https://websentinel-api.onrender.com/api/healthz
# Expected: {"status":"ok"}
```

### Login test
```bash
curl -X POST https://websentinel-api.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@websentinel.io","password":"demo1234"}'
# Expected: {"token":"tok_...","user":{...}}
```

### Security headers
```bash
curl -I https://websentinel-api.onrender.com/api/healthz
# Should include:
# X-Frame-Options: DENY
# X-Content-Type-Options: nosniff
# Strict-Transport-Security: max-age=31536000; includeSubDomains
```

### CORS
```bash
curl -I -X OPTIONS https://websentinel-api.onrender.com/api/auth/login \
  -H "Origin: https://websentinel.vercel.app"
# Expected: Access-Control-Allow-Origin: https://websentinel.vercel.app
```

---

## 10. Troubleshooting

### "Failed to fetch" or network error in the browser

The Vercel frontend can't reach the Render API. Check:
- `VITE_API_URL` in Vercel matches your Render URL exactly
- `CORS_ORIGINS` in Render matches your Vercel URL exactly
- The Render service is running (not spun down ΓÇö may take 30s to wake up on free tier)

### Render build fails

Check the Render build logs. Common causes:
- **pnpm not found:** add `NPM_CONFIG_USERCONFIG=/tmp/.npmrc` env var, or change the build command to start with `npm install -g pnpm &&`
- **Missing env vars:** the build itself doesn't need Firebase vars ΓÇö those are only needed at runtime
- **TypeScript errors:** run `pnpm run typecheck` locally first to catch them before pushing

### Vercel build fails

Check the Vercel build logs. Common causes:
- **`PORT` not set:** make sure `PORT=5173` is in Vercel's env vars under the Production environment
- **`BASE_PATH` not set:** add `BASE_PATH=/`
- **`VITE_API_URL` not set:** without this Vite throws an error at build time

### Firebase PERMISSION_DENIED on Render

The service account needs Firestore write access. Go to:
**Google Cloud Console ΓåÆ IAM ΓåÆ find the firebase-adminsdk service account ΓåÆ add role: Cloud Datastore User**

### App loads but login fails after deploying

The most common cause is `VITE_API_URL` pointing to the wrong URL. It's baked into the bundle ΓÇö after fixing the env var in Vercel you must **redeploy** the frontend (Vercel dashboard ΓåÆ Deployments ΓåÆ Redeploy).

### Render free tier cold starts

The free tier spins down after 15 minutes of no traffic. The first request after inactivity takes ~30 seconds. This is normal. If it's a problem, upgrade to the Render Starter plan ($7/month) which keeps the service always on.

---

## 11. Quick Reference

| What | Where |
|------|-------|
| API server logs | Render dashboard ΓåÆ websentinel-api ΓåÆ Logs |
| API env vars | Render dashboard ΓåÆ websentinel-api ΓåÆ Environment |
| Frontend env vars | Vercel dashboard ΓåÆ websentinel ΓåÆ Settings ΓåÆ Environment Variables |
| Redeploy API | Render auto-deploys on every `git push` to `main` |
| Redeploy frontend | Vercel auto-deploys on every `git push` to `main` |
| API URL | Render dashboard ΓåÆ websentinel-api (shown at top) |
| Frontend URL | Vercel dashboard ΓåÆ websentinel (shown at top) |
| Run tests locally | `cd artifacts/api-server && npx vitest run` |
| Build locally | `pnpm run build` from repo root |
.