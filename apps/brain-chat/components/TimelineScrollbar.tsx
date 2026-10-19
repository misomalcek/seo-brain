'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Message } from '@/lib/types';

interface ScrollState {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

interface TimelineScrollbarProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  messages: Message[];
}

export function TimelineScrollbar({ containerRef, messages }: TimelineScrollbarProps) {
  const [scroll, setScroll] = useState<ScrollState>({ scrollTop: 0, scrollHeight: 1, clientHeight: 1 });
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragListenersRef = useRef<{ onMove: (e: PointerEvent) => void; onUp: () => void } | null>(null);

  // Clean up any dangling pointer listeners on unmount (e.g. drag while conversation switches)
  useEffect(() => {
    return () => {
      if (dragListenersRef.current) {
        window.removeEventListener('pointermove', dragListenersRef.current.onMove);
        window.removeEventListener('pointerup', dragListenersRef.current.onUp);
        dragListenersRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setScroll({
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    });
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [containerRef]);

  const scrollToRatio = useCallback((ratio: number) => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = ratio * (el.scrollHeight - el.clientHeight);
  }, [containerRef]);

  const handleTrackPointer = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const track = trackRef.current;
    if (!track) return;
    isDraggingRef.current = true;
    setIsDragging(true);
    track.setPointerCapture(e.pointerId);

    const moveToEvent = (ev: PointerEvent | React.PointerEvent) => {
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height));
      scrollToRatio(ratio);
    };

    moveToEvent(e);

    const onMove = (ev: PointerEvent) => { if (isDraggingRef.current) moveToEvent(ev); };
    const onUp = () => {
      isDraggingRef.current = false;
      setIsDragging(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      dragListenersRef.current = null;
    };
    dragListenersRef.current = { onMove, onUp };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [scrollToRatio]);

  if (messages.length === 0) return null;

  const { scrollTop, scrollHeight, clientHeight } = scroll;
  const scrollable = scrollHeight - clientHeight;
  const isScrollable = scrollable > 10;

  const thumbHeightPct = isScrollable
    ? Math.max(8, (clientHeight / scrollHeight) * 100)
    : 100;
  const thumbTopPct = isScrollable
    ? (scrollTop / scrollable) * (100 - thumbHeightPct)
    : 0;

  const totalMessages = messages.length;
  const active = isHovered || isDragging;

  return (
    <div
      className="absolute right-0 top-0 bottom-0 flex items-stretch py-2 z-20"
      style={{
        width: active ? '16px' : '10px',
        transition: 'width 150ms ease',
        paddingRight: active ? '2px' : '1px',
        paddingLeft: active ? '2px' : '1px',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      aria-hidden="true"
    >
      {/* Track */}
      <div
        ref={trackRef}
        className="relative flex-1 rounded-full cursor-pointer select-none transition-colors duration-200"
        style={{
          background: active ? 'var(--color-border)' : 'var(--color-border-subtle)',
          opacity: active ? 1 : 0.4,
          transition: 'background 200ms ease, opacity 200ms ease',
        }}
        onPointerDown={handleTrackPointer}
        title="Timeline — klikni alebo ťahaj na prejdenie"
      >
        {/* Thumb */}
        <div
          className="absolute inset-x-0 rounded-full pointer-events-none"
          style={{
            top: `${thumbTopPct}%`,
            height: `${thumbHeightPct}%`,
            background: active ? 'var(--color-muted-foreground)' : 'var(--color-border-hover)',
            transition: 'background 200ms ease, top 60ms ease, height 60ms ease',
          }}
        />

        {/* Message markers — positioned by actual message index */}
        {messages.map((msg, idx) => {
          const isUser = msg.role === 'user';
          const isAssistant = msg.role === 'assistant' && !!msg.content;
          if (!isUser && !isAssistant) return null;

          const positionPct = totalMessages <= 1 ? 50 : (idx / (totalMessages - 1)) * 100;

          return (
            <div
              key={msg.id || idx}
              className="absolute left-1/2 -translate-x-1/2 rounded-full pointer-events-none"
              style={{
                top: `${positionPct}%`,
                width: isUser ? '6px' : '4px',
                height: isUser ? '3px' : '2px',
                marginTop: '-1px',
                background: isUser ? 'var(--color-primary)' : 'var(--color-muted-foreground)',
                opacity: active ? (isUser ? 0.9 : 0.5) : (isUser ? 0.6 : 0.25),
                transition: 'opacity 200ms ease',
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
