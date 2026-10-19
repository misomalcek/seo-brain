'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center max-w-md px-6">
        <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center mx-auto mb-6">
          <span className="text-3xl">🧠</span>
        </div>
        <h1 className="text-lg font-semibold text-foreground mb-2">Niečo sa pokazilo</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Brain narazil na chybu. Vaše dáta sú v bezpečí — skúste to znova.
        </p>
        <button
          onClick={reset}
          className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors cursor-pointer"
        >
          Skúsiť znova
        </button>
        {process.env.NODE_ENV === 'development' && error?.message && (
          <pre className="mt-6 text-[11px] text-muted-foreground text-left overflow-auto max-h-48 p-3 rounded-lg bg-surface border border-border">
            {error.message}
          </pre>
        )}
      </div>
    </div>
  );
}
