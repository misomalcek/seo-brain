'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { Message, BackgroundJobSummary, ContextItem, AgentInfo } from '@/lib/types';

interface UseBackgroundJobsOptions {
  isAdmin: boolean;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  conversationIdRef: React.MutableRefObject<string | null>;
  contextItemsRef: React.MutableRefObject<ContextItem[]>;
  activePersonaId: string | null;
  activeAgent: AgentInfo | null;
  saveConversation: (messages: any[], opts?: any) => Promise<string | null>;
  loadConversation: (id: string) => Promise<any[] | null>;
  addToast: (message: string, type: 'success' | 'error') => void;
  // Refs from useChatStream for convert-to-background
  sendingRef: React.MutableRefObject<boolean>;
  streamPayloadRef: React.MutableRefObject<any>;
  convertingToBackgroundRef: React.MutableRefObject<boolean>;
  streamAbortRef: React.MutableRefObject<AbortController | null>;
}

export function useBackgroundJobs({
  isAdmin,
  messages,
  setMessages,
  setInput,
  conversationIdRef,
  contextItemsRef,
  activePersonaId,
  activeAgent,
  saveConversation,
  loadConversation,
  addToast,
  sendingRef,
  streamPayloadRef,
  convertingToBackgroundRef,
  streamAbortRef,
}: UseBackgroundJobsOptions) {
  const [backgroundMode, setBackgroundMode] = useState(false);
  const [pendingJobs, setPendingJobs] = useState<BackgroundJobSummary[]>([]);
  const pendingJobsRef = useRef<BackgroundJobSummary[]>([]);
  pendingJobsRef.current = pendingJobs;

  // Load pending/running jobs from DB on startup (admin only)
  useEffect(() => {
    if (!isAdmin) return;
    fetch('/api/jobs', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((data: { jobs: BackgroundJobSummary[] } | null) => {
        if (!data) return;
        const active = data.jobs.filter(j => j.status === 'pending' || j.status === 'running');
        if (active.length === 0) return;
        setPendingJobs(data.jobs);
        const currentConvId = conversationIdRef.current;
        if (currentConvId) {
          const jobsForCurrent = active.filter(j => j.conversation_id === currentConvId);
          if (jobsForCurrent.length > 0) {
            setMessages(prev => {
              const existingJobIds = new Set(prev.map(m => m.backgroundJobId).filter(Boolean));
              const toAdd = jobsForCurrent.filter(j => !existingJobIds.has(j.id));
              if (toAdd.length === 0) return prev;
              return [...prev, ...toAdd.map(j => ({ id: `bg-${j.id}`, role: 'assistant' as const, content: '', backgroundJobId: j.id, toolsUsed: [] }))];
            });
          }
        }
      })
      .catch(() => {});
  }, [isAdmin]);

  // Poll for completions (every 10s, only when active jobs exist)
  useEffect(() => {
    if (!isAdmin) return;
    const active = pendingJobs.filter(j => j.status === 'pending' || j.status === 'running');
    if (active.length === 0) return;
    let isMounted = true;
    const interval = setInterval(async () => {
      if (!isMounted) return;
      try {
        const res = await fetch('/api/jobs', { credentials: 'include' });
        if (!res.ok || !isMounted) return;
        const { jobs }: { jobs: BackgroundJobSummary[] } = await res.json();
        if (!isMounted) return;
        setPendingJobs(jobs);
        const newlyCompleted = jobs.filter(j =>
          (j.status === 'completed' || j.status === 'error') &&
          active.some(a => a.id === j.id)
        );
        for (const job of newlyCompleted) {
          if (!isMounted) break;
          if (job.status === 'completed') {
            addToast(`⚡ Hotovo: ${job.title}`, 'success');
            if (job.conversation_id && conversationIdRef.current === job.conversation_id) {
              const msgs = await loadConversation(job.conversation_id);
              if (msgs && isMounted) {
                setMessages(msgs.map((m, i) => ({ id: `loaded-${(m as any).id || i}`, role: (m as any).role as Message['role'], content: (m as any).content, personaId: (m as any).persona_id || undefined })));
              }
            }
          } else {
            addToast(`❌ Background task zlyhal: ${job.title}`, 'error');
          }
          if (isMounted) setMessages(prev => prev.filter(m => m.backgroundJobId !== job.id));
        }
      } catch { /* ignore polling errors */ }
    }, 10000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [pendingJobs, addToast, loadConversation]);

  // Send message as background job
  const sendBackgroundMessage = useCallback(async (messageContent: string) => {
    if (!messageContent.trim() || sendingRef.current) return;
    const content = activeAgent
      ? `[Agent: ${activeAgent.name}] ${messageContent.trim()}`
      : messageContent.trim();
    const userMessage: Message = { id: Date.now().toString(), role: 'user', content };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setBackgroundMode(false);

    const jobPlaceholderId = `bgph-${Date.now()}`;
    const jobTitle = content.slice(0, 60) + (content.length > 60 ? '...' : '');
    setMessages(prev => [...prev, { id: jobPlaceholderId, role: 'assistant', content: '', backgroundJobId: jobPlaceholderId, toolsUsed: [] }]);

    try {
      const convId = await saveConversation(
        updatedMessages.map(m => ({ role: m.role === 'tool' ? 'assistant' as const : m.role, content: m.content })),
        { conversationId: conversationIdRef.current || undefined, personaId: activePersonaId || undefined }
      );
      if (convId) conversationIdRef.current = convId;

      const res = await fetch('/api/jobs', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages.map(m => ({ role: m.role === 'tool' ? 'assistant' : m.role, content: m.content })),
          personaId: activePersonaId || undefined,
          conversationId: conversationIdRef.current || undefined,
          title: jobTitle,
          contextItems: contextItemsRef.current.length > 0 ? contextItemsRef.current.map(c => ({ type: c.type, label: c.label, content: c.content })) : undefined,
        }),
      });
      if (res.status === 429) {
        const data = await res.json();
        addToast(data.message || 'Background kapacita plná, skús o chvíľu', 'error');
        setMessages(prev => prev.filter(m => m.id !== jobPlaceholderId));
        return;
      }
      if (!res.ok) throw new Error('Failed to start job');
      const { jobId, title } = await res.json();
      setMessages(prev => prev.map(m => m.id === jobPlaceholderId ? { ...m, backgroundJobId: jobId } : m));
      setPendingJobs(prev => [...prev, { id: jobId, title, status: 'pending', conversation_id: conversationIdRef.current, tools_used: [], created_at: new Date().toISOString(), completed_at: null }]);
      addToast(`⚡ "${title.slice(0, 40)}" beží na pozadí`, 'success');
    } catch (err) {
      console.error('Background job error:', err);
      addToast('Chyba pri spúšťaní background jobu', 'error');
      setMessages(prev => prev.filter(m => m.id !== jobPlaceholderId));
    }
  }, [messages, activeAgent, activePersonaId, saveConversation, addToast]);

  // Convert in-progress stream to background job
  const convertToBackground = useCallback(async () => {
    if (!streamPayloadRef.current) return;
    const payload = streamPayloadRef.current;
    convertingToBackgroundRef.current = true;

    if (streamAbortRef.current) {
      streamAbortRef.current.abort();
      streamAbortRef.current = null;
    }

    const jobPlaceholderId = `bgph-${Date.now()}`;
    const lastUserMsg = payload.messages[payload.messages.length - 1];
    const jobTitle = (lastUserMsg?.content || 'Task').slice(0, 60);

    setMessages(prev => {
      const withoutPartial = prev.filter(m => m.id !== payload.assistantId);
      return [...withoutPartial, { id: jobPlaceholderId, role: 'assistant' as const, content: '', backgroundJobId: jobPlaceholderId, toolsUsed: [] }];
    });

    try {
      const convId = await saveConversation(
        payload.messages.map((m: Message) => ({ role: m.role === 'tool' ? 'assistant' as const : m.role, content: m.content })),
        { conversationId: conversationIdRef.current || undefined, personaId: payload.personaId || undefined }
      );
      if (convId) conversationIdRef.current = convId;

      const res = await fetch('/api/jobs', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: payload.messages.map((m: Message) => ({ role: m.role === 'tool' ? 'assistant' : m.role, content: m.content })),
          personaId: payload.personaId || undefined,
          conversationId: conversationIdRef.current || undefined,
          title: jobTitle,
          contextItems: contextItemsRef.current.length > 0 ? contextItemsRef.current.map(c => ({ type: c.type, label: c.label, content: c.content })) : undefined,
        }),
      });

      if (!res.ok) throw new Error('Failed to start background job');
      const { jobId, title } = await res.json();

      setMessages(prev => prev.map(m => m.id === jobPlaceholderId ? { ...m, backgroundJobId: jobId } : m));
      setPendingJobs(prev => [...prev, { id: jobId, title, status: 'pending', conversation_id: conversationIdRef.current, tools_used: [], created_at: new Date().toISOString(), completed_at: null }]);
      addToast(`⚡ Task presunutý na pozadie`, 'success');
    } catch (err) {
      console.error('Convert to background error:', err);
      addToast('Nepodarilo sa presunúť na pozadie', 'error');
      setMessages(prev => prev.filter(m => m.id !== jobPlaceholderId));
    } finally {
      convertingToBackgroundRef.current = false;
      streamPayloadRef.current = null;
    }
  }, [saveConversation, addToast]);

  return {
    backgroundMode,
    setBackgroundMode,
    pendingJobs,
    setPendingJobs,
    pendingJobsRef,
    sendBackgroundMessage,
    convertToBackground,
  };
}
