'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ margin: 0, fontFamily: 'Inter, system-ui, sans-serif', background: '#0a0e1a', color: '#e8e6f0' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', maxWidth: 400, padding: 32 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🧠</div>
            <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Niečo sa pokazilo</h1>
            <p style={{ fontSize: 14, color: '#8b8ba0', marginBottom: 24 }}>
              Brain narazil na neočakávanú chybu. Skúste obnoviť stránku.
            </p>
            <button
              onClick={reset}
              style={{
                padding: '10px 24px',
                borderRadius: 12,
                border: 'none',
                background: '#a01441',
                color: '#fff',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Skúsiť znova
            </button>
            {process.env.NODE_ENV === 'development' && error?.message && (
              <pre style={{ marginTop: 24, fontSize: 11, color: '#8b8ba0', textAlign: 'left', overflow: 'auto', maxHeight: 200 }}>
                {error.message}
              </pre>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
