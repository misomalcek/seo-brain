'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ChatChannel, ChatAttachment, TeamMessage, TeamUser } from '@/lib/types';
import { getChannels, getChannelMessages, sendChannelMessage, getOrCreateDM, getPresence, sendHeartbeat, getTeamChatSSEUrl } from '@/lib/api';

export function useTeamChat(isOpen: boolean) {
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load channels
  const loadChannels = useCallback(async () => {
    try {
      const data = await getChannels();
      setChannels(data.channels);
      // Auto-select #general if nothing selected
      if (!activeChannelId && data.channels.length > 0) {
        const general = data.channels.find(c => c.name === 'general');
        setActiveChannelId(general?.id || data.channels[0].id);
      }
    } catch (err) {
      console.error('Failed to load channels:', err);
    }
  }, [activeChannelId]);

  // Load messages for active channel
  const loadMessages = useCallback(async (channelId: string) => {
    setLoading(true);
    try {
      const data = await getChannelMessages(channelId);
      setMessages(data.messages);
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load presence
  const loadPresence = useCallback(async () => {
    try {
      const data = await getPresence();
      setUsers(data.users);
    } catch (err) {
      console.error('Failed to load presence:', err);
    }
  }, []);

  // Send message (with optional attachments)
  const send = useCallback(async (content: string, attachments?: ChatAttachment[]) => {
    if (!activeChannelId || (!content.trim() && (!attachments || !attachments.length))) return;
    try {
      const data = await sendChannelMessage(activeChannelId, content.trim(), attachments);
      setMessages(prev => [...prev, data.message]);
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  }, [activeChannelId]);

  // Open or create DM with a user
  const openDM = useCallback(async (userId: string) => {
    try {
      const data = await getOrCreateDM(userId);
      const ch = data.channel;
      // Add to channels list if not already there
      setChannels(prev => {
        if (prev.some(c => c.id === ch.id)) return prev;
        return [...prev, ch];
      });
      setActiveChannelId(ch.id);
      await loadMessages(ch.id);
    } catch (err) {
      console.error('Failed to open DM:', err);
    }
  }, [loadMessages]);

  // Select channel
  const selectChannel = useCallback(async (channelId: string) => {
    setActiveChannelId(channelId);
    await loadMessages(channelId);
  }, [loadMessages]);

  // SSE connection
  useEffect(() => {
    if (!isOpen) {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      return;
    }

    const url = getTeamChatSSEUrl();
    const es = new EventSource(url, { withCredentials: true });
    eventSourceRef.current = es;

    es.addEventListener('chat_message', (e) => {
      try {
        const msg: TeamMessage = JSON.parse(e.data);
        if (msg.channelId === activeChannelId) {
          setMessages(prev => {
            // Deduplicate by id
            if (prev.some(m => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        }
        // Update channel last message
        setChannels(prev => prev.map(ch =>
          ch.id === msg.channelId
            ? { ...ch, lastMessage: msg.content, lastMessageAt: msg.createdAt, lastMessageBy: msg.userName }
            : ch
        ));
      } catch {}
    });

    es.addEventListener('brain_response', (e) => {
      try {
        const data = JSON.parse(e.data);
        setMessages(prev => prev.map(m =>
          m.id === data.messageId
            ? { ...m, brainResponse: data.response }
            : m
        ));
      } catch {}
    });

    es.addEventListener('presence', (e) => {
      try {
        const data = JSON.parse(e.data);
        setUsers(prev => prev.map(u =>
          u.id === data.userId ? { ...u, status: data.status } : u
        ));
      } catch {}
    });

    es.onerror = () => {
      // EventSource auto-reconnects
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [isOpen, activeChannelId]);

  // Heartbeat
  useEffect(() => {
    if (!isOpen) {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      return;
    }

    sendHeartbeat().catch(() => {});
    heartbeatRef.current = setInterval(() => {
      sendHeartbeat().catch(() => {});
    }, 30000);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [isOpen]);

  // Initial load
  useEffect(() => {
    if (isOpen) {
      loadChannels();
      loadPresence();
    }
  }, [isOpen, loadChannels, loadPresence]);

  // Load messages when channel changes
  useEffect(() => {
    if (activeChannelId && isOpen) {
      loadMessages(activeChannelId);
    }
  }, [activeChannelId, isOpen, loadMessages]);

  return {
    channels,
    activeChannelId,
    messages,
    users,
    loading,
    send,
    selectChannel,
    loadChannels,
    openDM,
  };
}
