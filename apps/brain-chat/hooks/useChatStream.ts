'use client';

import { useState, useCallback, useRef } from 'react';
import type { Message, ContextItem } from '@/lib/types';

export type BrainMode = 'default' | 'extended' | 'fast' | 'confirm';

interface UseChatStreamOptions {
  activePersonaId: string | null;
  activeAgentName: string | null;
  modelOverride: string;
  mode?: BrainMode; // Brain Pt. II Sprint 1
  contextItemsRef: React.MutableRefObject<ContextItem[]>;
  onAutoSave: (messages: Message[]) => void;
  onToast: (msg: string, type: 'success' | 'error') => void;
}

/**
 * Manages chat streaming: messages, send, abort, tool tracking.
 * Extracted from page.tsx ChatContent (~100 lines of streaming logic).
 */
export function useChatStream(options: UseChatStreamOptions) {
  const { activePersonaId, activeAgentName, modelOverride, mode, contextItemsRef, onAutoSave, onToast } = options;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentTool, setCurrentTool] = useState<string | null>(null);

  const sendingRef = useRef(false);
  const streamAbortRef = useRef<AbortController | null>(null);
  const streamPayloadRef = useRef<{ messages: Message[]; assistantId: string; personaId: string | null } | null>(null);
  const convertingToBackgroundRef = useRef(false);

  const sendMessage = useCallback(async (messageContent: string) => {
    if (!messageContent.trim() || isLoading || sendingRef.current) return;
    sendingRef.current = true;
    setIsLoading(true);
    const abortCtrl = new AbortController();
    streamAbortRef.current = abortCtrl;

    const content = activeAgentName
      ? `[Agent: ${activeAgentName}] ${messageContent.trim()}`
      : messageContent.trim();

    const userMessage: Message = { id: Date.now().toString(), role: 'user', content };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setCurrentTool(null);

    const assistantId = (Date.now() + 1).toString();
    streamPayloadRef.current = { messages: updatedMessages, assistantId, personaId: activePersonaId };
    const toolsUsed: string[] = [];
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', personaId: activePersonaId || undefined, toolsUsed: [] }]);

    let finalMessages: Message[] = [];

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        signal: abortCtrl.signal,
        body: JSON.stringify({
          messages: updatedMessages.map(m => ({ role: m.role === 'tool' ? 'assistant' : m.role, content: m.content })),
          personaId: activePersonaId || undefined,
          siteId: undefined,
          contextItems: contextItemsRef.current.length > 0 ? contextItemsRef.current.map(c => ({ type: c.type, label: c.label, content: c.content })) : undefined,
          modelOverride: modelOverride !== 'default' ? modelOverride : undefined,
          mode: mode && mode !== 'default' ? mode : undefined, // Brain Pt. II Sprint 1 (orthogonal modes)
        }),
      });

      if (!response.ok) throw new Error('Failed to send message');
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('No response stream');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.agent) {
                setMessages(prev => prev.map(m => m.id === assistantId
                  ? { ...m, agentId: data.agent, agentName: data.agentName, agentColor: data.agentColor }
                  : m));
              }
              if (data.text) {
                setMessages(prev => {
                  const updated = prev.map(m => m.id === assistantId ? { ...m, content: m.content + data.text } : m);
                  finalMessages = updated;
                  return updated;
                });
              }
              if (data.tool) {
                setCurrentTool(data.tool);
                toolsUsed.push(data.tool);
                setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, toolsUsed: [...toolsUsed] } : m));
              }
              if (data.done) setCurrentTool(null);
            } catch { /* skip malformed SSE */ }
          }
        }
      }

      if (finalMessages.length > 0) onAutoSave(finalMessages);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Intentional abort — do nothing
      } else if (!convertingToBackgroundRef.current) {
        console.error('Chat error:', error);
        onToast('Chyba pri odosielani spravy', 'error');
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: 'Nastala chyba pri spracovani vasej poziadavky.' } : m));
      }
    } finally {
      if (!convertingToBackgroundRef.current) {
        streamPayloadRef.current = null;
      }
      setIsLoading(false);
      setCurrentTool(null);
      sendingRef.current = false;
      streamAbortRef.current = null;
    }
  }, [isLoading, messages, activePersonaId, activeAgentName, modelOverride, contextItemsRef, onAutoSave, onToast]);

  const abortStream = useCallback(() => {
    if (streamAbortRef.current) {
      streamAbortRef.current.abort();
      streamAbortRef.current = null;
    }
  }, []);

  return {
    messages,
    setMessages,
    input,
    setInput,
    isLoading,
    currentTool,
    sendMessage,
    abortStream,
    // State setters for external use (background jobs, tool execution)
    setIsLoading,
    setCurrentTool,
    // Expose refs for background job conversion + stream abort
    streamPayloadRef,
    convertingToBackgroundRef,
    sendingRef,
    streamAbortRef,
  };
}
