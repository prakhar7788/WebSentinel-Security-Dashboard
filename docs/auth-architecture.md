# Authentication Architecture — Login & Signup (with Security)

> **Status:** Login is live (prototype); Signup is designed but not yet implemented. This document describes the current state, the target secure architecture, and the security controls that apply to both flows.

---

## 1. Overview

WebSentinel uses a **token-based, stateless-ish auth model** between a React SPA frontend (`artifacts/websentinel`) and an Express 5 API server (`artifacts/api-server`). The frontend holds an opaque bearer token in `localStorage` and sends it on every authenticated request.

```
┌──────────────────────────────┐        ┌────────────────────────────────┐
│  Frontend (React + wouter)   │        │  API Server (Express 5 + Zod)  │
│                              │        │                                │
│  ┌─────────┐  ┌───────────┐  │  HTTPS │  ┌────────────┐  ┌───────────┐ │
│  │ Login   │  │ Signup    │  │───────▶│  auth routes │  │ user store│ │
│  │ Page    │  │ Page (new)│  │ JSON   │  (login,     │  │ (DB +     │ │
│  └────┬────┘  └─────┬─────┘  │ Bearer │   signup,    │  │  hashing) │ │
│       │             │        │  token │   logout,    │  └───────────┘ │
│       ▼             ▼        │        │   me)       │  ┌───────────┐ │
│  ┌──────────────────────┐    │◀───────│              │  │ session   │ │
│  │ AuthProvider context │    │  user  │              │  │ store     │ │
│  │ (token + user state)  │    │  data  │              │  └───────────┘ │
│  └──────────────────────┘    │        │                                │
│                              │        │  Middleware:                    │
│  AuthGuard → protected routes│        │  • CORS (allowlist)            │
│                              │        │  • rate limiter                 │
└──────────────────────────────┘        │  • requireAuth                  │
                                        │  • pino-http logging            │
                                        └────────────────────────────────┘
```

### Tech stack
| Layer | Technology |
|-------|-----------|
| Backend framework | Express 5 (`artifacts/api-server`) |
| Validation | Zod (shared schema validation) |
| Logging | pino / pino-http |
| Frontend framework | React 18 + Vite (`artifacts/weentinel`) |
| Routing | wouter (file-level `Switch`/`Route`) |
| State | React Context (`AuthProvider`) + `localStorage` |
| HTTP | native `fetch` |
| Password hashing (target) | bcrypt or argon2 |
| Session tokens (target) | signed JWT or server-side opaque tokens |

---

## 2. Current State (Prototype)

### What exists today

**Backend — `artifacts/api-server/src/routes/auth.ts`**

Three endpoints are mounted under `/api`:

| Method & Path | Purpose |
|--------------|---------|
| `POST /api/auth/login` | Validates credentials, returns `{ token, user }` |
| `POST /api/auth/logout` | Deletes token from the in-memory session map |
| `GET /api/auth/me` | Returns the current user for a valid bearer token |

- **User store:** in-memory `DEMO_USERS` record keyed by email. Two seed accounts (`admin@websentinel.io`, `demo@websentinel.io`).
- **Password storage:** plaintext (explicitly marked "prototype only").
- **Session store:** in-memory `Map<token, email>`.
- **Token format:** `tok_<random36><timestamp36>` — opaque, non-cryptographic.
- **Input validation:** Zod `LoginSchema` (`email` + `password.min(1)`).

**Frontend — `artifacts/websentinel/src/`**

| File | Role |
|------|------|
| `pages/login.tsx` | Login form (email, password, show/hide, demo quick-fill, loading + error states) |
| `lib/auth.tsx` | `AuthProvider` context: `login()`, `logout()`, session rehydration via `/api/auth/me`, `apiFetch()` helper |
| `App.tsx` | `AuthGuard` wrapper — redirects to `/login` when no user; routes to `/login` and `/` are public |

### What does not exist yet
- **Signup endpoint** (`POST /api/auth/signup`) — not implemented.
- **Signup page** — no route or UI component.
- **Password hashing** — credentials stored and compared in plaintext.
- **Database persistence** — everything is in-memory and resets on restart.
- **Rate limiting** — no brute-force protection on login.
- **Token expiry** — tokens never expire.
- **Email verification / password reset** — not present.

---

## 3. Target Architecture

### 3.1 Components and responsibilities

```
Frontend                          Backend
─────────                         ───────
LoginPage      ──POST /signup──▶  SignupHandler
SignupPage       (email,pass,        │
                  name, role)        ▼
                                 Validate (Zod) + check uniqueness
                                   │
                                   ▼
                                 Hash password (bcrypt/argon2)
                                   │
                                   ▼
                                 Persist user → DB
                                   │
                                   ▼
                                 Issue token + create session
                                   │
                                   ▼
                                 Return { token, user }
LoginPage      ──POST /login───▶  LoginHandler
                  (email,pass)      │
                                   ▼
                                 Lookup user by email
                                   │
                                   ▼
                                 Compare hash (constant-time)
                                   │
                                   ▼
                                 Issue token + create session
                                   │
                                   ▼
                                 Return { token, user }
AnyPage  ──GET /auth/me (Bearer)▶  MeHandler → validate token → return user
AnyPage  ──POST /auth/logout────▶  LogoutHandler → invalidate token
```

### 3.2 Signup flow (new)

This is the flow that needs to be built. Design:

**Endpoint:** `POST /api/auth/signup`

**Request body (validated by Zod):**
```ts
const SignupSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),          // min 8 chars
  name: z.string().min(1).max(100),
  role: z.enum(['Security Analyst', 'Viewer']).default('Viewer'),
});
```

**Steps:**
1. Validate input with `SignupSchema.safeParse()`.
2. Normalize email to lowercase. Check the user store for an existing account with that email.
   - If found → return `409 Conflict` with a generic message ("An account with this email already exists."). Do **not** reveal whether the email is registered on the login path (see §4.7).
3. Hash the password with bcrypt (cost factor ≥ 12) or argon2id.
4. Create the user record with a generated `id` (e.g. `usr_<nanoid>`), `avatar` initials, `joinedAt`, and `scansRun: 0`.
5. Issue a token (same mechanism as login) and store the session mapping.
6. Return `201 Created` with `{ token, user }` so the frontend can log the user in immediately.

**Frontend SignupPage** (`src/pages/signup.tsx`):
- Fields: name, email, password, confirm password.
- Client-side validation: email format, password ≥ 8 chars, passwords match, password strength meter (optional).
- Show/hide password toggle (reuse the pattern from `login.tsx`).
- On success → `navigate('/overview')`.
- Link to login page for existing users.
- Error display matching the login card style.

**Route registration** in `App.tsx`:
```tsx
if (loc === '/login') return <Login />;
if (loc === '/signup') return <Signup />;   // public
```

### 3.3 Login flow (existing, to be hardened)

The current login flow stays structurally the same; the hardening is in §4.

1. Frontend `Login.handleSubmit()` posts `{ email, password }` to `POST /api/auth/login`.
2. Backend validates with `LoginSchema`, looks up the user, compares the **hash** (not plaintext), issues a token, and stores the session.
3. Frontend stores the token in `localStorage` (`ws_token`), sets the user in `AuthProvider`, and navigates to `/overview`.
4. `AuthProvider` rehydrates the session on mount by calling `GET /api/auth/me` with the stored token.

---

## 4. Security Controls

### 4.1 Password hashing

Replace the plaintext `passwordHash` field with a real hash.

- **Algorithm:** bcrypt (cost ≥ 12) or argon2id (preferred for new systems).
- **Library (Node):** `bcrypt` or `argon2`.
- **Store:** save only the hash string; never store or log the plaintext.
- **Comparison:** use the library's built-in compare (bcrypt `compare()`) which runs in constant time.

```ts
import bcrypt from 'bcrypt';
const SALT_ROUNDS = 12;

async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}
async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

### 4.2 Token management

Current tokens are opaque and non-expiring. Options for hardening:

| Option | Description | Tradeoff |
|--------|-------------|----------|
| **A. Opaque + server store (current, improved)** | Keep `activeSessions` map but add expiry and crypto-random tokens (`crypto.randomUUID()`). | Simple; requires the session store to be shared across instances for horizontal scaling. |
| **B. Signed JWT** | Stateless, self-contained, with `exp` claim. | No server lookup needed, but revocation requires a denylist. |

**Recommended minimum changes regardless of option:**
- Generate tokens with `crypto.randomUUID()` (cryptographically secure) instead of `Math.random()`.
- Add an **expiry** (e.g. 24 hours for access tokens).
- Store the issued-at time and check it on `/auth/me`.
- On logout, remove the token from the session store.

### 4.3 Token storage on the client

Currently the token lives in `localStorage` (`ws_token`). `localStorage` is accessible to any JavaScript in the page, so an XSS attack could exfiltrate it.

**Hardening options (in priority order):**
1. **HttpOnly cookie (preferred for production):** Move the token to a `Secure; HttpOnly; SameSite=Strict` cookie set by the backend. The frontend never touches the token directly, so XSS cannot steal it. Requires CSRF protection (see §4.5).
2. **Keep localStorage + strong CSP:** If staying with localStorage, enforce a strict Content-Security-Policy to mitigate XSS. Treat this as acceptable for a prototype, not production.

### 4.4 CORS hardening

`app.ts` currently calls `cors()` with no options, allowing any origin. For a security product this should be an explicit allowlist:

```ts
app.use(cors({
  origin: (origin, cb) => {
    const allowed = ['http://localhost:5173', 'https://websentinel.io'];
    if (!origin || allowed.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true,            // needed if using cookie-based tokens
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
```

### 4.5 CSRF protection (required if using cookies)

If tokens move to HttpOnly cookies, the browser sends them automatically, which opens the door to CSRF. Mitigations:
- Set `SameSite=Strict` (or `Lax`) on the auth cookie.
- Use a CSRF token (double-submit or synchronizer-token pattern) for state-changing requests.
- Reject requests with a missing or mismatched `Origin`/`Referer` header.

If staying with Bearer tokens in `localStorage`/`Authorization` header, CSRF is not a concern because the token is sent explicitly, not automatically by the browser.

### 4.6 Rate limiting and brute-force defense

Add rate limiting to the auth endpoints to prevent credential stuffing and brute force.

- **Library:** `express-rate-limit`.
- **Login:** limit by IP + email combination (e.g. 10 attempts per 15 minutes).
- **Signup:** limit by IP (e.g. 5 signups per hour).
- **Response:** return `429 Too Many Requests` with a `Retry-After` header.
- Optionally lock an account after N failed attempts and require email-based unlock.

```ts
import rateLimit from 'express-rate-limit';
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again later.' },
});
router.post('/auth/login', loginLimiter, /* handler */);
```

### 4.7 User enumeration prevention

Attackers should not be able to determine whether an email is registered.

- **Login:** return the same generic error (`Invalid email or password`) and the same response timing whether the email is unknown or the password is wrong. The current code already does this correctly.
- **Signup:** returning `409` reveals the email exists. Mitigation: either accept the tradeoff for signup (common in practice) or send a verification email and return a neutral success message, deferring the "already exists" signal to the email step.
- **Timing:** perform a dummy hash comparison when the user is not found, so the response time is similar whether the account exists or not.

### 4.8 Input validation

All auth endpoints validate with Zod before touching the data layer (current pattern is good and should extend to signup):

| Endpoint | Schema |
|----------|--------|
| `POST /auth/login` | `email`, `password.min(1)` |
| `POST /auth/signup` | `email`, `password.min(8).max(128)`, `name`, `role` |
| `GET /auth/me` | none (token in header) |
| `POST /auth/logout` | none (token in header) |

### 4.9 Session lifecycle

| Event | Action |
|-------|--------|
| Login / Signup success | Issue token, store session with expiry |
| `/auth/me` request | Validate token exists and is not expired; return user or `401` |
| Logout | Delete session entry, clear client token |
| Password change (future) | Invalidate all existing sessions for that user |
| Token expiry | Session removed; client gets `401` and redirects to login |

### 4.10 Transport security

- **HTTPS is mandatory** in production. The frontend should only talk to the API over TLS.
- Set `Strict-Transport-Security` (HSTS) header.
- The `Secure` flag on cookies is only meaningful over HTTPS.

### 4.11 Security headers

Add a helmet-style middleware for production:

| Header | Value | Purpose |
|--------|-------|---------|
| `Content-Security-Policy` | strict policy, no `unsafe-inline` | Mitigates XSS |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME sniffing |
| `X-Frame-Options` | `DENY` | Prevents clickjacking |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Forces HTTPS |
| `Referrer-Policy` | `no-referrer` or `strict-origin` | Limits referrer leakage |

### 4.12 Logging and auditing

The existing pino-http logger should be extended to record auth events without logging secrets:

- Log: login success/failure (email, IP, timestamp), signup, logout, token validation failures.
- **Never log:** passwords, token values, or password hashes.
- The pino serializers in `app.ts` already strip query strings; extend to ensure request bodies are not logged on auth routes.

---

## 5. Data Model

### User record (target)

```ts
interface User {
  id: string;            // "usr_<nanoid>"
  email: string;        // normalized to lowercase, unique
  name: string;
  role: string;          // "Security Analyst" | "Viewer" | ...
  passwordHash: string;  // bcrypt/argon2 hash — never plaintext
  avatar: string;        // initials
  joinedAt: string;
  scansRun: number;
}
```

### Session record (target, if using server-side sessions)

```ts
interface Session {
  token: string;        // crypto.randomUUID()
  userId: string;
  email: string;
  issuedAt: number;     // epoch ms
  expiresAt: number;     // issuedAt + TTL
}
```

### Persistence

The prototype uses in-memory stores. For production, replace with:
- **Users:** a `users` table via the existing Drizzle ORM setup (`@workspace/db` is already a dependency).
- **Sessions:** a `sessions` table, or use signed JWTs to avoid the lookup entirely.

---

## 6. Frontend Architecture

### 6.1 Auth context (`lib/auth.tsx`)

`AuthProvider` exposes:
- `user` — the authenticated user or `null`.
- `token` — the bearer token (or null).
- `loading` — true while rehydrating the session.
- `login(email, password)` — calls `/auth/login`, stores token, sets user.
- `logout()` — calls `/auth/logout`, clears token, redirects.
- `signup(...)` — **new:** calls `/auth/signup`, stores token, sets user.

### 6.2 Route protection (`App.tsx`)

- `/` and `/login` and `/signup` are **public**.
- All other routes are wrapped in `<AuthGuard>`, which redirects to `/login` when there is no authenticated user.

```tsx
function AuthGuard({ children }) {
  const { user, loading } = useAuth();
  const [loc] = useLocation();
  if (loading) return <SplashLoader />;
  if (!user) { window.location.replace('/login'); return null; }
  return <>{children}</>;
}
```

### 6.3 Signup page (new)

`src/pages/signup.tsx` — mirrors the login card structure:
- Brand header (Shield + "websentinel").
- Card with title "Create your account".
- Fields: name, email, password (with show/hide), confirm password.
- Password strength indicator (optional).
- Submit button with loading state.
- Error display.
- Footer link: "Already have an account? Sign in".
- On success, `AuthProvider.signup()` stores the token and the router navigates to `/overview`.

---

## 7. File Map

### Existing files (login)

| File | What it does |
|------|--------------|
| `api-server/src/routes/auth.ts` | login, logout, `/me` endpoints |
| `api-server/src/app.ts` | Express app, CORS, JSON parsing, pino logging |
| `websentinel/src/pages/login.tsx` | Login form UI |
| `websentinel/src/lib/auth.tsx` | `AuthProvider`, `useAuth`, `apiFetch` |
| `websentinel/src/App.tsx` | Routing + `AuthGuard` |

### Files to add/change (signup + security)

| File | Change |
|------|-------|
| `api-server/src/routes/auth.ts` | Add `POST /auth/signup` route; switch to hashed passwords; add expiry |
| `api-server/src/app.ts` | Tighten CORS allowlist; add rate limiter + helmet headers |
| `api-server/src/lib/password.ts` | **New:** `hashPassword()` / `verifyPassword()` helpers |
| `api-server/src/lib/session.ts` | **New:** token generation + session store with expiry |
| `websentinel/src/pages/signup.tsx` | **New:** Signup form |
| `websentinel/src/lib/auth.tsx` | Add `signup()` to context; optional cookie support |
| `websentinel/src/App.tsx` | Register `/signup` as a public route |

---

## 8. Security Checklist

- [ ] Passwords hashed (bcrypt ≥ 12 / argon2id), never stored plaintext
- [ ] Tokens generated with `crypto.randomUUID()`, not `Math.random()`
- [ ] Tokens have an expiry and are checked on every request
- [ ] Rate limiting on login and signup endpoints
- [ ] CORS restricted to known origins
- [ ] Same generic error on login failure (no user enumeration)
- [ ] Constant-time password comparison (use library compare)
- [ ] Zod validation on all auth request bodies
- [ ] Security headers (CSP, HSTS, X-Frame-Options, nosniff)
- [ ] HTTPS enforced in production
- [ ] No secrets/passwords/tokens written to logs
- [ ] Logout invalidates the server-side session
- [ ] Signup page validates password strength and email format

---

## 9. Notes and Tradeoffs

- The current in-memory design resets on every server restart. Moving users/sessions to the existing Drizzle ORM + `@workspace/db` package is the natural next step before production.
- Moving tokens from `localStorage` to HttpOnly cookies is the single biggest XSS-mitigation win, but it introduces CSRF concerns that need the controls in §4.5. For a prototype, localStorage + a strict CSP is a reasonable interim.
- Argon2id is preferred over bcrypt for new systems per current OWASP guidance, but bcrypt remains widely supported and acceptable.
- This document describes the architecture; implementation tasks (building the signup endpoint and page, adding hashing, rate limiting, etc.) are separate work items.
