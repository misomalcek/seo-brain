'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useTeamChat } from '@/hooks/useTeamChat';
import { useAuth } from '@/lib/auth-context';
import { TeamChatMessage } from './TeamChatMessage';
import { AttachmentPicker } from './AttachmentPicker';
import type { ChatAttachment } from '@/lib/types';

interface TeamChatProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TeamChat({ isOpen, onClose }: TeamChatProps) {
  const { user } = useAuth();
  const { channels, activeChannelId, messages, users, loading, send, selectChannel, openDM } = useTeamChat(isOpen);
  const [input, setInput] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [showAttachPicker, setShowAttachPicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() && pendingAttachments.length === 0) return;
    send(input, pendingAttachments.length > 0 ? pendingAttachments : undefined);
    setInput('');
    setPendingAttachments([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClickUser = useCallback((userId: string) => {
    if (userId === user?.id) return; // Can't DM yourself
    openDM(userId);
  }, [openDM, user?.id]);

  const handleAddAttachment = useCallback((attachment: ChatAttachment) => {
    setPendingAttachments(prev => {
      // No duplicates
      if (prev.some(a => a.type === attachment.type && a.id === attachment.id)) return prev;
      return [...prev, attachment];
    });
    setShowAttachPicker(false);
  }, []);

  const handleRemoveAttachment = useCallback((idx: number) => {
    setPendingAttachments(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const onlineUsers = users.filter(u => u.status === 'online');
  const activeChannel = channels.find(c => c.id === activeChannelId);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-background border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-foreground">Team Chat</h2>
            <span className="text-xs text-muted-foreground bg-card px-2 py-0.5 rounded-full">
              {onlineUsers.length} online
            </span>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-card text-muted-foreground transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Sidebar: Channels + Users */}
          <div className="w-48 border-r border-border flex flex-col shrink-0">
            {/* Channels */}
            <div className="p-3">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Kanaly</div>
              {channels.filter(c => c.type === 'team').map(ch => (
                <button
                  key={ch.id}
                  onClick={() => selectChannel(ch.id)}
                  className={`w-full text-left px-2 py-1.5 rounded-lg text-sm mb-0.5 transition-colors ${
                    ch.id === activeChannelId
                      ? 'bg-primary/20 text-primary font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-card'
                  }`}
                >
                  # {ch.name}
                  {ch.unreadCount > 0 && (
                    <span className="ml-1 text-xs bg-primary text-background rounded-full px-1.5">{ch.unreadCount}</span>
                  )}
                </button>
              ))}
            </div>

            {/* DMs */}
            {channels.filter(c => c.type === 'direct').length > 0 && (
              <div className="p-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Spravy</div>
                {channels.filter(c => c.type === 'direct').map(ch => (
                  <button
                    key={ch.id}
                    onClick={() => selectChannel(ch.id)}
                    className={`w-full text-left px-2 py-1.5 rounded-lg text-sm mb-0.5 transition-colors ${
                      ch.id === activeChannelId
                        ? 'bg-primary/20 text-primary font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-card'
                    }`}
                  >
                    {ch.name}
                  </button>
                ))}
              </div>
            )}

            {/* Online users - clickable for DM */}
            <div className="p-3 mt-auto border-t border-border">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Ludia</div>
              {users.map(u => (
                <button
                  key={u.id}
                  onClick={() => handleClickUser(u.id)}
                  disabled={u.id === user?.id}
                  className={`flex items-center gap-2 py-1 text-sm w-full text-left rounded px-1 transition-colors ${
                    u.id === user?.id
                      ? 'cursor-default'
                      : 'hover:bg-card cursor-pointer'
                  }`}
                  title={u.id === user?.id ? 'Ty' : `Pisat s ${u.name}`}
                >
                  <div className={`h-2 w-2 rounded-full shrink-0 ${
                    u.status === 'online' ? 'bg-emerald-400' :
                    u.status === 'away' ? 'bg-yellow-400' : 'bg-muted-foreground/30'
                  }`} />
                  <span className={`truncate ${u.status === 'online' ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {u.name}{u.id === user?.id ? ' (ty)' : ''}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Chat area */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Channel header */}
            {activeChannel && (
              <div className="px-4 py-2 border-b border-border">
                <span className="text-sm font-medium text-foreground">
                  {activeChannel.type === 'team' ? `# ${activeChannel.name}` : activeChannel.name}
                </span>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground text-sm">Nacitavam...</div>
              ) : messages.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  Ziadne spravy. Napis nieco!<br/>
                  <span className="text-xs">Pouzi @Brain pre odpoved od AI</span>
                </div>
              ) : (
                messages.map(msg => (
                  <TeamChatMessage
                    key={msg.id}
                    message={msg}
                    isOwn={msg.userId === user?.id}
                    onClickUser={handleClickUser}
                  />
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Pending attachments */}
            {pendingAttachments.length > 0 && (
              <div className="px-4 py-2 border-t border-border flex flex-wrap gap-1.5">
                {pendingAttachments.map((att, i) => (
                  <div key={i} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-primary/10 border border-primary/20 text-xs text-foreground">
                    <span>{att.type === 'file' ? '📁' : att.type === 'conversation' ? '💬' : '📊'}</span>
                    <span className="truncate max-w-[140px]">{att.title}</span>
                    <button
                      onClick={() => handleRemoveAttachment(i)}
                      className="text-muted-foreground hover:text-foreground ml-0.5"
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="px-4 py-3 border-t border-border">
              <div className="flex gap-2">
                {/* Attach button */}
                <button
                  onClick={() => setShowAttachPicker(!showAttachPicker)}
                  className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card border border-border transition-colors shrink-0"
                  title="Prilozit subor, chat alebo report"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                </button>
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={activeChannel ? `Sprava do ${activeChannel.type === 'team' ? '#' : ''}${activeChannel.name}...` : 'Napis spravu...'}
                  className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() && pendingAttachments.length === 0}
                  className="px-4 py-2 rounded-lg bg-primary text-background text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  Poslat
                </button>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                @Brain pre AI odpoved • 📎 pre prilohy
              </div>
            </div>

            {/* Attachment picker */}
            {showAttachPicker && (
              <AttachmentPicker
                onSelect={handleAddAttachment}
                onClose={() => setShowAttachPicker(false)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
