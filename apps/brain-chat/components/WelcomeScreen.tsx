'use client';

import { useAuth } from '@/lib/auth-context';
import type { ConversationSummary } from '@/lib/api';

interface WelcomeScreenProps {
  onSendMessage: (message: string) => void;
  onOpenHelp?: () => void;
  conversations?: ConversationSummary[];
  onSelectConversation?: (id: string) => void;
}

const PROMPT_CARDS: { category: string; catColor: string; label: string; prompt: string; desc: string }[] = [
  { category: 'SEO', catColor: 'bg-emerald-500', label: 'Kompletný SEO health check', prompt: 'Kompletný SEO health check pre example.com', desc: 'Audit, analýza a odporúčania' },
  { category: 'Content', catColor: 'bg-purple-500', label: 'Obsahová stratégia', prompt: 'Navrhni content plán na ďalší mesiac', desc: 'Kalendár, clustre a brief' },
  { category: 'Analytics', catColor: 'bg-blue-500', label: 'GSC + Ahrefs dáta', prompt: 'Aké sú naše top keywords za posledný mesiac?', desc: 'Performance report' },
  { category: 'Článok', catColor: 'bg-amber-500', label: 'SEO brief s keyword research', prompt: 'Vytvor brief pre nový článok od nuly', desc: 'Nový článok od nuly' },
];

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Dobré ráno';
  if (h < 18) return 'Dobrý deň';
  return 'Dobrý večer';
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `Pred ${mins || 1} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Pred ${hours}h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'Včera' : `Pred ${days} dňami`;
}

export function WelcomeScreen({
  onSendMessage,
  conversations = [],
  onSelectConversation,
}: WelcomeScreenProps) {
  const { user } = useAuth();
  const recentConversations = conversations.slice(0, 3);
  const firstName = user?.name?.split(' ')[0] || '';

  return (
    <div className="flex flex-col items-center justify-center flex-1 text-center px-4 py-8 max-w-lg mx-auto w-full">
      {/* Brain icon */}
      <div className="mb-5">
        <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center accent-glow">
          <span className="text-3xl">🧠</span>
        </div>
      </div>

      {/* Greeting */}
      <h1 className="text-[22px] font-semibold text-foreground tracking-tight mb-1">
        {getGreeting()}{firstName ? `, ${firstName}` : ''}
      </h1>
      <p className="text-sm text-muted-foreground mb-8">
        Ako ti dnes môžem pomôcť?
      </p>

      {/* Prompt cards REMOVED 2026-04-27 per user feedback — clean focused welcome.
          PROMPT_CARDS const kept (unused but available for future BIMP-v1.9A WAVE A2+ Capability Index UX). */}

      {/* Recent conversations — header + 'Zobraziť všetky' link removed 2026-04-28 per user feedback
          (Chaty dock icon serves the 'show all' purpose). Conv text bumped xs→sm for readability. */}
      {recentConversations.length > 0 && onSelectConversation && (
        <div className="w-full">
          <div className="space-y-0.5">
            {recentConversations.map(conv => (
              <button
                key={conv.id}
                onClick={() => onSelectConversation(conv.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-hover transition-colors cursor-pointer text-left group"
              >
                <svg className="h-4 w-4 text-muted-foreground/40 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <div className="min-w-0 flex-1">
                  <span className="text-sm text-foreground truncate block">{conv.title || 'Bez názvu'}</span>
                </div>
                <span className="text-[10px] text-muted-foreground/60 shrink-0">
                  {conv.updated_at ? timeAgo(conv.updated_at) : ''}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
