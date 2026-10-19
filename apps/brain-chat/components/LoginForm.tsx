'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';

export function LoginForm() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(email, password);
    if (!result.success) {
      setError(result.error || 'Prihlásenie zlyhalo');
    }

    setLoading(false);
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex h-16 w-16 rounded-2xl bg-gradient-to-br from-primary via-accent to-primary items-center justify-center shadow-lg shadow-primary/20 mb-4">
            <span className="text-3xl" aria-hidden="true">🧠</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Team Brain</h1>
          <p className="text-sm text-muted-foreground mt-1">AI Knowledge Hub pre tvoj tím</p>
        </div>

        {/* Login form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
              <div>{error}</div>
              {/* Run S 2026-05-26 (qa-brain-2) — admin contact affordance,
                  replaces missing forgot-password flow. */}
              <div className="mt-1.5 text-xs text-red-300/80">
                Zabudnuté heslo? Kontaktujte admina: <a className="underline" href="mailto:msg.ai.copywriting@gmail.com">msg.ai.copywriting@gmail.com</a>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-muted-foreground mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="meno@example.com"
              required
              autoFocus
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-muted-foreground mb-1">
              Heslo
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full rounded-xl bg-primary px-6 py-3 font-semibold text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-primary/20"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Prihlasujem...
              </span>
            ) : (
              'Prihlásiť sa'
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Example Org &bull; Team Brain v{process.env.NEXT_PUBLIC_BRAIN_VERSION ?? '2.0'}
        </p>
      </div>
    </div>
  );
}
