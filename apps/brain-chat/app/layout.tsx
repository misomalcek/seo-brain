import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Team Brain Chat | Example Org',
  description: 'AI-powered chat interface for Team Brain',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="sk" className="overflow-x-hidden">
      <body className={`${inter.className} overflow-x-hidden`}>
        {/* Skip navigation link for keyboard/screen reader users */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-lg focus:text-sm focus:font-medium"
        >
          Preskočiť na hlavný obsah
        </a>
        <Providers>
          <main id="main-content" className="min-h-screen bg-background overflow-x-hidden">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
