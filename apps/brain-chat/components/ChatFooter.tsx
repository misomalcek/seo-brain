'use client';

import { useRef, useEffect, useState } from 'react';
import type { Persona } from '@/lib/types';
import { isSTTSupported, startListening } from '@/lib/voice';
import { useI18n } from '@/lib/i18n';
import { ExpandedComposer } from './ExpandedComposer';

interface ChatFooterProps {
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent | React.MouseEvent) => void;
  isLoading: boolean;
  currentTool: string | null;
  // Settings
  activePersonaId: string | null;
  onPersonaChange: (id: string | null) => void;
  personas: Persona[];
  modelOverride: string;
  onModelChange: (model: string) => void;
  // Voice
  conversationMode: boolean;
  onToggleConversationMode: () => void;
  // Brain Pt. II Sprint 1 — 5-mode system
  mode?: BrainMode;
  onModeChange?: (mode: BrainMode) => void;
  // Brain Pt. II focus #1 — persona browser (replaces inline <select>)
  onOpenPersonaBrowser?: () => void;
  // Context
  contextItemCount: number;
  onToggleContext: () => void;
  // Stop streaming (handoff 2026-06-29) — wired to abortStream from useChatStream.
  onStop?: () => void;
}

// Brain Pt. II Sprint 1: orthogonal 4-mode system (Agents Rethink, 2026-04-28)
export type BrainMode = 'default' | 'extended' | 'fast' | 'confirm';

interface ModeConfig { id: BrainMode; label: string; color: string }
const MODES: ModeConfig[] = [
  { id: 'default',  label: 'Default',  color: 'slate' },
  { id: 'extended', label: 'Extended', color: 'violet' },
  { id: 'fast',     label: 'Fast',     color: 'emerald' },
  { id: 'confirm',  label: 'Confirm',  color: 'amber' },
];

// Coerce legacy mode values from localStorage to new 4-mode set
const LEGACY_MODE_MAP: Record<string, BrainMode> = {
  consult: 'default',
  plan: 'default',
  write: 'extended',
  expert: 'extended',
  batch: 'fast',
};
export function coerceBrainMode(input?: string | null): BrainMode {
  if (!input) return 'default';
  if (input === 'default' || input === 'extended' || input === 'fast' || input === 'confirm') return input;
  return LEGACY_MODE_MAP[input] ?? 'default';
}

const MODE_COLOR_CLASSES: Record<string, string> = {
  slate:   'bg-slate-500 text-white shadow-slate-500/30',
  violet:  'bg-violet-500 text-white shadow-violet-500/30',
  emerald: 'bg-emerald-500 text-white shadow-emerald-500/30',
  amber:   'bg-amber-500 text-white shadow-amber-500/30',
};

const MODELS = [
  { id: 'default', label: 'Auto' },
  { id: 'sonnet-4.6', label: 'Sonnet' },
  { id: 'opus-4.6', label: 'Opus' },
  { id: 'haiku-4.5', label: 'Haiku' },
];

export function ChatFooter({
  input, onInputChange, onSubmit, isLoading, currentTool,
  activePersonaId, onPersonaChange, personas,
  modelOverride, onModelChange,
  conversationMode, onToggleConversationMode,
  mode = 'default', onModeChange, onOpenPersonaBrowser,
  contextItemCount, onToggleContext,
  onStop,
}: ChatFooterProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Run V (2026-05-27) — expanded markdown composer (port from Factorium ComposerView).
  const [expanded, setExpanded] = useState(false);
  const { t, speech } = useI18n();

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit(e);
    }
  };

  const handleMic = () => {
    if (!isSTTSupported()) return;
    startListening(
      (text) => { if (text) onInputChange(input + (input ? ' ' : '') + text); },
      () => {},
      speech,
    );
  };

  return (
    <div className="shrink-0 pb-3 pt-1">
      <div className="max-w-3xl mx-auto px-3">
        {/* Loading indicator */}
        {isLoading && (
          <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            {currentTool ? `${t('using')} ${currentTool}...` : t('thinking')}
          </div>
        )}

        {/* Input container — dark pill style matching d2input design */}
        <div className="relative bg-foreground/[0.04] dark:bg-white/[0.06] border border-border-hover rounded-2xl overflow-hidden focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary/30 transition-all">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('message')}
            aria-label={t('messageLabel')}
            rows={1}
            disabled={isLoading}
            className="w-full bg-transparent px-4 py-3.5 pr-28 text-foreground placeholder:text-muted-foreground focus:outline-none resize-none min-h-[52px] max-h-[200px] text-[15px] disabled:opacity-50"
          />
          {/* Action icons — inside input, right side */}
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
            {/* Run V 2026-05-27 — Expand to markdown composer */}
            <button
              onClick={() => setExpanded(true)}
              className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-all cursor-pointer text-muted-foreground hover:text-foreground"
              title={t('expand')}
              aria-label={t('expand')}
              type="button"
            >
              <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              </svg>
            </button>
            {/* Paperclip (context) */}
            <button
              onClick={onToggleContext}
              className={`p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-all cursor-pointer relative ${
                contextItemCount > 0
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title={t('context')} aria-label={t('context')}
              type="button"
            >
              <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              {contextItemCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                  {contextItemCount}
                </span>
              )}
            </button>
            {/* Mic moved to controls row (after mode select) — see line below mode <select> */}
            {/* Send / Stop — crimson circle. While streaming, swap to a Stop
                square that calls abortStream (handoff 2026-06-29). The Stop
                button is always enabled during streaming — lesson from
                Miska's test: a disabled spinner does not communicate that
                the user can interrupt. */}
            {isLoading && onStop ? (
              <button
                onClick={onStop}
                className="h-11 w-11 rounded-full flex items-center justify-center transition-all cursor-pointer bg-red-500 text-white hover:bg-red-600 shadow-md shadow-red-500/40"
                title={t('stop')}
                aria-label={t('stop')}
                type="button"
              >
                <span className="block h-3.5 w-3.5 rounded-sm bg-white" />
              </button>
            ) : (
              <button
                onClick={onSubmit}
                disabled={!input.trim() || isLoading}
                className={`h-11 w-11 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                  input.trim() && !isLoading
                    ? 'bg-primary text-primary-foreground accent-glow'
                    : 'bg-muted text-muted-foreground opacity-40'
                }`}
                title={t('send')} aria-label={t('send')}
                type="button"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Controls row — pills below input, wraps on mobile */}
        <div className="flex items-center justify-between gap-2 mt-2 px-0.5 flex-wrap">
          {/* Left: model, persona, plan */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <select
              value={modelOverride}
              onChange={(e) => onModelChange(e.target.value)}
              aria-label="Model"
              className="h-8 px-2.5 bg-foreground/[0.05] dark:bg-white/[0.06] rounded-full text-xs font-medium text-foreground border-0 focus:outline-none focus:ring-1 focus:ring-primary/40 cursor-pointer"
            >
              {MODELS.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>

            {/*
              Persona pill — COMMENTED OUT 2026-04-27 per user feedback:
              duplicity with dock 🎭 Personas icon. Replaced by future "info hint" pattern
              (active persona + agent + reset link, location TBD — see LIP brain-info-hint-active-context).
              The activePersonaId state remains live — set via PersonaBrowser overlay.
            */}
            {/* {onOpenPersonaBrowser && (() => {
              const ap = activePersonaId ? personas.find(p => p.id === activePersonaId) : null;
              return (
                <button
                  type="button"
                  onClick={onOpenPersonaBrowser}
                  aria-label="Otvoriť Persona Browser"
                  title={ap ? `Aktívna persona: ${ap.nameLocalized}` : 'Vyberte personu'}
                  className="h-8 px-2.5 bg-foreground/[0.05] dark:bg-white/[0.06] rounded-full text-xs font-medium text-foreground hover:bg-foreground/[0.10] focus:outline-none focus:ring-1 focus:ring-primary/40 cursor-pointer inline-flex items-center gap-1.5"
                >
                  <span aria-hidden>{ap ? ap.icon : '🎭'}</span>
                  <span>{ap ? ap.nameLocalized : 'Neutrálny'}</span>
                </button>
              );
            })()} */}

            {/* Brain Pt. II 2026-04-27: 5-pill row → single <select> per user feedback (mobile-friendly).
                "Mode active" colored notification removed (redundant info). */}
            <select
              value={mode}
              onChange={(e) => onModeChange?.(e.target.value as BrainMode)}
              aria-label="Brain mode"
              className="h-8 px-2.5 bg-foreground/[0.05] dark:bg-white/[0.06] rounded-full text-xs font-medium text-foreground border-0 focus:outline-none focus:ring-1 focus:ring-primary/40 cursor-pointer"
            >
              {MODES.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>

            {/* Mic — moved 2026-04-28 from input bar (saved space) to controls row, after mode select.
                Always visible, less crowded input bar. Per user feedback. */}
            {isSTTSupported() && (
              <button
                onClick={handleMic}
                className="h-8 w-8 rounded-full flex items-center justify-center bg-foreground/[0.05] dark:bg-white/[0.06] text-muted-foreground hover:text-foreground hover:bg-foreground/[0.10] transition-colors cursor-pointer"
                title={t('voice')} aria-label={t('voice')}
                type="button"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                </svg>
              </button>
            )}
          </div>

          {/* Right side: active persona icon + reset (info-hint pattern step 2 partial — agent badge defer) */}
          {activePersonaId && (() => {
            const ap = personas.find(p => p.id === activePersonaId);
            if (!ap) return null;
            return (
              <div className="flex items-center gap-1.5 ml-auto" aria-label="Aktívna persona">
                <button
                  type="button"
                  onClick={onOpenPersonaBrowser}
                  title={`Aktívna persona: ${ap.nameLocalized} — klik pre zmenu`}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-base shrink-0 transition-transform hover:scale-110"
                  style={{ backgroundColor: `${ap.color}25`, border: `1.5px solid ${ap.color}`, color: ap.color }}
                >
                  <span aria-hidden>{ap.icon}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onPersonaChange(null)}
                  title={t('clearPersona')}
                  aria-label={t('clearPersona')}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/[0.08] transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            );
          })()}
        </div>
      </div>
      {/* Run V 2026-05-27 — expanded markdown composer modal */}
      {expanded && (
        <ExpandedComposer
          initial={input}
          onClose={() => setExpanded(false)}
          onApply={(text) => { onInputChange(text); setExpanded(false); }}
          onSend={(text) => {
            onInputChange(text);
            setExpanded(false);
            // Defer to next tick so the input state is committed before submit.
            setTimeout(() => onSubmit({ preventDefault() {} } as any), 0);
          }}
        />
      )}
    </div>
  );
}
