'use client';

import { useState, useEffect } from 'react';
import type { ConversationSummary } from '@/lib/api';
import type { ChatChannel, TeamUser } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { getChannels, getPresence } from '@/lib/api';
import { ThemeToggle } from './AppShell';
import { UserProfileModal } from './UserProfileModal';

interface ChatSidebarProps {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNewChat: () => void;
  isOpen: boolean;
  onToggle: () => void;
  onOpenTeamChat?: (channelId?: string) => void;
  activeTeamChannelId?: string | null;
  onSelectTeamChannel?: (channelId: string) => void;
  onTabChange?: (tab: 'ai' | 'team') => void;
  onStartDM?: (userId: string) => void;
  pendingJobConversationIds?: Set<string>;
}

function groupConversations(conversations: ConversationSummary[]) {
  const groups: Record<string, ConversationSummary[]> = {};
  for (const conv of conversations) {
    const date = new Date(conv.updated_at);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    let label: string;
    if (days === 0) label = 'Dnes';
    else if (days === 1) label = 'Včera';
    else if (days < 7) label = 'Tento týždeň';
    else if (days < 30) label = 'Tento mesiac';
    else label = 'Starsie';
    if (!groups[label]) groups[label] = [];
    groups[label].push(conv);
  }
  return groups;
}

export function ChatSidebar({
  conversations,
  activeConversationId,
  loading,
  onSelect,
  onDelete,
  onNewChat,
  isOpen,
  onToggle,
  onOpenTeamChat,
  activeTeamChannelId,
  onSelectTeamChannel,
  onTabChange,
  onStartDM,
  pendingJobConversationIds = new Set(),
}: ChatSidebarProps) {
  const { user, logout } = useAuth();
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [activeTab, setActiveTab] = useState<'ai' | 'team'>('ai');

  useEffect(() => {
    if (!isOpen) return;
    getChannels().then(data => setChannels(data.channels)).catch(() => {});
    getPresence().then(data => setTeamUsers(data.users)).catch(() => {});
  }, [isOpen]);

  const filtered = search
    ? conversations.filter(c => (c.title || '').toLowerCase().includes(search.toLowerCase()))
    : conversations;
  const groups = groupConversations(filtered);
  const teamChannels = channels.filter(c => c.type === 'team');
  const onlineUsers = teamUsers.filter(u => u.status === 'online' && u.id !== user?.id);

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 md:hidden" onClick={onToggle} />
      )}

      <div
        className={`fixed md:relative top-0 left-0 h-full z-50 md:z-auto flex flex-col bg-surface border-r border-border transition-all duration-300 ${
          isOpen ? 'w-[280px] translate-x-0' : 'w-0 -translate-x-full md:w-0 md:translate-x-0'
        } overflow-hidden`}
      >
        {/* Logo header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-border-subtle shrink-0">
          <a href="/" className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/><path d="M10 21h4"/></svg>
            </div>
            <span className="font-bold text-base text-foreground tracking-tight">Team Brain</span>
          </a>
          <button onClick={onToggle} className="p-1.5 rounded-md hover:bg-surface-hover text-muted-foreground transition-colors cursor-pointer" title="Skryt sidebar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></svg>
          </button>
        </div>

        {/* New chat + tab switcher */}
        <div className="px-3 pt-3 pb-1 shrink-0 space-y-2">
          <button
            onClick={onNewChat}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary-soft text-primary font-semibold text-sm border border-transparent hover:border-primary/20 hover:shadow-glow transition-all duration-200 cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Novy chat
          </button>

          {/* AI / Team tab switcher */}
          <div className="flex rounded-lg bg-surface-hover p-0.5">
            <button
              onClick={() => { setActiveTab('ai'); onTabChange?.('ai'); }}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'ai' ? 'bg-surface text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              AI Chat
            </button>
            <button
              onClick={() => { setActiveTab('team'); onTabChange?.('team'); }}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer relative ${
                activeTab === 'team' ? 'bg-surface text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Team
              {teamChannels.some(ch => ch.unreadCount > 0) && (
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary" />
              )}
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 py-2 shrink-0">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={activeTab === 'ai' ? 'Hladat konverzacie...' : 'Hladat kanaly...'}
            className="w-full px-3 py-1.5 rounded-lg border border-border bg-surface-hover text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/30 transition-all"
          />
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-2">
          {/* AI Conversations tab */}
          {activeTab === 'ai' && (
            <>
              {loading && conversations.length === 0 && (
                <div className="p-4 text-center text-sm text-muted-foreground"><div className="animate-pulse">Nacitavam...</div></div>
              )}
              {!loading && conversations.length === 0 && (
                <div className="p-4 text-center text-sm text-muted-foreground">Ziadne konverzacie</div>
              )}

              {Object.entries(groups).map(([label, convs]) => (
                <div key={label}>
                  <div className="px-2 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</div>
                  {convs.map(conv => {
                    const isActive = activeConversationId === conv.id;
                    return (
                      <div
                        key={conv.id}
                        className={`group flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-all duration-150 ${
                          isActive
                            ? 'bg-primary-soft text-foreground border border-primary/15'
                            : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground border border-transparent'
                        }`}
                        onClick={() => onSelect(conv.id)}
                      >
                        <div className="relative shrink-0">
                          <svg className={`h-4 w-4 ${isActive ? 'text-primary' : 'opacity-40'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                          </svg>
                          {pendingJobConversationIds.has(conv.id) && (
                            <span className="absolute -top-1 -right-1 flex h-2 w-2" title="Background task beží...">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-60" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate">{conv.title || 'Bez nazvu'}</div>
                        </div>
                        {confirmDelete === conv.id ? (
                          <div className="flex gap-1 shrink-0">
                            <button onClick={(e) => { e.stopPropagation(); onDelete(conv.id); setConfirmDelete(null); }} className="p-1 rounded text-red-500 hover:bg-red-500/10 text-xs cursor-pointer">✓</button>
                            <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(null); }} className="p-1 rounded text-muted-foreground hover:bg-surface-hover text-xs cursor-pointer">✕</button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); setConfirmDelete(conv.id); }}
                            className="p-1 rounded text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 cursor-pointer"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18 6L6 18M6 6l12 12" /></svg>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </>
          )}

          {/* Team tab - users on top, then channels */}
          {activeTab === 'team' && (
            <>
              {/* Team members - always visible */}
              <div>
                <div className="px-2 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Tim ({teamUsers.length})
                </div>
                {teamUsers.filter(u => u.id !== user?.id).map(u => {
                  const isOnline = u.status === 'online';
                  return (
                    <button
                      key={u.id}
                      onClick={() => onStartDM?.(u.id)}
                      className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg transition-all duration-150 border border-transparent text-muted-foreground hover:bg-surface-hover hover:text-foreground cursor-pointer"
                    >
                      <div className={`h-2 w-2 rounded-full shrink-0 ${isOnline ? 'bg-emerald-400' : 'bg-muted-foreground/30'}`} />
                      <span className={`text-sm truncate ${isOnline ? 'text-foreground' : ''}`}>{u.name}</span>
                    </button>
                  );
                })}
              </div>

              {/* Team channels */}
              {teamChannels.length > 0 && (
                <div className="mt-2">
                  <div className="px-2 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Kanaly</div>
                  {teamChannels.map(ch => {
                    const isActiveChannel = ch.id === activeTeamChannelId;
                    return (
                      <button
                        key={ch.id}
                        onClick={() => onSelectTeamChannel?.(ch.id)}
                        className={`w-full group flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all duration-150 cursor-pointer ${
                          isActiveChannel
                            ? 'bg-primary-soft text-foreground border border-primary/15'
                            : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground border border-transparent'
                        }`}
                      >
                        <span className={`h-4 w-4 shrink-0 flex items-center justify-center text-xs font-bold ${isActiveChannel ? 'text-primary' : 'opacity-50'}`}>#</span>
                        <span className="text-sm truncate flex-1">{ch.name}</span>
                        {ch.unreadCount > 0 && (
                          <span className="text-[10px] bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 font-semibold">{ch.unreadCount}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}


              {teamChannels.length === 0 && teamUsers.length <= 1 && (
                <div className="p-4 text-center text-sm text-muted-foreground">Ziadne kanaly</div>
              )}
            </>
          )}
        </div>

        {/* User footer */}
        <div className="shrink-0 border-t border-border-subtle px-3 py-3 flex items-center gap-2">
          <button
            onClick={() => setShowProfile(true)}
            className="flex items-center gap-2 flex-1 min-w-0 rounded-lg px-1 py-1 hover:bg-surface-hover transition-colors cursor-pointer text-left"
            title="Môj profil"
          >
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-xs font-bold text-white shrink-0">
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground truncate">{user?.name || 'User'}</div>
              <div className="text-[11px] text-muted-foreground">{user?.role || 'user'}</div>
            </div>
          </button>
          <ThemeToggle />
          <button
            onClick={logout}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors cursor-pointer shrink-0"
            title="Odhlásiť sa"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>

      {/* User profile modal */}
      {showProfile && <UserProfileModal onClose={() => setShowProfile(false)} />}
    </>
  );
}
