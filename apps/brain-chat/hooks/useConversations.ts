'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  listConversations,
  getConversation,
  saveConversation,
  deleteConversation as deleteConvApi,
  type ConversationSummary,
  type ConversationMessage,
} from '@/lib/api';

export function useConversations() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listConversations(50, 0);
      setConversations(result.data);
      setTotal(result.total);
    } catch (err) {
      console.error('Failed to load conversations:', err);
      setError('Nepodarilo sa načítať konverzácie');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const loadConversation = useCallback(async (id: string): Promise<ConversationMessage[] | null> => {
    try {
      const result = await getConversation(id);
      setActiveConversationId(id);
      return result.data.messages;
    } catch (err) {
      console.error('Failed to load conversation:', err);
      return null;
    }
  }, []);

  const save = useCallback(async (
    messages: Array<{ role: string; content: string; toolCalls?: any }>,
    options?: { conversationId?: string; title?: string; personaId?: string }
  ): Promise<string | null> => {
    try {
      const result = await saveConversation(messages, options);
      const convId = result.data.conversationId;
      setActiveConversationId(convId);
      // Refresh list to show the new/updated conversation
      await refresh();
      return convId;
    } catch (err) {
      console.error('Failed to save conversation:', err);
      return null;
    }
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    try {
      await deleteConvApi(id);
      if (activeConversationId === id) {
        setActiveConversationId(null);
      }
      await refresh();
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  }, [activeConversationId, refresh]);

  const startNew = useCallback(() => {
    setActiveConversationId(null);
  }, []);

  return {
    conversations,
    total,
    loading,
    error,
    activeConversationId,
    refresh,
    loadConversation,
    save,
    remove,
    startNew,
  };
}
