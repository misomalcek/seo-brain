'use client';

import { useRef, useState, useEffect } from 'react';
import type { Persona, AgentInfo } from '@/lib/types';
import { ActionPalette } from './ActionPalette';
import { MentionsPalette } from './MentionsPalette';
import { PersonaSelector } from './PersonaSelector';
import { ModelSelector, type ModelOption } from './ModelSelector';
import { isSTTSupported, startListening } from '@/lib/voice';

interface ChatInputProps {
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
  isToolLoading: boolean;
  currentTool: string | null;
  activePersonaId: string | null;
  onPersonaChange: (personaId: string | null) => void;
  activePersona?: Persona | null;
  activeAgent?: AgentInfo | null;
  onClearAgent?: () => void;
  onToggleSidebar?: () => void;
  onToggleTools?: () => void;
  toolsSidebarOpen?: boolean;
  contextItemCount?: number;
  backgroundMode?: boolean;
  onToggleBackground?: () => void;
  modelOverride?: ModelOption;
  onModelChange?: (model: ModelOption) => void;
  conversationMode?: boolean;
  onToggleConversationMode?: () => void;
}

export function ChatInput({
  input,
  onInputChange,
  onSubmit,
  isLoading,
  isToolLoading,
  currentTool,
  activePersonaId,
  onPersonaChange,
  activePersona,
  activeAgent,
  onClearAgent,
  onToggleSidebar,
  onToggleTools,
  toolsSidebarOpen = false,
  contextItemCount = 0,
  backgroundMode = false,
  onToggleBackground,
  modelOverride = 'default',
  onModelChange,
  conversationMode = false,
  onToggleConversationMode,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const [showActions, setShowCommands] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const busy = isLoading || isToolLoading;

  const formRef = useRef<HTMLFormElement>(null);

  const toggleMic = () => {
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
      setIsListening(false);
      return;
    }
    if (!isSTTSupported()) return;
    setIsListening(true);
    recognitionRef.current = startListening(
      (text) => {
        const newValue = input ? `${input} ${text}` : text;
        onInputChange(newValue);
        // In conversation mode, auto-submit after speech
        if (conversationMode && newValue.trim()) {
          setTimeout(() => formRef.current?.requestSubmit(), 100);
        }
      },
      () => {
        setIsListening(false);
        recognitionRef.current = null;
      }
    );
  };

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      const minHeight = window.innerWidth >= 768 ? 76 : 56;
      el.style.height = 'auto';
      el.style.height = Math.max(Math.min(el.scrollHeight, 160), minHeight) + 'px';
    }
  }, [input]);

  const handleInputChange = (value: string) => {
    onInputChange(value);
    // Actions palette: trigger on / prefix
    if (value === '/' || (value.startsWith('/') && !value.includes(' '))) {
      setShowCommands(true);
      setShowMentions(false);
    }
    // Mentions palette: trigger on @ prefix (or @ after space)
    else if (value === '@' || (value.endsWith('@') && (value.length === 1 || value[value.length - 2] === ' '))) {
      setShowMentions(true);
      setShowCommands(false);
    }
    else {
      // Keep mentions open while typing @query (no space yet)
      const atMatch = value.match(/@(\S*)$/);
      if (atMatch && showMentions) {
        // Still typing mention — keep open
      } else {
        setShowMentions(false);
      }
      if (!value.startsWith('/') || value.includes(' ')) {
        setShowCommands(false);
      }
    }
  };

  const handleCommandSelect = (commandPath: string) => {
    const normalized = commandPath.startsWith('/') ? commandPath : `/${commandPath}`;
    onInputChange(`${normalized} `);
    setShowCommands(false);
    textareaRef.current?.focus();
  };

  const handleMentionSelect = (mentionText: string) => {
    // Replace the @query with the selected mention
    const atIdx = input.lastIndexOf('@');
    const before = atIdx > 0 ? input.slice(0, atIdx) : '';
    onInputChange(`${before}${mentionText} `);
    setShowMentions(false);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      // When any palette is open, Enter is reserved for palette navigation
      if (showActions || showMentions) return;
      e.preventDefault();
      if (input.trim() && !isLoading && !isToolLoading) {
        onSubmit(e);
      }
    }
  };

  return (
    <div className="border-t border-border-subtle pt-3 pb-2 shrink-0">
      {/* Tool indicator */}
      {(currentTool || isToolLoading) && (
        <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          <span>{currentTool ? `Používam ${currentTool}...` : 'Načítavam...'}</span>
        </div>
      )}

      <form ref={formRef} onSubmit={onSubmit}>
        {/* Textarea */}
        <div className="relative mb-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Opytajte sa..."
            disabled={busy}
            maxLength={50000}
            rows={2}
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 disabled:opacity-50 transition-all duration-200 resize-none text-sm min-h-[56px] md:min-h-[76px]"
            style={activePersona ? { borderColor: `${activePersona.color}40` } : undefined}
          />
          {input.length > 40000 && (
            <div className="absolute right-3 bottom-1 text-xs text-yellow-500 dark:text-yellow-400">
              {input.length.toLocaleString()}/50 000
            </div>
          )}

          <ActionPalette
            isOpen={showActions}
            onClose={() => setShowCommands(false)}
            onSelect={handleCommandSelect}
            filter={input}
          />
          <MentionsPalette
            isOpen={showMentions}
            onClose={() => setShowMentions(false)}
            onSelect={handleMentionSelect}
            filter={input.match(/@(\S*)$/)?.[0] || '@'}
          />
        </div>

        {/* Controls row: sidebar toggle | persona/agent | spacer | send | tools toggle */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Chat sidebar toggle (left) */}
          {onToggleSidebar && (
            <button
              type="button"
              onClick={onToggleSidebar}
              className="h-10 w-10 rounded-xl flex items-center justify-center border border-border hover:bg-surface-hover text-muted-foreground hover:text-foreground transition-all cursor-pointer"
              title="Historia konverzacii"
            >
              <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
            </button>
          )}

          {/* Agent indicator or Persona selector */}
          {activeAgent ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-accent-soft border border-accent/20">
              <span className="text-base" aria-hidden="true">🤖</span>
              <span className="text-foreground font-medium hidden sm:inline truncate max-w-[120px]">{activeAgent.name}</span>
              {onClearAgent && (
                <button
                  type="button"
                  onClick={onClearAgent}
                  className="ml-1 text-muted-foreground hover:text-foreground transition-colors"
                  title="Zrusit agenta"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ) : (
            <PersonaSelector
              activePersonaId={activePersonaId}
              onSelect={onPersonaChange}
            />
          )}

          {/* Model selector */}
          {onModelChange && (
            <ModelSelector value={modelOverride} onChange={onModelChange} />
          )}

          <div className="flex-1" />

          {/* Conversation mode toggle */}
          {isSTTSupported() && onToggleConversationMode && (
            <button
              type="button"
              onClick={onToggleConversationMode}
              aria-label={conversationMode ? 'Vypnut konverzacny rezim' : 'Zapnut konverzacny rezim'}
              aria-pressed={conversationMode}
              title={conversationMode ? 'Konverzačný režim zapnutý' : 'Konverzačný režim — hovor a Brain automaticky odpovie hlasom'}
              className={`h-10 w-10 rounded-xl flex items-center justify-center border transition-all cursor-pointer shrink-0 ${
                conversationMode
                  ? 'border-green-500/50 bg-green-500/15 text-green-500'
                  : 'border-border hover:bg-surface-hover text-muted-foreground hover:text-foreground'
              }`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
              </svg>
            </button>
          )}

          {/* Mic button */}
          {isSTTSupported() && (
            <button
              type="button"
              onClick={toggleMic}
              aria-label={isListening ? 'Zastavit nahrávanie' : 'Nahrat hlasom'}
              className={`h-10 w-10 rounded-xl flex items-center justify-center border transition-all cursor-pointer shrink-0 ${
                isListening
                  ? 'border-red-500/50 bg-red-500/15 text-red-500'
                  : 'border-border hover:bg-surface-hover text-muted-foreground hover:text-foreground'
              }`}
            >
              {isListening ? (
                <span className="relative flex items-center justify-center">
                  <span className="animate-ping absolute h-4 w-4 rounded-full bg-red-500 opacity-40" />
                  <svg className="h-4 w-4 relative" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                  </svg>
                </span>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                </svg>
              )}
            </button>
          )}

          {/* Send button - wide with text */}
          <button
            type="submit"
            disabled={isLoading || isToolLoading || !input.trim()}
            aria-label="Odoslať správu"
            className="h-10 px-3 sm:px-5 rounded-xl bg-gradient-to-r from-primary to-accent flex items-center justify-center gap-2 text-white text-sm font-medium hover:shadow-glow hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none transition-all duration-200 ease-spring shadow-md"
          >
            {isLoading || isToolLoading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="hidden sm:inline">Spracujem...</span>
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                <span className="hidden sm:inline">Odoslať</span>
              </>
            )}
          </button>

          {/* Background mode toggle */}
          {onToggleBackground && (
            <button
              type="button"
              onClick={onToggleBackground}
              aria-pressed={backgroundMode}
              title={backgroundMode ? 'Background mode aktívny — klikni pre vypnutie' : 'Spustiť na pozadí — brain upozorní keď bude hotovo'}
              className={`relative h-10 rounded-xl flex items-center gap-1.5 transition-all duration-200 cursor-pointer shrink-0 ${
                backgroundMode
                  ? 'px-2.5 bg-amber-500/15 border border-amber-500/40 text-amber-600 dark:text-amber-400'
                  : 'w-10 justify-center border border-border hover:bg-surface-hover text-muted-foreground hover:text-foreground'
              }`}
            >
              {/* Pulsing sonar dot — only when active */}
              {backgroundMode && (
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-60" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                </span>
              )}
              {/* Zap / lightning icon */}
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              {/* Label — only when active */}
              {backgroundMode && (
                <span className="hidden sm:inline text-xs font-medium whitespace-nowrap">Na pozadí</span>
              )}
            </button>
          )}

          {/* Tools sidebar toggle (right) */}
          {onToggleTools && (
            <button
              type="button"
              onClick={onToggleTools}
              className={`h-10 w-10 rounded-xl flex items-center justify-center transition-all cursor-pointer relative ${
                toolsSidebarOpen
                  ? 'bg-primary-soft border border-primary/20 text-primary'
                  : 'border border-border hover:bg-surface-hover text-muted-foreground hover:text-foreground'
              }`}
              title="Nastroje"
            >
              <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              {contextItemCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                  {contextItemCount}
                </span>
              )}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
