import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'wouter';
import {
  Shield, Mail, Lock, Eye, EyeOff,
  AlertCircle, Loader2, ArrowRight, Clock,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';

// ── Client-side brute-force protection ──────────────────────────────────────
// 5 failed attempts → 15-minute lockout, persisted in sessionStorage so a
// page refresh doesn't bypass it.

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS   = 15 * 60 * 1000; // 15 minutes

function getLockoutState(): { attempts: number; lockedUntil: number } {
  try {
    const raw = sessionStorage.getItem('ws_login_lockout');
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { attempts: 0, lockedUntil: 0 };
}

function saveLockoutState(state: { attempts: number; lockedUntil: number }) {
  sessionStorage.setItem('ws_login_lockout', JSON.stringify(state));
}

function clearLockoutState() {
  sessionStorage.removeItem('ws_login_lockout');
}

function formatCountdown(ms: number): string {
  const totalSecs = Math.ceil(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function Login() {
  const [, navigate] = useLocation();
  const { login } = useAuth();

  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');

  // Lockout state
  const [attemptsLeft, setAttemptsLeft]   = useState(MAX_ATTEMPTS);
  const [lockedUntil, setLockedUntil]     = useState(0);
  const [countdown, setCountdown]         = useState('');
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialise from sessionStorage on mount
  useEffect(() => {
    const state = getLockoutState();
    const remaining = state.lockedUntil - Date.now();
    if (remaining > 0) {
      setLockedUntil(state.lockedUntil);
      setAttemptsLeft(0);
    } else {
      setAttemptsLeft(MAX_ATTEMPTS - state.attempts);
    }
  }, []);

  // Countdown ticker
  useEffect(() => {
    if (lockedUntil === 0) {
      if (countdownRef.current) clearInterval(countdownRef.current);
      setCountdown('');
      return;
    }

    function tick() {
      const remaining = lockedUntil - Date.now();
      if (remaining <= 0) {
        clearLockoutState();
        setLockedUntil(0);
        setAttemptsLeft(MAX_ATTEMPTS);
        setError('');
        if (countdownRef.current) clearInterval(countdownRef.current);
      } else {
        setCountdown(formatCountdown(remaining));
      }
    }

    tick();
    countdownRef.current = setInterval(tick, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [lockedUntil]);

  const isLocked = lockedUntil > Date.now();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (isLocked) return;

    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await login(email.trim(), password);
      clearLockoutState();
      navigate('/overview');
    } catch (err: any) {
      // Record failed attempt
      const state = getLockoutState();
      const newAttempts = state.attempts + 1;

      if (newAttempts >= MAX_ATTEMPTS) {
        const until = Date.now() + LOCKOUT_MS;
        saveLockoutState({ attempts: newAttempts, lockedUntil: until });
        setLockedUntil(until);
        setAttemptsLeft(0);
        setError('');
      } else {
        saveLockoutState({ attempts: newAttempts, lockedUntil: 0 });
        setAttemptsLeft(MAX_ATTEMPTS - newAttempts);
        setError(err.message ?? 'Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-bg grid-texture min-h-[100dvh] flex items-center justify-center px-4 py-12">
      {/* Background glow */}
      <div className="pointer-events-none fixed left-1/2 top-0 h-[480px] w-[480px] -translate-x-1/2 -translate-y-1/4 rounded-full bg-blue-500/[.07] blur-[110px]" />
      <div className="pointer-events-none fixed right-0 bottom-0 h-[320px] w-[320px] rounded-full bg-violet-500/[.06] blur-[100px]" />

      <div className="relative w-full max-w-[420px] fade-up">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-300/20 bg-gradient-to-br from-blue-500/20 to-violet-500/20 text-blue-300 shadow-[0_0_40px_rgba(67,140,255,.15)]">
            <Shield size={24} />
          </div>
          <div className="text-center">
            <div className="text-[22px] font-extrabold tracking-[-.04em] text-[#edf3ff]">
              web<span className="text-[#62a1ff]">sentinel</span>
            </div>
            <div className="mono mt-1 text-[9px] uppercase tracking-[.18em] text-[#61708a]">
              security workspace
            </div>
          </div>
        </div>

        {/* Card */}
        <div className="overflow-hidden rounded-2xl border border-[#202a3c] bg-[#111827]/95 shadow-[0_24px_80px_rgba(0,0,0,.5)]">
          <div className="border-b border-[#202a3c] px-7 py-5">
            <h1 className="text-[17px] font-bold tracking-[-.03em] text-[#edf3ff]">Sign in</h1>
            <p className="mt-1 text-[11px] text-[#8493aa]">Enter your credentials to access your workspace.</p>
          </div>

          {/* Lockout banner */}
          {isLocked ? (
            <div className="px-7 py-6">
              <div className="flex flex-col items-center gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[.07] px-4 py-5 text-center">
                <Clock size={22} className="text-amber-400" />
                <div>
                  <p className="text-[13px] font-semibold text-amber-300">Account temporarily locked</p>
                  <p className="mt-1 text-[11px] text-amber-300/70">
                    Too many failed attempts. Try again in
                  </p>
                  <p className="mt-2 font-mono text-[22px] font-bold text-amber-400">{countdown}</p>
                </div>
              </div>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="px-7 py-6 space-y-4"
              autoComplete="on"
              noValidate
            >
              {/* Email */}
              <div>
                <label htmlFor="email" className="mb-2 block text-[10px] font-semibold text-[#b5c0d3]">
                  Email address
                </label>
                <div className={`flex items-center gap-2.5 rounded-lg border bg-[#0d1420] px-3 transition-colors
                  ${error && !email ? 'border-red-400/40' : 'border-[#2b3850] focus-within:border-[#5e9aff]'}`}>
                  <Mail size={14} className="shrink-0 text-[#71809a]" />
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError(''); }}
                    placeholder="you@example.com"
                    maxLength={254}
                    required
                    className="h-11 w-full bg-transparent text-[12px] text-[#dce6f5] outline-none placeholder:text-[#546179]"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="mb-2 block text-[10px] font-semibold text-[#b5c0d3]">
                  Password
                </label>
                <div className={`flex items-center gap-2.5 rounded-lg border bg-[#0d1420] px-3 transition-colors
                  ${error && !password ? 'border-red-400/40' : 'border-[#2b3850] focus-within:border-[#5e9aff]'}`}>
                  <Lock size={14} className="shrink-0 text-[#71809a]" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError(''); }}
                    placeholder="••••••••"
                    maxLength={128}
                    required
                    className="h-11 w-full bg-transparent text-[12px] text-[#dce6f5] outline-none placeholder:text-[#546179]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="shrink-0 text-[#71809a] hover:text-[#a0aec0] transition-colors"
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-400/20 bg-red-400/[.07] px-3 py-2.5 text-[10px] text-red-300">
                  <AlertCircle size={13} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Attempts warning */}
              {!error && attemptsLeft < MAX_ATTEMPTS && attemptsLeft > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/[.07] px-3 py-2.5 text-[10px] text-amber-300">
                  <AlertCircle size={13} className="mt-0.5 shrink-0" />
                  <span>
                    {attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} remaining before temporary lockout.
                  </span>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-[#438cff] px-4 py-3 text-[11px] font-bold text-[#08111f] shadow-[0_6px_24px_rgba(55,129,255,.18)] transition hover:bg-[#64a1ff] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <><Loader2 size={14} className="animate-spin" /> Signing in…</>
                ) : (
                  <>Sign in <ArrowRight size={13} /></>
                )}
              </button>
            </form>
          )}

          {/* Footer */}
          <div className="border-t border-[#202a3c] bg-[#0c111c]/60 px-7 py-4">
            <p className="text-[10px] text-[#4a5568] text-center">
              Protected by rate limiting and account lockout.
            </p>
          </div>
        </div>

        <p className="mt-5 text-center text-[9px] text-[#55637a]">
          Don't have an account?{' '}
          <Link href="/signup" className="font-bold text-[#62a1ff] hover:text-[#80b8ff] transition-colors">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
