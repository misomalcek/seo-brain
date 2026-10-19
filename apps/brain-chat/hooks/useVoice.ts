'use client';

import { useState, useEffect, useRef } from 'react';
import { speak, isSTTSupported, startListening } from '@/lib/voice';

/**
 * Manages voice features: conversation mode (auto TTS → STT cycle).
 * Extracted from page.tsx voice-related state + effects.
 */
export function useVoice(
  isLoading: boolean,
  messages: Array<{ role: string; content: string }>,
  setInput: (text: string) => void,
) {
  const [conversationMode, setConversationMode] = useState(false);
  const prevLoadingRef = useRef(false);

  // Conversation mode: auto-speak response, then re-listen
  useEffect(() => {
    if (prevLoadingRef.current && !isLoading && conversationMode) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.role === 'assistant' && lastMsg.content) {
        speak(lastMsg.content, () => {
          if (conversationMode && isSTTSupported()) {
            startListening(
              (text) => { if (text) setInput(text); },
              () => {}
            );
          }
        });
      }
    }
    prevLoadingRef.current = isLoading;
  }, [isLoading, conversationMode, messages, setInput]);

  return {
    conversationMode,
    setConversationMode,
  };
}
