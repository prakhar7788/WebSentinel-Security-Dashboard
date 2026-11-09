import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Shield, Mail, Lock, User, Eye, EyeOff, AlertCircle, Loader2, ArrowRight, Check } from 'lucide-react';
import { useAuth } from '@/lib/auth';

export default function Signup() {
  const [, navigate] = useLocation();
  const { signup } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ── Password strength ──────────────────────────────────────────────────────
  const strength = (() => {
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;
    return Math.min(score, 4);
  })();
  const strengthLabels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  const strengthColors = ['', '#ef4444', '#f59e0b', '#3b82f6', '#22c55e'];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim() || !email.trim() || !password.trim()) {
      setError('Please fill in all fields.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await signup(name.trim(), email.trim(), password);
      navigate('/overview');
    } catch (err: any) {
      setError(err.message ?? 'Signup failed. Please try again.');
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
            <h1 className="text-[17px] font-bold tracking-[-.03em] text-[#edf3ff]">Create your account</h1>
            <p className="mt-1 text-[11px] text-[#8493aa]">Sign up to start running security scans.</p>
          </div>

          <form onSubmit={handleSubmit} className="px-7 py-6 space-y-4">
            {/* Name */}
            <div>
              <label htmlFor="signup-name" className="mb-2 block text-[10px] font-semibold text-[#b5c0d3]">
                Full name
              </label>
              <div className={`flex items-center gap-2.5 rounded-lg border bg-[#0d1420] px-3 transition-colors ${error && !name ? 'border-red-400/40' : 'border-[#2b3850] focus-within:border-[#5e9aff]'}`}>
                <User size={14} className="shrink-0 text-[#71809a]" />
                <input
                  id="signup-name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={e => { setName(e.target.value); setError(''); }}
                  placeholder="Jane Smith"
                  className="h-11 w-full bg-transparent text-[12px] text-[#dce6f5] outline-none placeholder:text-[#546179]"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label htmlFor="signup-email" className="mb-2 block text-[10px] font-semibold text-[#b5c0d3]">
                Email address
              </label>
              <div className={`flex items-center gap-2.5 rounded-lg border bg-[#0d1420] px-3 transition-colors ${error && !email ? 'border-red-400/40' : 'border-[#2b3850] focus-within:border-[#5e9aff]'}`}>
                <Mail size={14} className="shrink-0 text-[#71809a]" />
                <input
                  id="signup-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError(''); }}
                  placeholder="you@example.com"
                  className="h-11 w-full bg-transparent text-[12px] text-[#dce6f5] outline-none placeholder:text-[#546179]"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="signup-password" className="text-[10px] font-semibold text-[#b5c0d3]">
                  Password
                </label>
                <span className="text-[8px] text-[#68758b]">Minimum 8 characters</span>
              </div>
              <div className={`flex items-center gap-2.5 rounded-lg border bg-[#0d1420] px-3 transition-colors ${error && !password ? 'border-red-400/40' : 'border-[#2b3850] focus-within:border-[#5e9aff]'}`}>
                <Lock size={14} className="shrink-0 text-[#71809a]" />
                <input
                  id="signup-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                  placeholder="••••••••"
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
              {/* Strength meter */}
              {password.length > 0 && (
                <div className="mt-2 flex items-center gap-1.5">
                  {[0, 1, 2, 3].map(i => (
                    <div
                      key={i}
                      className="h-1 flex-1 rounded-full transition-all"
                      style={{
                        background: i < strength ? strengthColors[strength] : '#273249',
                      }}
                    />
                  ))}
                  <span className="text-[8px] font-semibold" style={{ color: strengthColors[strength] || '#68758b' }}>
                    {strengthLabels[strength]}
                  </span>
                </div>
              )}
            </div>

            {/* Confirm password */}
            <div>
              <label htmlFor="signup-confirm" className="mb-2 block text-[10px] font-semibold text-[#b5c0d3]">
                Confirm password
              </label>
              <div className={`flex items-center gap-2.5 rounded-lg border bg-[#0d1420] px-3 transition-colors ${error && password !== confirmPassword ? 'border-red-400/40' : 'border-[#2b3850] focus-within:border-[#5e9aff]'}`}>
                <Lock size={14} className="shrink-0 text-[#71809a]" />
                <input
                  id="signup-confirm"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={e => { setConfirmPassword(e.target.value); setError(''); }}
                  placeholder="••••••••"
                  className="h-11 w-full bg-transparent text-[12px] text-[#dce6f5] outline-none placeholder:text-[#546179]"
                />
                {confirmPassword.length > 0 && confirmPassword === password && (
                  <Check size={14} className="shrink-0 text-emerald-400" />
                )}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-400/20 bg-red-400/[.07] px-3 py-2.5 text-[10px] text-red-300">
                <AlertCircle size={13} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-[#438cff] px-4 py-3 text-[11px] font-bold text-[#08111f] shadow-[0_6px_24px_rgba(55,129,255,.18)] transition hover:bg-[#64a1ff] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <><Loader2 size={14} className="animate-spin" /> Creating account…</>
              ) : (
                <>Create account <ArrowRight size={13} /></>
              )}
            </button>
          </form>

          {/* Sign in link */}
          <div className="border-t border-[#202a3c] bg-[#0c111c]/60 px-7 py-4">
            <p className="text-center text-[10px] text-[#6a7a93]">
              Already have an account?{' '}
              <Link href="/login" className="font-bold text-[#62a1ff] hover:text-[#80b8ff] transition-colors">
                Sign in
              </Link>
            </p>
          </div>
        </div>

        <p className="mt-5 text-center text-[9px] text-[#55637a]">
          WebSentinel Security Workspace · Prototype environment
        </p>
      </div>
    </div>
  );
}
