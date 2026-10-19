'use client';

import type { OverlayType } from '@/hooks/useOverlays';

interface FeaturePanelProps {
  activeOverlay: OverlayType;
  onFeatureClick: (feature: OverlayType) => void;
  isAdmin?: boolean;
}

type DockColor = 'amber' | 'magenta' | 'red' | 'orange' | 'rose' | 'emerald' | 'blue' | 'teal' | 'gray';

// Icon square: tinted rounded-square bg matching Pencil design
// Each icon sits on a soft colored square — the "jewel" effect
const COLOR_CLASSES: Record<DockColor, { icon: string; iconBg: string; active: string; glow: string }> = {
  amber:   { icon: 'text-amber-600 dark:text-amber-400',   iconBg: 'bg-amber-100 dark:bg-amber-500/20',   active: 'ring-2 ring-amber-400/40',   glow: 'shadow-[0_0_24px_rgba(245,158,11,0.3)]' },
  magenta: { icon: 'text-fuchsia-600 dark:text-fuchsia-400', iconBg: 'bg-fuchsia-100 dark:bg-fuchsia-500/20', active: 'ring-2 ring-fuchsia-400/40', glow: 'shadow-[0_0_24px_rgba(217,70,239,0.3)]' },
  red:     { icon: 'text-red-500 dark:text-red-400',       iconBg: 'bg-red-100 dark:bg-red-500/20',       active: 'ring-2 ring-red-400/40',     glow: 'shadow-[0_0_24px_rgba(239,68,68,0.3)]' },
  orange:  { icon: 'text-amber-500 dark:text-amber-400',   iconBg: 'bg-amber-50 dark:bg-amber-500/15',    active: 'ring-2 ring-amber-400/40',   glow: 'shadow-[0_0_24px_rgba(249,115,22,0.3)]' },
  rose:    { icon: 'text-rose-500 dark:text-rose-400',     iconBg: 'bg-rose-100 dark:bg-rose-500/20',     active: 'ring-2 ring-rose-400/40',    glow: 'shadow-[0_0_24px_rgba(244,63,94,0.3)]' },
  emerald: { icon: 'text-emerald-600 dark:text-emerald-400', iconBg: 'bg-emerald-100 dark:bg-emerald-500/20', active: 'ring-2 ring-emerald-400/40', glow: 'shadow-[0_0_24px_rgba(16,185,129,0.3)]' },
  blue:    { icon: 'text-blue-500 dark:text-blue-400',     iconBg: 'bg-blue-100 dark:bg-blue-500/20',     active: 'ring-2 ring-blue-400/40',    glow: 'shadow-[0_0_24px_rgba(59,130,246,0.3)]' },
  teal:    { icon: 'text-teal-600 dark:text-teal-400',     iconBg: 'bg-teal-100 dark:bg-teal-500/20',     active: 'ring-2 ring-teal-400/40',    glow: 'shadow-[0_0_24px_rgba(20,184,166,0.3)]' },
  gray:    { icon: 'text-gray-500 dark:text-gray-400',     iconBg: 'bg-gray-100 dark:bg-gray-500/15',     active: 'ring-2 ring-gray-400/30',    glow: 'shadow-[0_0_20px_rgba(156,163,175,0.2)]' },
};

// Order: Chaty, Súbory, Agenti, Personas, Nápady, Content, Vektory, Tools, Hľadanie, Graf, Dáta (admin), Feedback (admin), Pamäť (admin)
const features: { id: OverlayType; label: string; color: DockColor; icon: React.ReactNode; adminOnly?: boolean }[] = [
  {
    id: 'chats', label: 'Chaty', color: 'magenta',
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" /></svg>,
  },
  {
    id: 'files', label: 'Súbory', color: 'orange',
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /></svg>,
  },
  {
    id: 'agents', label: 'Agenti', color: 'red',
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="5" y="4" width="14" height="12" rx="3" strokeLinecap="round" strokeLinejoin="round" /><circle cx="9.5" cy="10" r="1" fill="currentColor" stroke="none" /><circle cx="14.5" cy="10" r="1" fill="currentColor" stroke="none" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 16v2m-3 0h6M8 4V2m8 2V2" /></svg>,
  },
  {
    id: 'personas', label: 'Personas', color: 'magenta',
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" /></svg>,
  },
  {
    id: 'calendar', label: 'Content', color: 'emerald',
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>,
  },
  {
    id: 'vectors', label: 'Vektory', color: 'rose',
    icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 2C8 2 4 5.58 4 9c0 2.13 1.07 4.05 3 5.18V16a1 1 0 001 1h8a1 1 0 001-1v-1.82C18.93 13.05 20 11.13 20 9c0-3.42-4-7-8-7z" /><path strokeLinecap="round" strokeLinejoin="round" d="M10 20h4M9 17v1a3 3 0 006 0v-1" /></svg>,
  },
  {
    id: 'tools', label: 'Tools', color: 'orange',
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z" /></svg>,
  },
  {
    // Run U 2026-05-27: Hľadanie removed from dock — duplicate of the
    // header 🔍 button which already opens the ContextSearch overlay.
    id: 'graph', label: 'Graf', color: 'magenta',
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><circle cx="5" cy="12" r="2" /><circle cx="19" cy="5" r="2" /><circle cx="19" cy="19" r="2" /><circle cx="12" cy="8" r="2" /><path strokeLinecap="round" d="M7 12h3m2-2 5-3M14 9l3 8" /></svg>,
  },
  {
    id: 'data-viewer', label: 'Dáta', color: 'teal', adminOnly: true,
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>,
  },
  {
    // Run U 2026-05-27: Feedback removed entirely — feature didn't catch on,
    // users send feedback via email. Component + backend route also purged.
    // Run U 2026-05-27: Používatelia moved to header (top-right admin area).
    //
    // 2026-05-26: Pamäť demoted from adminOnly to user-visible — MemoryBrowser
    // gates inbox+knowledge tabs and decay/auto-activate per isAdmin internally.
    id: 'memory', label: 'Pamäť', color: 'gray',
    icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 2C9 2 6.5 4.5 6.5 7.5c0 1.5.6 2.9 1.7 3.9C6.8 12.5 6 14.2 6 16c0 2.2 1 4.1 2.5 5.3.4.3.9.2 1.2-.1.3-.4.2-.9-.1-1.2C8.5 19.1 8 17.6 8 16c0-1.6.7-3 1.8-4h4.4c1.1 1 1.8 2.4 1.8 4 0 1.6-.5 3.1-1.6 4-.3.3-.4.8-.1 1.2.3.3.8.4 1.2.1C17 20.1 18 18.2 18 16c0-1.8-.8-3.5-2.2-4.6 1.1-1 1.7-2.4 1.7-3.9C17.5 4.5 15 2 12 2z" /></svg>,
  },
];

export function FeaturePanel({ activeOverlay, onFeatureClick, isAdmin }: FeaturePanelProps) {
  const visibleFeatures = isAdmin ? features : features.filter(f => !f.adminOnly);

  return (
    <div className="shrink-0 flex justify-start sm:justify-center py-2 px-2 sm:px-0 overflow-x-auto scrollbar-none">
      <div
        className="feature-dock rounded-2xl px-1.5 py-1.5 flex items-center gap-0.5"
        role="tablist"
        aria-label="Feature panels"
      >
        {visibleFeatures.map(feature => {
          const isActive = activeOverlay === feature.id;
          const c = COLOR_CLASSES[feature.color];
          return (
            <button
              key={feature.id}
              onClick={() => onFeatureClick(feature.id)}
              className={`dock-item group ${isActive ? 'active' : ''}`}
              aria-label={feature.label}
              role="tab"
              aria-selected={isActive}
              title={feature.label}
            >
              <span className={`dock-jewel ${c.iconBg} ${c.icon} ${isActive ? `${c.active} ${c.glow}` : ''}`}>
                {feature.icon}
              </span>
              <span className={`hidden sm:inline whitespace-nowrap text-[11px] font-medium ${isActive ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'} transition-colors`}>
                {feature.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
