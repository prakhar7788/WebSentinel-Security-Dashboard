# Firebase Setup Guide — Step by Step

Connect WebSentinel to Firebase Firestore so your users, logins, and scan history persist across server restarts. Everything below is done in the browser (Firebase Console) and a text editor — minimal terminal use.

---

## What You're Setting Up

WebSentinel currently stores everything in memory (lost when the server restarts). Connecting Firebase adds three Firestore collections:

| Collection | What it stores |
|-----------|---------------|
| `users` | User accounts with bcrypt-hashed passwords |
| `sessions` | Active login sessions (24-hour expiry) |
| `scans` | Scan history (subdomain + TLS results) |

Without Firebase: everything works, but data resets on restart.
With Firebase: data persists permanently in Google Cloud.

---

## Step 1 — Create a Firebase Project

1. Open **https://console.firebase.google.com/**
2. Click **Create a project** (or use an existing one)
3. Name it something like `websentinel-prod`
4. Google Analytics is optional — you can disable it
5. Wait for the project to be created (a few seconds)

---

## Step 2 — Enable Firestore Database

1. In the Firebase Console left sidebar, click **Build → Firestore Database**
2. Click **Create database**
3. Choose **Start in production mode** (we'll add rules in Step 6)
4. Pick a location close to your users (e.g. `us-central1` for North America)
5. Click **Enable**

You'll see an empty Firestore with no collections yet — that's fine, the app creates them automatically.

---

## Step 3 — Generate a Service Account Key

This is the most important step. You'll download a JSON file containing the credentials the API server needs.

1. In the Firebase Console, click the **gear icon** (Project Settings) next to "Project Overview"
2. Go to the **Service Accounts** tab
3. Make sure **Node.js** is selected as the admin SDK language
4. Click **Generate new private key**
5. A JSON file downloads — save it somewhere safe. It looks like this:

```json
{
  "type": "service_account",
  "project_id": "websentinel-prod",
  "private_key_id": "abc123...",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBA...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@websentinel-prod.iam.gserviceaccount.com",
  "client_id": "123456789...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  ...
}
```

> **Keep this file private.** It grants admin access to your Firebase project. Never commit it to git.

---

## Step 4 — Copy Credentials to .env

Open the file `artifacts/api-server/.env` in your text editor. Find the Firebase section (it's commented out) and replace it with your real values from the JSON file:

### What to copy from the JSON → where it goes in .env

| JSON field | .env variable |
|-----------|----------------|
| `"project_id"` | `FIREBASE_PROJECT_ID` |
| `"client_email"` | `FIREBASE_CLIENT_EMAIL` |
| `"private_key"` | `FIREBASE_PRIVATE_KEY` |
| (from project settings) | `FIREBASE_STORAGE_BUCKET` |

### Your .env should look like this

```env
PORT=3000
NODE_ENV=production
LOG_LEVEL=info

# ── Firebase ──────────────────────────────────
FIREBASE_PROJECT_ID=websentinel-prod
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@websentinel-prod.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBA...\n-----END PRIVATE KEY-----\n"
FIREBASE_STORAGE_BUCKET=websentinel-prod.appspot.com
```

### Important formatting notes

**The private key:** Copy the entire value between the quotes in the JSON, including the `-----BEGIN` and `-----END` lines. Keep the `\n` escape sequences — do NOT replace them with actual line breaks. The value in .env must be wrapped in double quotes because it contains special characters.

If your JSON has:
```
"private_key": "-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
```

Then your .env should have:
```
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
```

**The storage bucket:** This is usually `{project-id}.appspot.com`. You can find it in Firebase Console → Project Settings → General tab → "Cloud Storage" section. It's optional — the app works without it.

---

## Step 5 — Set Firestore Security Rules

The Firebase Admin SDK bypasses security rules, so we lock down all collections to prevent direct client access. All reads/writes go through your API server.

1. In Firebase Console, go to **Build → Firestore Database → Rules**
2. Replace the default rules with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{doc} {
      allow read, write: if false;
    }
    match /sessions/{doc} {
      allow read, write: if false;
    }
    match /scans/{doc} {
      allow read, write: if false;
    }
  }
}
```

3. Click **Publish**

---

## Step 6 — Restart the API Server

That's it for configuration. Now restart the API server so it picks up the new env vars:

1. Stop the API server (Ctrl+C in the terminal where it's running)
2. Start it again:

```powershell
cd "c:\Users\prakhar\Desktop\WebSentinel-Security-Dashboard\artifacts\api-server"
node --env-file=.env --enable-source-maps ./dist/index.mjs
```

You should see in the console:

```
[INFO] Firebase initialized  projectId: websentinel-prod
[INFO] Server listening  port: 3000
```

If you see `Firebase not configured — using in-memory storage`, the env vars aren't being read. Double-check the .env file formatting (especially the private key quotes and `\n` escapes).

---

## Step 7 — Verify It Works

### Check the Firestore Console

1. Go back to Firebase Console → Firestore Database → Data
2. You should see a `users` collection appear automatically with two documents:
   - `admin@websentinel.io` (the demo admin user)
   - `demo@websentinel.io` (the demo viewer user)

The server seeds these automatically on first startup when the `users` collection is empty.

### Test Login

Open your browser at `http://localhost:5173` and log in with:
- Email: `admin@websentinel.io`
- Password: `demo1234`

It should work just like before — but now the user data is coming from Firestore instead of in-memory.

### Test Scan Persistence

1. Run a subdomain or TLS scan from the frontend
2. The scan is saved to your browser's localStorage as before
3. To also save it to Firestore, call the scan save API (the frontend integration for this is a future enhancement — for now, scan data can be manually saved via the API)

---

## Step 8 — Remove Demo Users (Production)

The two demo users are seeded automatically on first run. For production, you should remove them:

1. Firebase Console → Firestore Database → Data
2. Click the `users` collection
3. Click the three dots next to each demo user document → **Delete**
4. Or leave them if you want test access

New users created via the signup page will automatically be stored in Firestore with bcrypt-hashed passwords.

---

## What Gets Stored in Firestore

### `users` collection

Each document is keyed by the lowercased email address:

```
users/
  admin@websentinel.io/
    id: "usr_abc12345"
    email: "admin@websentinel.io"
    name: "Alex Morgan"
    role: "Security Analyst"
    passwordHash: "$2a$12$xxxxx..."     ← bcrypt hash, NOT plaintext
    avatar: "AM"
    joinedAt: "Jan 2025"
    scansRun: 28
```

> Passwords are never stored as plaintext. They are hashed with bcrypt at cost factor 12, which embeds a unique salt per password. Even if someone reads your Firestore data, they cannot recover the original passwords.

### `sessions` collection

Each document is keyed by the token string:

```
sessions/
  tok_550e8400-e29b-41d4-a716-446655440000/
    email: "admin@websentinel.io"
    userId: "usr_abc12345"
    issuedAt: 1794070000000
    expiresAt: 1794156400000          ← 24 hours after issuedAt
```

Sessions are also kept in memory for fast token validation. The Firestore copy is a backup for crash recovery. Expired sessions are cleaned up lazily on read.

### `scans` collection

Each document is keyed by the scan ID:

```
scans/
  WS-1001/
    id: "WS-1001"
    type: "tls"
    domain: "example.com"
    userId: "usr_abc12345"
    scannedAt: "2026-10-29T22:00:00.000Z"
    data: { ... full scan results ... }
```

---

## Troubleshooting

### "Firebase not configured — using in-memory storage"

The server didn't find the env vars. Check:
- `.env` file is at `artifacts/api-server/.env` (not the repo root)
- All three variables are uncommented (no `#` at the start of the line)
- `FIREBASE_PRIVATE_KEY` is wrapped in double quotes
- No extra spaces around the `=` sign

### "Firebase init failed — falling back to in-memory"

The credentials are present but invalid. Check:
- `FIREBASE_PROJECT_ID` matches the project ID in Firebase Console (not the display name)
- `FIREBASE_CLIENT_EMAIL` ends with `@your-project-id.iam.gserviceaccount.com`
- `FIREBASE_PRIVATE_KEY` has `\n` escape sequences intact (not converted to actual newlines)

### Login fails after enabling Firebase

The server seeds demo users on first startup. If the seed failed, the `users` collection is empty. Check:
- The server console log for "Firestore seeded with demo users"
- Firestore Console → Data → `users` collection has documents
- If empty, restart the server (it re-seeds if the collection is empty)

### CORS errors in the browser

The API server needs to allow your frontend origin. Add this to `artifacts/api-server/.env`:

```
CORS_ORIGINS=http://localhost:5173
```

Restart the server after adding.

### Private key formatting issues

If you copied the private key and it has actual line breaks instead of `\n`, it won't work. The key must be a single line with `\n` as literal escape characters:

```
# Correct (single line with \n escapes)
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"

# Wrong (actual line breaks — will fail)
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
MIIE...
-----END PRIVATE KEY-----"
```

If your JSON file has the key as a single string with `\n` escapes, copy it exactly as-is including the surrounding quotes.

---

## Quick Checklist

- [ ] Firebase project created
- [ ] Firestore Database enabled (production mode)
- [ ] Service account key downloaded (JSON file)
- [ ] Three values copied to `artifacts/api-server/.env` (project ID, client email, private key)
- [ ] Private key wrapped in double quotes with `\n` escapes preserved
- [ ] Firestore security rules set to deny all client access
- [ ] API server restarted — shows "Firebase initialized" in logs
- [ ] `users` collection visible in Firestore Console with demo users
- [ ] Login works from the frontend
