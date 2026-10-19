'use client';

import { useRef, useEffect, useState } from 'react';
import type { Message, Persona } from '@/lib/types';
import { TOOL_BADGES } from '@/lib/constants';
import { isTTSSupported, speak, stopSpeaking, isSpeaking } from '@/lib/voice';

const AGENT_COLORS: Record<string, string> = {
  purple: '#8b5cf6', red: '#ef4444', pink: '#ec4899',
  blue: '#3b82f6', orange: '#f97316', green: '#22c55e',
  cyan: '#06b6d4', yellow: '#eab308', gray: '#6b7280',
};

import { MessageContent } from './MessageContent';
import { ToolResultDisplay } from './ToolResultDisplay';
import { PersonaBadge } from './PersonaBadge';
import { SmartSaveButton } from './SmartSaveButton';
function CopyMessageButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="p-1.5 rounded hover:bg-surface-hover text-muted-foreground hover:text-foreground text-xs cursor-pointer transition-colors"
      title="Kopirovat"
    >
      {copied ? '✓' : '📋'}
    </button>
  );
}

function SpeakButton({ text }: { text: string }) {
  const [speaking, setSpeaking] = useState(false);
  if (!isTTSSupported()) return null;
  const handleSpeak = () => {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
    } else {
      setSpeaking(true);
      speak(text, () => setSpeaking(false));
    }
  };
  return (
    <button
      onClick={handleSpeak}
      className={`p-1.5 rounded hover:bg-surface-hover text-xs cursor-pointer transition-colors ${
        speaking ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
      }`}
      title={speaking ? 'Zastavit' : 'Prehrat'}
      aria-label={speaking ? 'Zastavit prehravanie' : 'Prehrat spravu'}
    >
      {speaking ? '⏹️' : '🔊'}
    </button>
  );
}

// Compact mode progress indicator (display-only, stream continues live)
function SilentModeIndicator({ content, onExpand }: { content: string; onExpand: () => void }) {
  // Rough progress: estimate based on content length (typical response ~2000-8000 chars)
  const len = content.length;
  const progress = Math.min(Math.round((len / 4000) * 100), 95);

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 bg-surface border border-border rounded-2xl rounded-bl-sm shadow-xs cursor-pointer hover:border-primary/30 transition-colors"
      onClick={onExpand}
    >
      <div className="relative h-8 w-8 shrink-0">
        <svg className="h-8 w-8 -rotate-90" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-border" />
          <circle
            cx="18" cy="18" r="14" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeDasharray={`${progress * 0.88} 88`}
            strokeLinecap="round"
            className="text-primary transition-all duration-300"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-primary">{progress}%</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-foreground">Brain pracuje...</div>
        <div className="text-[10px] text-muted-foreground truncate">
          {len > 100 ? content.slice(content.length - 80).replace(/\n/g, ' ').trim() + '...' : 'Generujem odpoved'}
        </div>
      </div>
      <button className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors" title="Zobrazit odpoved">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
        </svg>
      </button>
    </div>
  );
}

// #13 (2026-04-29): Streaming status row — gulicka + dynamic status + Compact button
// in ONE row, replacing separate floating Compact-mode row. Saves vertical space +
// gives Brain a 'fun status' (like Claude Code's enchanting/deliberating).
const STATUS_ROTATION = [
  'Premýšľam...', 'Plánujem...', 'Spracovávam...', 'Tvorím...',
  'Hľadám v pamäti...', 'Konzultujem agenta...', 'Skladám odpoveď...', 'Overujem...',
];

function StreamingStatusRow({ currentTool, onCompact, showCompact }: {
  currentTool: string | null;
  onCompact: () => void;
  showCompact: boolean;
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (currentTool) return; // tool-name takes precedence, no rotation
    const t = setInterval(() => setTick(x => x + 1), 4000);
    return () => clearInterval(t);
  }, [currentTool]);

  const status = currentTool
    ? `🔧 Spúšťam ${currentTool}…`
    : STATUS_ROTATION[tick % STATUS_ROTATION.length];

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-1.5 mb-1 rounded-lg bg-surface/70 border border-border/50">
      <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
        {/* Spinning dot — gulicka */}
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-60" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
        </span>
        <span className="animate-pulse truncate">{status}</span>
      </div>
      {showCompact && (
        <button
          onClick={onCompact}
          title="Minimalizovať — odpoveď ukáž po dokončení"
          className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25 border border-amber-500/30 transition-colors cursor-pointer"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
          Pozadie
        </button>
      )}
    </div>
  );
}

function BackgroundJobPlaceholder({ jobId, onCancel }: { jobId: string; onCancel: (id: string) => void }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const elapsedStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-surface border border-amber-500/20 rounded-2xl rounded-bl-sm shadow-xs">
      <div className="relative h-8 w-8 shrink-0">
        <svg className="h-8 w-8 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" className="text-border" />
          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-amber-500" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-amber-600 dark:text-amber-400">⚡ Beží na pozadí</div>
        <div className="text-[10px] text-muted-foreground">{elapsedStr} • brain upozorní keď bude hotovo</div>
      </div>
      <button
        onClick={() => onCancel(jobId)}
        className="shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-medium text-muted-foreground hover:text-red-500 hover:bg-red-500/10 border border-border hover:border-red-500/20 transition-colors"
        title="Zruš background task"
      >
        Zruš
      </button>
    </div>
  );
}

// Detect plan approval patterns in assistant messages
function detectApprovalNeeded(content: string): boolean {
  // Slovak patterns
  const patterns = [
    /schvál[\s\S]*(?:uprav|zmen|modifik)[\s\S]*(?:zruš|cancel|stop)/i,
    /pokračov[\s\S]*alebo[\s\S]*(?:uprav|zmen)/i,
    /súhlas[\s\S]*(?:alebo|\/)/i,
    /chceš\s+(?:pokračovať|schváliť|potvrdiť)/i,
    /(?:schváliť|pokračovať|upraviť|zrušiť)\s*[?]/i,
    /(?:1\.\s+(?:schvál|pokračov|áno))[\s\S]*(?:2\.\s+(?:uprav|zmen))[\s\S]*(?:3\.\s+(?:zruš|nie|cancel))/i,
    /(?:approve|proceed|continue)[\s\S]*(?:modify|edit|change)[\s\S]*(?:cancel|stop|reject)/i,
  ];
  return patterns.some(p => p.test(content));
}

function ApprovalButtons({ onQuickReply }: { onQuickReply: (text: string) => void }) {
  const [clicked, setClicked] = useState(false);
  if (clicked) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      <button
        onClick={() => { setClicked(true); onQuickReply('Schváliť, pokračuj s implementáciou.'); }}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors cursor-pointer"
      >
        Schváliť
      </button>
      <button
        onClick={() => { setClicked(true); onQuickReply('Chcem upraviť plán. '); }}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors cursor-pointer"
      >
        Upraviť
      </button>
      <button
        onClick={() => { setClicked(true); onQuickReply('Zrušiť plán, nechcem pokračovať.'); }}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors cursor-pointer"
      >
        Zrušiť
      </button>
    </div>
  );
}

interface ChatMessagesProps {
  messages: Message[];
  isLoading: boolean;
  currentTool: string | null;
  personas?: Persona[];
  conversationId?: string | null;
  onCancelBackgroundJob?: (jobId: string) => void;
  silentMode?: boolean;
  onSilentModeChange?: (v: boolean) => void;
  onQuickReply?: (text: string) => void;
  /** Ref of the scrollable container (parent .overflow-y-auto). Required for
   *  sticky-aware auto-scroll behaviour (#14 — bug where stream forced scroll
   *  to bottom blocking user from reading older messages). */
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
}

export function ChatMessages({ messages, isLoading, currentTool, personas = [], conversationId, onCancelBackgroundJob, silentMode = false, onSilentModeChange, onQuickReply, scrollContainerRef }: ChatMessagesProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Sticky-bottom tracking — auto-scroll fires ONLY when user is already near bottom.
  // If user has scrolled up to read history → no scroll yank, jump-button appears instead.
  const isStickyBottomRef = useRef(true);
  const [showJumpButton, setShowJumpButton] = useState(false);
  const STICKY_THRESHOLD_PX = 80;

  // Sticky state listener on parent scroll container
  useEffect(() => {
    const el = scrollContainerRef?.current
      ?? messagesEndRef.current?.closest('[data-chat-scroll]') as HTMLElement | null
      ?? messagesEndRef.current?.parentElement?.parentElement as HTMLElement | null;
    if (!el) return;
    const update = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      const sticky = dist < STICKY_THRESHOLD_PX;
      isStickyBottomRef.current = sticky;
      setShowJumpButton(!sticky);
    };
    el.addEventListener('scroll', update, { passive: true });
    update();
    return () => el.removeEventListener('scroll', update);
  }, [scrollContainerRef]);

  // Conditional auto-scroll — only when sticky (user is at/near bottom)
  useEffect(() => {
    if (isStickyBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const jumpToBottom = () => {
    isStickyBottomRef.current = true;
    setShowJumpButton(false);
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Reset silent mode when streaming finishes or conversation changes
  useEffect(() => {
    if (!isLoading) onSilentModeChange?.(false);
  }, [isLoading]);

  useEffect(() => {
    onSilentModeChange?.(false);
  }, [conversationId]);

  const getPersona = (personaId?: string) =>
    personaId ? personas.find(p => p.id === personaId) : undefined;

  // HTML artifacts removed — ```html blocks now render as normal code blocks in MessageContent

  const formatTime = (id: string) => {
    const ts = parseInt(id, 10);
    if (isNaN(ts)) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <>
      {messages.map((message, msgIndex) => {
        const persona = getPersona(message.personaId);
        const isUser = message.role === 'user';
        const isTool = message.role === 'tool';
        const isAssistant = message.role === 'assistant';
        const displayContent = message.content || '';
        const isLastAssistant = isAssistant && msgIndex === messages.length - 1;
        const isStreaming = isLastAssistant && isLoading;
        const showSilent = isStreaming && silentMode && (message.content?.length || 0) > 100;
        const isBackgroundJob = !!message.backgroundJobId && !message.content;

        return (
          <div
            key={message.id}
            className={`flex ${isUser ? 'justify-end' : 'justify-start'} group animate-msg-in`}
          >
            <div className={`${isUser ? 'max-w-[85%] sm:max-w-[75%]' : 'max-w-full w-full'} flex flex-col`}>
              {/* #13 (2026-04-29): Streaming status row — gulicka + dynamic status + Compact button
                  in single row, replacing the old separate floating Compact-mode row. */}
              {isStreaming && !silentMode && !isBackgroundJob && (
                <StreamingStatusRow
                  currentTool={currentTool}
                  onCompact={() => onSilentModeChange?.(true)}
                  showCompact={(message.content?.length || 0) > 80}
                />
              )}
              {/* Background job placeholder */}
              {isBackgroundJob ? (
                <BackgroundJobPlaceholder
                  jobId={message.backgroundJobId!}
                  onCancel={onCancelBackgroundJob || (() => {})}
                />
              ) : showSilent ? (
                <SilentModeIndicator
                  content={message.content || ''}
                  onExpand={() => onSilentModeChange?.(false)}
                />
              ) : (
                /* Full message bubble */
                <div
                  className={`relative ${
                    isUser
                      ? 'bg-foreground text-background rounded-2xl rounded-br-sm'
                      : isTool
                      ? 'bg-surface border border-border-subtle rounded-2xl shadow-xs'
                      : 'bg-surface border border-border shadow-xs rounded-2xl rounded-bl-sm'
                  } px-5 py-4`}
                  style={
                    persona && isAssistant
                      ? { borderColor: `${persona.color}30` }
                      : undefined
                  }
                >
                  {/* Persona badge */}
                  {persona && isAssistant && (
                    <div className="mb-2">
                      <PersonaBadge persona={persona} />
                    </div>
                  )}

                  {/* Agent badge */}
                  {message.agentName && isAssistant && (
                    <div className="mb-2">
                      <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                        style={{
                          backgroundColor: `${AGENT_COLORS[message.agentColor || 'gray']}18`,
                          color: AGENT_COLORS[message.agentColor || 'gray'],
                          border: `1px solid ${AGENT_COLORS[message.agentColor || 'gray']}30`
                        }}
                      >
                        <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: AGENT_COLORS[message.agentColor || 'gray'] }} />
                        {message.agentName}
                      </span>
                    </div>
                  )}

                  {/* Tool badges */}
                  {message.toolsUsed && message.toolsUsed.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {message.toolsUsed.map((tool, idx) => {
                        const badge = TOOL_BADGES[tool] || { icon: '🔧', color: 'bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-300' };
                        return (
                          <span
                            key={idx}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${badge.color}`}
                          >
                            {badge.icon} {tool.replace('ahrefs_', '')}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Tool result display */}
                  {message.toolData && (
                    <div className="mb-3">
                      <ToolResultDisplay data={message.toolData.data} toolType={message.toolData.type} />
                      {message.toolData.executionTime && (
                        <div className="text-xs text-muted-foreground mt-2">
                          Dokoncene za {(message.toolData.executionTime / 1000).toFixed(1)}s
                        </div>
                      )}
                    </div>
                  )}

                  {/* Message content */}
                  {displayContent && (
                    <div className={isUser ? 'text-background' : 'text-foreground'}>
                      <MessageContent
                        content={displayContent}
                        isLoading={isLoading && isAssistant && !message.content}
                        currentTool={currentTool}
                      />
                    </div>
                  )}

                </div>
              )}

              {/* Action bar below the bubble — #21 (2026-04-29): now also under USER messages
                  with just Copy + Save (their own prompts can be copied/saved as files for
                  team sharing). #22 (2026-04-29): always visible (was opacity-0 hover-only),
                  bg-surface adds subtle contrast against page background so buttons read
                  clearly without hover trigger. */}
              {message.content && (isAssistant || isUser) && (
                <div className={`flex items-center justify-between mt-1.5 px-1 ${isStreaming ? '' : ''} ${isUser ? 'flex-row-reverse' : ''}`}>
                  {/* Left/right side (mirrored for user msgs): timestamp */}
                  <span className="text-[10px] text-muted-foreground">
                    {!isStreaming && formatTime(message.id) && (
                      <span>{isUser ? 'Ty' : 'Brain'} · {formatTime(message.id)}</span>
                    )}
                  </span>

                  {/* Action buttons — bg-surface for contrast, always visible per #22 */}
                  <div className="flex items-center gap-0.5 bg-surface/60 backdrop-blur-sm rounded-lg px-0.5 py-0.5 border border-border/40">
                    {isAssistant && !isLoading && (
                      // Run U 2026-05-27 — FeedbackButton removed with the rest of the feedback surface.
                      <SmartSaveButton content={message.content} />
                    )}
                    {isAssistant && <SpeakButton text={message.content} />}
                    {/* User msgs: just Save + Copy (no feedback, no TTS) */}
                    {isUser && !isLoading && <SmartSaveButton content={message.content} />}
                    <CopyMessageButton text={message.content} />
                  </div>
                </div>
              )}

              {/* Plan approval buttons — shown on last assistant message when approval pattern detected */}
              {isLastAssistant && !isLoading && onQuickReply && message.content && detectApprovalNeeded(message.content) && (
                <ApprovalButtons onQuickReply={onQuickReply} />
              )}
            </div>
          </div>
        );
      })}
      <div ref={messagesEndRef} />
      {/* Jump-to-bottom floating button (#14 fix). Appears when user has scrolled
          up to read history. Click to re-stick to bottom. */}
      {showJumpButton && (
        <button
          onClick={jumpToBottom}
          aria-label="Skoč na najnovšie správy"
          className="fixed bottom-32 right-4 sm:right-6 z-30 flex items-center gap-2 px-3 py-2 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:scale-105 transition-transform text-xs font-medium"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
          {isLoading ? 'Nové správy' : 'Najnovšie'}
        </button>
      )}
    </>
  );
}
