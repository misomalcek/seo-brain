'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useTeamChat } from '@/hooks/useTeamChat';
import { useAuth } from '@/lib/auth-context';
import { TeamChatMessage } from './TeamChatMessage';
import { AttachmentPicker } from './AttachmentPicker';
import type { ChatAttachment } from '@/lib/types';

interface TeamChatInlineProps {
  isActive: boolean;
  initialChannelId?: string | null;
  onChannelChange?: (channelId: string) => void;
}

export function TeamChatInline({ isActive, initialChannelId, onChannelChange }: TeamChatInlineProps) {
  const { user } = useAuth();
  const { channels, activeChannelId, messages, users, loading, send, selectChannel, openDM } = useTeamChat(isActive);
  const [input, setInput] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [showAttachPicker, setShowAttachPicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const syncedRef = useRef(false);

  // Sync initialChannelId with hook's selectChannel
  useEffect(() => {
    if (isActive && initialChannelId && channels.length > 0) {
      if (activeChannelId !== initialChannelId) {
        selectChannel(initialChannelId);
        syncedRef.current = true;
      }
    }
  }, [isActive, initialChannelId, channels.length, activeChannelId, selectChannel]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(() => {
    if (!input.trim() && pendingAttachments.length === 0) return;
    send(input, pendingAttachments.length > 0 ? pendingAttachments : undefined);
    setInput('');
    setPendingAttachments([]);
  }, [input, pendingAttachments, send]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClickUser = useCallback((userId: string) => {
    if (userId === user?.id) return;
    openDM(userId);
  }, [openDM, user?.id]);

  const handleAddAttachment = useCallback((attachment: ChatAttachment) => {
    setPendingAttachments(prev => {
      if (prev.some(a => a.type === attachment.type && a.id === attachment.id)) return prev;
      return [...prev, attachment];
    });
    setShowAttachPicker(false);
  }, []);

  const handleRemoveAttachment = useCallback((idx: number) => {
    setPendingAttachments(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const activeChannel = channels.find(c => c.id === activeChannelId);
  const onlineCount = users.filter(u => u.status === 'online').length;

  if (!isActive) return null;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Channel header */}
      {activeChannel && (
        <div className="shrink-0 px-4 sm:px-6 py-2.5 border-b border-border-subtle flex items-center gap-3">
          <span className="text-muted-foreground font-bold text-lg">
            {activeChannel.type === 'team' ? '#' : ''}
          </span>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold text-foreground">
              {activeChannel.name}
            </span>
          </div>
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            {onlineCount} online
          </span>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[780px] mx-auto px-2 sm:px-4 py-4 space-y-3">
          {loading ? (
            <div className="text-center py-16 text-muted-foreground text-sm animate-pulse">
              Nacitavam spravy...
            </div>
          ) : messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-16">
              <div className="h-14 w-14 rounded-xl bg-primary-soft flex items-center justify-center mb-4">
                <span className="text-2xl">💬</span>
              </div>
              <p className="text-sm font-medium text-foreground mb-1">
                {activeChannel ? `#${activeChannel.name}` : 'Team Chat'}
              </p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Ziadne spravy v tomto kanali. Napis nieco!
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Pouzi <span className="text-primary font-medium">@Brain</span> pre odpoved od AI
              </p>
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
      </div>

      {/* Bottom: pending attachments + input */}
      <div className="shrink-0 max-w-[780px] mx-auto w-full px-2 sm:px-4 pb-3 relative z-20">
        {/* Pending attachments */}
        {pendingAttachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {pendingAttachments.map((att, i) => (
              <div key={i} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-primary/5 border border-primary/20 text-xs text-foreground">
                <span>{att.type === 'file' ? '📁' : att.type === 'conversation' ? '💬' : '📊'}</span>
                <span className="truncate max-w-[140px]">{att.title}</span>
                <button
                  onClick={() => handleRemoveAttachment(i)}
                  className="text-muted-foreground hover:text-foreground ml-0.5 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input row */}
        <div className="relative">
          <div className="flex gap-2 items-end">
            <div className="flex-1 flex items-center gap-2 rounded-xl border border-border bg-surface-hover px-3 py-2.5 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
              {/* Attach button */}
              <button
                onClick={() => setShowAttachPicker(!showAttachPicker)}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${
                  showAttachPicker
                    ? 'text-primary bg-primary/10'
                    : 'text-muted-foreground hover:text-foreground hover:bg-card'
                }`}
                title="Prilozit subor, chat alebo report"
              >
                <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
              </button>

              {/* Text input */}
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={activeChannel ? `Sprava do ${activeChannel.type === 'team' ? '#' : ''}${activeChannel.name}...` : 'Napis spravu...'}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>

            {/* Send */}
            <button
              onClick={handleSend}
              disabled={!input.trim() && pendingAttachments.length === 0}
              className="h-10 px-5 rounded-xl bg-gradient-to-r from-primary to-accent flex items-center justify-center gap-2 text-white text-sm font-medium hover:shadow-glow hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0 transition-all ease-spring cursor-pointer shrink-0 shadow-md"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              <span>Poslat</span>
            </button>
          </div>

          {/* @Brain hint */}
          <div className="text-xs text-muted-foreground mt-1.5 ml-1">
            @Brain pre AI odpoved
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
  );
}
