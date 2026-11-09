import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  avatar: string;
  joinedAt: string;
  scansRun: number;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('ws_token'));
  const [loading, setLoading] = useState(true);

  // Rehydrate session on mount
  useEffect(() => {
    if (!token) { setLoading(false); return; }
    fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((u: AuthUser) => setUser(u))
      .catch(() => {
        localStorage.removeItem('ws_token');
        setToken(null);
      })
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function login(email: string, password: string) {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? 'Login failed');
    }
    const { token: tok, user: u } = await res.json();
    localStorage.setItem('ws_token', tok);
    setToken(tok);
    setUser(u);
  }

  async function signup(name: string, email: string, password: string) {
    const res = await fetch(`${API_BASE}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? 'Signup failed');
    }
    const { token: tok, user: u } = await res.json();
    localStorage.setItem('ws_token', tok);
    setToken(tok);
    setUser(u);
  }

  async function logout() {
    if (token) {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    localStorage.removeItem('ws_token');
    setToken(null);
    setUser(null);
    // Navigate to login — rely on guard in App
    window.location.href = '/login';
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, signup }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** Helper: make an authenticated fetch to the API */
export function apiFetch(path: string, token: string | null, init?: RequestInit) {
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
}
