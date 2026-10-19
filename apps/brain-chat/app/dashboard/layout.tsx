'use client';

import { useAuth } from '@/lib/auth-context';
import { LoginForm } from '@/components/LoginForm';
import Link from 'next/link';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, isAuthenticated, user, logout } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary via-accent to-primary flex items-center justify-center shadow-lg shadow-primary/20 mx-auto mb-4 animate-pulse">
            <span className="text-2xl">🧠</span>
          </div>
          <p className="text-muted-foreground text-sm">Nacitavam...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginForm />;
  }

  return (
    <>
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="container mx-auto flex h-14 items-center px-4">
          <a href="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-accent" />
            <span className="font-bold text-lg">Team Brain</span>
          </a>
          <nav className="ml-6 flex gap-4 text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground transition-colors">Chat</Link>
            <span className="text-primary">Dashboard</span>
            {user?.role === 'admin' && (
              <Link href="/admin/" className="hover:text-foreground transition-colors flex items-center gap-1">
                <span className="text-xs">⚙️</span> Admin
              </Link>
            )}
          </nav>
          {user && (
            <div className="ml-auto flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <div className="text-sm font-medium text-foreground">{user.name}</div>
                <div className="text-xs text-muted-foreground">{user.role}</div>
              </div>
              <button
                onClick={logout}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
                title="Odhlasit sa"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {children}
      </main>
    </>
  );
}
