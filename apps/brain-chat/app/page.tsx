'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { Message, Persona, MCPTool, ContextItem, BackgroundJobSummary } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/components/Toast';
import { useConversations } from '@/hooks/useConversations';
import { useOverlays } from '@/hooks/useOverlays';
import { useChatStream } from '@/hooks/useChatStream';
import { useVoice } from '@/hooks/useVoice';
import { useBackgroundJobs } from '@/hooks/useBackgroundJobs';
import { useContextPanel } from '@/hooks/useContextPanel';
import { getPersonas } from '@/lib/api';
import { AppShell, ThemeToggle } from '@/components/AppShell';
import { LoginForm } from '@/components/LoginForm';
import { ChatMessages } from '@/components/ChatMessages';
import { WelcomeScreen } from '@/components/WelcomeScreen';
import { PersonaBrowser } from '@/components/PersonaBrowser';
import { ToolsBrowser } from '@/components/ToolsBrowser';
import { ReportBrowser } from '@/components/ReportBrowser';
import { TeamChatInline } from '@/components/TeamChatInline';
import { ContentCalendar } from '@/components/ContentCalendar';
import { ContextPanel } from '@/components/ContextPanel';
import { DocsBrowser } from '@/components/DocsBrowser';
import { VectorBrowser } from '@/components/VectorBrowser';
import { FeaturePanel } from '@/components/FeaturePanel';
import { FeatureOverlay } from '@/components/FeatureOverlay';
import { AgentsPanel } from '@/components/panels/AgentsPanel';
import { ChatsPanel } from '@/components/panels/ChatsPanel';
import { MemoryPanel } from '@/components/panels/MemoryPanel';
import { FilesPanel } from '@/components/panels/FilesPanel';
import { TeamPanel } from '@/components/panels/TeamPanel';
import { DataViewerPanel } from '@/components/panels/DataViewerPanel';
import { GraphPanel } from '@/components/panels/GraphPanel';
import { UsersPanel } from '@/components/panels/UsersPanel';
import { ChatFooter } from '@/components/ChatFooter';
import { GlobalSearch } from '@/components/GlobalSearch';
import { ContextSearch } from '@/components/ContextSearch';
import { UserProfile } from '@/components/UserProfile';
import { TimelineScrollbar } from '@/components/TimelineScrollbar';
import { ForcePasswordChange } from '@/components/ForcePasswordChange';
import type { AgentInfo, UserFile } from '@/lib/types';

// Panel registry — single source of truth for overlay titles and icons
const PANEL_REGISTRY: Record<string, { title: string; icon: string }> = {
  chats: { title: 'Chaty', icon: '💬' },
  agents: { title: 'Agenti', icon: '🤖' },
  files: { title: 'Súbory', icon: '📁' },
  snapshots: { title: 'Snímky', icon: '📸' },
  datasets: { title: 'Datasety', icon: '📊' },
  templates: { title: 'Šablóny', icon: '📐' },
  vectors: { title: 'Vektory', icon: '🧲' },
  calendar: { title: 'Content', icon: '📅' },
  reports: { title: 'Prehľady', icon: '📊' },
  docs: { title: 'Dokumentácia', icon: '📖' },
  memory: { title: 'Pamäť', icon: '💾' },
  team: { title: 'Tím', icon: '👥' },
  search: { title: 'Hľadanie', icon: '🔍' },
  context: { title: 'Kontext', icon: '📎' },
  profile: { title: 'Profil', icon: '👤' },
  personas: { title: 'Personas', icon: '🎭' },
  tools: { title: 'Tools', icon: '🛠️' },
  'data-viewer': { title: 'Dáta', icon: '📈' },
  graph: { title: 'Graf znalostí', icon: '🕸️' },
  users: { title: 'Používatelia', icon: '👥' },
};

export default function ChatPage() {
  const { loading: authLoading, isAuthenticated, mustChangePassword } = useAuth();
  const [showProfile, setShowProfile] = useState(false);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center mx-auto mb-4 animate-pulse-glow">
            <span className="text-2xl">🧠</span>
          </div>
          <p className="text-muted-foreground text-sm">Načítavam...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginForm />;
  }

  return (
    <AppShell onOpenProfile={() => setShowProfile(true)}>
      {mustChangePassword && <ForcePasswordChange />}
      <ChatContent />
      <UserProfile isOpen={showProfile} onClose={() => setShowProfile(false)} />
    </AppShell>
  );
}

// Brain One UI: single-column layout is now the only mode (legacy 3-column removed)

function ChatContent() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [toolInput, setToolInput] = useState('');
  const [isToolLoading, setIsToolLoading] = useState(false);

  // Compact (silent) mode — lifted from ChatMessages for button placement above chatbox
  const [silentMode, setSilentMode] = useState(false);
  // Model selector state
  const [modelOverride, setModelOverride] = useState<'default' | 'auto' | 'opus-4.5' | 'opus-4.6' | 'sonnet-4.5' | 'sonnet-4.6' | 'haiku-4.5'>('default');

  // Team chat mode - when a team channel is selected, show team chat in center
  const [mainView, setMainView] = useState<'ai-chat' | 'team-chat'>('ai-chat');
  const [activeTeamChannelId, setActiveTeamChannelId] = useState<string | null>(null);

  const [activePersonaId, setActivePersonaId] = useState<string | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [activeAgent, setActiveAgent] = useState<AgentInfo | null>(null);

  // Panel state — single overlay at a time
  const { activeOverlay, openOverlay, closeOverlay } = useOverlays();

  // Quick search (Ctrl+K) — conversation jumper modal, separate from the
  // 'search' overlay which now renders the richer ContextSearch panel
  // (memories + articles + knowledge + agents + brand + templates).
  const [quickSearchOpen, setQuickSearchOpen] = useState(false);

  // Context items hook
  const { contextItems, setContextItems, contextItemsRef, addToContext, removeFromContext } = useContextPanel();

  // Ctrl+K global search shortcut — opens the conversation quick-jumper
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setQuickSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const conversationIdRef = useRef<string | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null); // for timeline scrollbar
  const {
    conversations,
    activeConversationId,
    loading: convLoading,
    loadConversation,
    save: saveConversation,
    remove: removeConversation,
    startNew,
  } = useConversations();

  useEffect(() => {
    getPersonas()
      .then(data => setPersonas(data.personas))
      .catch(err => console.error('Failed to load personas:', err));
  }, []);

  const activePersona = activePersonaId
    ? personas.find(p => p.id === activePersonaId) || null
    : null;

  const autoSave = useCallback(async (allMessages: Message[]) => {
    const saveable = allMessages
      .filter(m => m.content)
      .map(m => ({ role: m.role === 'tool' ? 'assistant' as const : m.role, content: m.content }));
    if (saveable.length < 2) return;
    const convId = await saveConversation(saveable, {
      conversationId: conversationIdRef.current || undefined,
      personaId: activePersonaId || undefined,
    });
    if (convId) conversationIdRef.current = convId;
  }, [saveConversation, activePersonaId]);

  // Brain Pt. II Sprint 1 — orthogonal 4-mode system (default/extended/fast/confirm)
  // Replaces task-template modes (consult/plan/write/expert/batch) with HOW Brain responds dimensions
  // Backend handles mode-specific prompt injection via getModePrompt() + coerceMode() for legacy values
  const [mode, setMode] = useState<'default' | 'extended' | 'fast' | 'confirm'>('default');

  // Chat streaming hook — extracted from inline state
  const {
    messages, setMessages, input, setInput, isLoading, currentTool,
    sendMessage, abortStream, setIsLoading, setCurrentTool,
    streamPayloadRef, convertingToBackgroundRef, sendingRef, streamAbortRef,
  } = useChatStream({
    activePersonaId,
    activeAgentName: activeAgent?.name || null,
    modelOverride,
    mode,  // Brain Pt. II Sprint 1
    contextItemsRef,
    onAutoSave: autoSave,
    onToast: addToast,
  });

  // Background jobs hook — extracted from ChatContent
  const isAdmin = user?.role === 'admin' || user?.role === 'team_admin';
  const {
    backgroundMode, setBackgroundMode,
    pendingJobs, setPendingJobs, pendingJobsRef,
    sendBackgroundMessage, convertToBackground,
  } = useBackgroundJobs({
    isAdmin,
    messages, setMessages, setInput,
    conversationIdRef, contextItemsRef,
    activePersonaId, activeAgent,
    saveConversation, loadConversation, addToast,
    sendingRef, streamPayloadRef, convertingToBackgroundRef, streamAbortRef,
  });

  // Voice hook — conversation mode auto TTS→STT cycle
  const { conversationMode, setConversationMode } = useVoice(isLoading, messages, setInput);

  // (mode state declared earlier in component scope — see above, moved up to avoid hoisting issue)

  const executeMCPTool = useCallback(async (tool: MCPTool) => {
    if (!toolInput.trim() || isToolLoading) return;
    setIsToolLoading(true);
    const toolMessage: Message = { id: Date.now().toString(), role: 'tool', content: `🔧 ${tool.label}: ${toolInput}`, toolsUsed: [tool.id] };
    setMessages(prev => [...prev, toolMessage]);
    try {
      const response = await fetch(`${tool.endpoint}${encodeURIComponent(toolInput)}?country=sk`, { method: 'GET', credentials: 'include' });
      const result = await response.json();
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: result.success ? '' : 'Nastroj vratil chybu.', toolsUsed: [tool.id], toolData: { type: tool.id, data: result.data, executionTime: result.executionTime } }]);
    } catch (error) {
      console.error('MCP Tool error:', error);
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: 'Nepodarilo sa spustit nastroj. Skuste to znova.' }]);
    } finally {
      setIsToolLoading(false);
      setToolInput('');
    }
  }, [toolInput, isToolLoading]);

  const handleSubmit = (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault();
    // Brain Pt. II Sprint 1: mode is now sent as request field (useChatStream + useBackgroundJobs pick it up).
    // No more @master-planner auto-prepend — backend mode=plan triggers PLAN mode prompt natively.
    if (backgroundMode) {
      sendBackgroundMessage(input);
    } else {
      sendMessage(input);
    }
  };

  const handleSelectConversation = useCallback(async (id: string) => {
    // If a stream is running, auto-convert it to a background job before switching
    if (sendingRef.current && streamPayloadRef.current) {
      await convertToBackground();
    } else if (streamAbortRef.current) {
      streamAbortRef.current.abort();
      streamAbortRef.current = null;
    }
    setIsLoading(false);
    setCurrentTool(null);
    sendingRef.current = false;
    setMainView('ai-chat');
    setActiveTeamChannelId(null);
    const msgs = await loadConversation(id);
    if (msgs) {
      conversationIdRef.current = id;
      const loadedMessages: Message[] = msgs.map((m, i) => ({
        id: `loaded-${m.id || i}`,
        role: m.role as Message['role'],
        content: m.content,
        personaId: m.persona_id || undefined,
      }));
      // Re-add placeholder for still-active background jobs — only if DB doesn't already have the result
      const activeForConv = pendingJobsRef.current.filter(j =>
        j.conversation_id === id && (j.status === 'pending' || j.status === 'running')
      );
      for (const job of activeForConv) {
        // If the last loaded message is a completed assistant response, job finished while we were away
        const lastLoaded = loadedMessages[loadedMessages.length - 1];
        const jobAlreadyDone = lastLoaded?.role === 'assistant' && !!lastLoaded.content && !lastLoaded.backgroundJobId;
        if (jobAlreadyDone) {
          setPendingJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'completed' } : j));
        } else {
          loadedMessages.push({ id: `bg-${job.id}`, role: 'assistant', content: '', backgroundJobId: job.id, toolsUsed: [] });
        }
      }
      setMessages(loadedMessages);
    }
    // Close sidebar on mobile only
  }, [loadConversation, convertToBackground]);

  const handleNewChat = useCallback(() => {
    if (streamAbortRef.current) {
      streamAbortRef.current.abort();
      streamAbortRef.current = null;
    }
    setIsLoading(false);
    setCurrentTool(null);
    sendingRef.current = false;
    setMainView('ai-chat');
    setActiveTeamChannelId(null);
    conversationIdRef.current = null;
    setMessages([]);
    startNew();
  }, [startNew]);

  // Team chat handlers
  const handleSelectTeamChannel = useCallback((channelId: string) => {
    setMainView('team-chat');
    setActiveTeamChannelId(channelId);
  }, []);

  const handleStartDM = useCallback(async (userId: string) => {
    try {
      const { getOrCreateDM } = await import('@/lib/api');
      const data = await getOrCreateDM(userId);
      setMainView('team-chat');
      setActiveTeamChannelId(data.channel.id);
      } catch (err) {
      console.error('Failed to open DM:', err);
    }
  }, []);

  const handleSidebarTabChange = useCallback((tab: 'ai' | 'team') => {
    if (tab === 'ai') {
      setMainView('ai-chat');
      setActiveTeamChannelId(null);
    }
  }, []);

  const handleDeleteConversation = useCallback(async (id: string) => {
    try {
      await removeConversation(id);
      if (conversationIdRef.current === id) { conversationIdRef.current = null; setMessages([]); }
      addToast('Konverzacia vymazana', 'success');
    } catch { addToast('Vymazanie zlyhalo', 'error'); }
  }, [removeConversation, addToast]);

  const handleAgentInvoke = useCallback((agent: AgentInfo) => {
    setActiveAgent(agent);
    closeOverlay();
    setTimeout(() => { document.querySelector('textarea')?.focus(); }, 100);
  }, []);

  const handleClearAgent = useCallback(() => {
    setActiveAgent(null);
    setInput(prev => prev.replace(/^\[Agent: [^\]]+\] ?/, ''));
  }, []);

  const handleFileInsert = useCallback((_file: UserFile, content: string) => {
    setInput(prev => prev + (prev ? '\n\n' : '') + content);
    closeOverlay();
  }, []);

  const handleFrameworkInsert = useCallback((content: string) => {
    setInput(prev => prev + (prev ? '\n\n' : '') + content);
    closeOverlay();
  }, []);

  // addToContext and removeFromContext provided by useContextPanel hook

  return (
    <div className={"flex flex-1 flex-col min-h-0 overflow-hidden"}>
{/* Center: Main chat area */}
      <div className={`flex-1 flex flex-col min-w-0 min-h-0 relative ${'max-w-5xl mx-auto w-full'}`}>
        {/* Inline header bar — 2026-04-28 rework: Avatar+Brand on LEFT, search+help+admin on RIGHT, theme moved to user profile menu. */}
        <header className="shrink-0 h-12 sm:h-14 flex items-center justify-between px-3 sm:px-5">
          {/* Left: Avatar + Brand */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => openOverlay('profile')}
              className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-semibold cursor-pointer hover:accent-glow transition-shadow shrink-0"
              title={user?.name || 'Profil'}
            >
              {user?.name ? user.name.charAt(0).toUpperCase() : '?'}
            </button>
            <span className="text-sm font-semibold text-foreground tracking-tight cursor-default">
              BRAIN<span className="text-primary">.ai</span>
            </span>
          </div>

          {/* Right icons — search, help, users (admin) */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => openOverlay('search')}
              className="p-2.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
              title="Hľadať (Ctrl+K)"
            >
              <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
            {/* Help icon — #20 (2026-04-29): replaced tiny "?" in faint circle with
                Lucide LifeBuoy — internationally recognized "help/support" symbol,
                more distinctive than yet-another-circle, larger + thicker stroke. */}
            <button onClick={() => openOverlay('docs')} className="p-2.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center" title="Pomoc / Dokumentácia">
              <svg className="h-[20px] w-[20px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="10"/>
                <circle cx="12" cy="12" r="4"/>
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.93 4.93 4.24 4.24M14.83 9.17l4.24-4.24M14.83 14.83l4.24 4.24M9.17 14.83l-4.24 4.24"/>
              </svg>
            </button>
            {/* Run U 2026-05-27 — Používatelia moved out of dock into header
                (admin/team_admin only). Decongests the dock. */}
            {(user?.role === 'admin' || user?.role === 'team_admin') && (
              <button
                onClick={() => openOverlay('users')}
                className="p-2.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                title="Používatelia"
              >
                <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                </svg>
              </button>
            )}
            {/* Admin link removed 2026-05-26 (Run P) — admin/* archived to
                _archive/admin-2026-05-26/. All admin surfaces now live as
                dock apps: Pamäť, Používatelia, Dáta (Systém tab), Hľadanie. */}
            {/* ThemeToggle removed from header 2026-04-28 — moved into UserProfileModal as ThemeSelector (light/dark/auto). Click avatar (top-left) to access. */}
          </div>
        </header>

        {/* Main content area - AI chat or Team chat */}
        {mainView === 'team-chat' ? (
          <TeamChatInline
            isActive={mainView === 'team-chat'}
            initialChannelId={activeTeamChannelId}
            onChannelChange={setActiveTeamChannelId}
          />
        ) : (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* AI Chat messages area — hidden when overlay is open */}
            <div className={`flex-1 relative min-h-0 flex ${activeOverlay ? 'hidden' : ''}`}>
              <div className="flex-1 overflow-y-auto scrollbar-none" ref={messagesScrollRef} data-chat-scroll>
                <div className="w-[98%] mx-auto py-6 space-y-4 min-h-full flex flex-col">
                  {messages.length === 0 ? (
                    <WelcomeScreen
                      onSendMessage={sendMessage}
                      onOpenHelp={() => openOverlay('docs')}
                      conversations={conversations}
                      onSelectConversation={handleSelectConversation}
                    />
                  ) : (
                    <ChatMessages
                      messages={messages}
                      isLoading={isLoading}
                      currentTool={currentTool}
                      personas={personas}
                      conversationId={conversationIdRef.current}
                      scrollContainerRef={messagesScrollRef}
                      onCancelBackgroundJob={isAdmin ? async (jobId) => {
                        try {
                          await fetch(`/api/jobs/${jobId}`, { method: 'DELETE', credentials: 'include' });
                          setMessages(prev => prev.filter(m => m.backgroundJobId !== jobId));
                          setPendingJobs(prev => prev.filter(j => j.id !== jobId));
                          addToast('Background task zrušený', 'success');
                        } catch { addToast('Nepodarilo sa zrušiť task', 'error'); }
                      } : undefined}
                      silentMode={silentMode}
                      onSilentModeChange={setSilentMode}
                      onQuickReply={(text) => {
                        if (text.startsWith('Schváliť') || text.startsWith('Zrušiť')) {
                          sendMessage(text);
                        } else {
                          setInput(text);
                        }
                      }}
                    />
                  )}
                </div>
              </div>
              {/* Timeline scrollbar — sibling of scroll container, anchored to outer relative wrapper */}
              {messages.length > 3 && (
                <TimelineScrollbar containerRef={messagesScrollRef} messages={messages} />
              )}
            </div>

            {/* Context + Input at bottom — with dark mode glow */}
            <div className="w-full px-2 sm:px-4 dock-glow relative z-10">
              {/* "Send to background" banner — visible only while streaming */}
              {isLoading && streamPayloadRef.current && (
                <div className="flex items-center justify-between px-3 py-1.5 mb-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-600 dark:text-amber-400">
                  <span className="flex items-center gap-1.5">
                    <span className="relative flex h-1.5 w-1.5 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-60" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500" />
                    </span>
                    Brain spracúva...
                  </span>
                  <button
                    onClick={convertToBackground}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500/15 hover:bg-amber-500/30 transition-colors font-medium cursor-pointer"
                  >
                    ⚡ Poslať na pozadie
                  </button>
                </div>
              )}
              {/* #13 (2026-04-29): floating Compact-mode row removed — moved into
                  StreamingStatusRow inside the assistant bubble (saves vertical space,
                  one location for all streaming controls). */}

              {/* Feature Overlay — slides over chat area when a feature is active.
                  2026-05-26: 'search' now opens here too (Context Search panel —
                  6-source unified semantic search). The Ctrl+K shortcut still
                  pops GlobalSearch as a conversation quick-jumper modal. */}
              {activeOverlay && (
                <FeatureOverlay
                  isOpen={true}
                  onClose={closeOverlay}
                  title={PANEL_REGISTRY[activeOverlay]?.title || 'Brain'}
                  icon={PANEL_REGISTRY[activeOverlay]?.icon || '🧠'}
                >
                  {/* New clean panels */}
                  {activeOverlay === 'team' && (
                    <TeamPanel onStartDM={handleStartDM} />
                  )}
                  {activeOverlay === 'chats' && (
                    <ChatsPanel
                      conversations={conversations}
                      activeConversationId={activeConversationId}
                      onSelect={(id) => { handleSelectConversation(id); closeOverlay(); }}
                      onDelete={handleDeleteConversation}
                      onNewChat={() => { handleNewChat(); closeOverlay(); }}
                    />
                  )}
                  {activeOverlay === 'agents' && (
                    <AgentsPanel onInvoke={(agent) => { handleAgentInvoke(agent); closeOverlay(); }} />
                  )}
                  {activeOverlay === 'memory' && (
                    <MemoryPanel />
                  )}
                  {activeOverlay === 'profile' && (
                    <UserProfile isOpen={true} onClose={closeOverlay} />
                  )}
                  {activeOverlay === 'context' && (
                    <ContextPanel items={contextItems} onRemove={removeFromContext} onAddBrandAsset={(item) => setContextItems(prev => prev.some(i => i.id === item.id) ? prev : [...prev, item])} activeSiteId={null} />
                  )}
                  {/* Files panel (unified browser) */}
                  {(activeOverlay === 'files' || activeOverlay === 'snapshots' || activeOverlay === 'datasets' || activeOverlay === 'templates') && (
                    <FilesPanel
                      contextItems={contextItems}
                      onAddToContext={addToContext}
                      onRemoveFromContext={removeFromContext}
                      isAdmin={user?.role === 'admin' || user?.role === 'team_admin'}
                    />
                  )}
                  {activeOverlay === 'vectors' && (
                    <VectorBrowser isOpen={true} onClose={closeOverlay} embedded />
                  )}
                  {activeOverlay === 'calendar' && (
                    <ContentCalendar isOpen={true} onClose={closeOverlay} embedded />
                  )}
                  {activeOverlay === 'reports' && (
                    <ReportBrowser isOpen={true} onClose={closeOverlay} embedded />
                  )}
                  {/* Run U 2026-05-27 — Feedback overlay removed. */}
                  {activeOverlay === 'docs' && (
                    <DocsBrowser isOpen={true} onClose={closeOverlay} embedded />
                  )}
                  {activeOverlay === 'personas' && (
                    <PersonaBrowser
                      isOpen={true}
                      onClose={closeOverlay}
                      activePersonaId={activePersonaId}
                      onSelect={setActivePersonaId}
                      embedded
                    />
                  )}
                  {activeOverlay === 'search' && (
                    <ContextSearch showHeader={false} />
                  )}
                  {activeOverlay === 'tools' && (
                    <ToolsBrowser isOpen={true} onClose={closeOverlay} embedded />
                  )}
                  {activeOverlay === 'data-viewer' && (
                    <DataViewerPanel />
                  )}
                  {activeOverlay === 'graph' && (
                    <GraphPanel />
                  )}
                  {activeOverlay === 'users' && (
                    <UsersPanel />
                  )}
                </FeatureOverlay>
              )}

              {/* Feature Panel — Brain One UI horizontal bar above chatbox */}
              {<FeaturePanel activeOverlay={activeOverlay} onFeatureClick={openOverlay} isAdmin={user?.role === 'admin' || user?.role === 'team_admin'} />}

              <ChatFooter
                input={input}
                onInputChange={setInput}
                onSubmit={handleSubmit}
                isLoading={isLoading}
                currentTool={currentTool}
                activePersonaId={activePersonaId}
                onPersonaChange={setActivePersonaId}
                personas={personas}
                modelOverride={modelOverride}
                onModelChange={(m) => setModelOverride(m as typeof modelOverride)}
                conversationMode={conversationMode}
                onToggleConversationMode={() => setConversationMode(prev => !prev)}
                contextItemCount={contextItems.length}
                onToggleContext={() => openOverlay('context')}
                mode={mode}
                onModeChange={setMode}
                onOpenPersonaBrowser={() => openOverlay('personas')}
                onStop={abortStream}
              />
            </div>
          </div>
        )}
      </div>
      <GlobalSearch isOpen={quickSearchOpen} onClose={() => setQuickSearchOpen(false)} onSelectConversation={handleSelectConversation} />
    </div>
  );
}
