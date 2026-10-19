'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// SVG icon set — consistent, no emoji
function IconCopy({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}
function IconDownload({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  );
}
function IconShare({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  );
}
function IconDelete({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}
function IconExpand({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
    </svg>
  );
}
function IconClose({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

// -----------------------------------------------------------------------

export interface HtmlDocumentViewerProps {
  // Content source — one of:
  srcUrl?: string;    // URL-based (reports, dashboards)
  srcDoc?: string;    // Inline HTML (already sanitized before passing)

  // Metadata
  title: string;
  subtitle?: string;

  // Display
  mode?: 'inline' | 'panel' | 'page';
  maxHeight?: number;  // inline mode (default 400)

  // Toolbar actions
  onCopy?: () => void;
  onDownload?: () => void;
  onShare?: () => void;
  onDelete?: () => void;

  // State flags
  isShared?: boolean;
  className?: string;
}

type IframeStatus = 'loading' | 'loaded' | 'error';

export function HtmlDocumentViewer({
  srcUrl,
  srcDoc,
  title,
  subtitle,
  mode = 'inline',
  maxHeight = 400,
  onCopy,
  onDownload,
  onShare,
  onDelete,
  isShared = false,
  className = '',
}: HtmlDocumentViewerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [iframeStatus, setIframeStatus] = useState<IframeStatus>('loading');
  const [iframeHeight, setIframeHeight] = useState(120);
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const toolbarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasAnyAction = onCopy || onDownload || onShare || onDelete;

  // Close fullscreen on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) setIsFullscreen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isFullscreen]);

  // Auto-hide toolbar in fullscreen after 3s idle
  const resetToolbarTimer = useCallback(() => {
    setToolbarVisible(true);
    if (toolbarTimerRef.current) clearTimeout(toolbarTimerRef.current);
    toolbarTimerRef.current = setTimeout(() => setToolbarVisible(false), 3000);
  }, []);

  useEffect(() => {
    if (isFullscreen) {
      resetToolbarTimer();
      return () => { if (toolbarTimerRef.current) clearTimeout(toolbarTimerRef.current); };
    }
    setToolbarVisible(true);
  }, [isFullscreen, resetToolbarTimer]);

  // Auto-resize for srcDoc inline mode via postMessage
  useEffect(() => {
    if (!srcDoc || mode !== 'inline') return;
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'hdv-height' && typeof e.data.height === 'number') {
        setIframeHeight(Math.min(e.data.height + 4, maxHeight));
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [srcDoc, mode, maxHeight]);

  // Reset status when source changes
  useEffect(() => {
    setIframeStatus('loading');
  }, [srcUrl, srcDoc]);

  // Build srcDoc with height reporter for inline artifacts
  const builtSrcDoc = srcDoc
    ? `${srcDoc}<script>
        function reportHeight(){window.parent.postMessage({type:'hdv-height',height:document.body.scrollHeight},'*');}
        window.addEventListener('load',reportHeight);
        setTimeout(reportHeight,300);
      </script>`
    : undefined;

  const toolbar = hasAnyAction ? (
    <div className="flex items-center gap-1">
      {onCopy && (
        <button
          onClick={onCopy}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card transition-colors cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
          title="Kopirovat HTML"
        >
          <IconCopy className="h-3.5 w-3.5" />
        </button>
      )}
      {onDownload && (
        <button
          onClick={onDownload}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card transition-colors cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
          title="Stiahnut HTML"
        >
          <IconDownload className="h-3.5 w-3.5" />
        </button>
      )}
      {onShare && (
        <button
          onClick={onShare}
          className={`p-1.5 rounded-lg transition-colors cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center ${
            isShared
              ? 'text-green-400 hover:text-green-300 hover:bg-green-500/10'
              : 'text-muted-foreground hover:text-foreground hover:bg-card'
          }`}
          title={isShared ? 'Vypnut zdielanie' : 'Zdielat verejne'}
        >
          <IconShare className="h-3.5 w-3.5" />
        </button>
      )}
      {onDelete && (
        <button
          onClick={onDelete}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
          title="Vymazat"
        >
          <IconDelete className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  ) : null;

  // ─── Fullscreen overlay ───────────────────────────────────────────────
  if (isFullscreen) {
    return (
      <div
        className="fixed inset-0 z-[100] bg-[#0a0f1e]"
        onMouseMove={resetToolbarTimer}
        onTouchStart={resetToolbarTimer}
      >
        {/* Skip link for keyboard users */}
        <a href="#hdv-after-fs" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-10 focus:px-3 focus:py-1.5 focus:bg-card focus:text-foreground focus:rounded-lg focus:text-sm">
          Preskocit nahlad
        </a>

        <iframe
          src={srcUrl}
          srcDoc={builtSrcDoc}
          sandbox="allow-scripts allow-popups"
          className="w-full h-full border-0"
          title={`Fullscreen: ${title}`}
          aria-label={`Fullscreen: ${title}`}
          onLoad={() => setIframeStatus('loaded')}
          onError={() => setIframeStatus('error')}
        />

        {/* Glass toolbar — auto-hides */}
        <div
          className={`absolute bottom-4 left-1/2 -translate-x-1/2 transition-all duration-300 ${
            toolbarVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
          }`}
        >
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl backdrop-blur-xl bg-white/10 border border-white/20 shadow-2xl">
            <span className="text-sm font-medium text-white mr-2 max-w-[200px] truncate">{title}</span>
            {toolbar}
            <div className="w-px h-5 bg-white/20 mx-1" />
            <button
              onClick={() => setIsFullscreen(false)}
              className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
              title="Zavriet fullscreen (Esc)"
            >
              <IconClose className="h-4 w-4" />
            </button>
          </div>
        </div>

        <span id="hdv-after-fs" />
      </div>
    );
  }

  // ─── Inline / Panel / Page modes ─────────────────────────────────────
  const iframeHeight_ = mode === 'inline' ? Math.max(iframeHeight, 60) : undefined;
  const iframeStyle = mode === 'inline' ? { height: iframeHeight_ } : { minHeight: mode === 'panel' ? 'min(400px, 60vh)' : undefined };

  return (
    <div className={`rounded-xl border border-border overflow-hidden ${className}`}>
      {/* Toolbar header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface-hover border-b border-border-subtle shrink-0">
        <div className="flex-1 min-w-0 mr-2">
          <span className="text-xs font-medium text-foreground truncate block">{title}</span>
          {subtitle && <span className="text-[10px] text-muted-foreground">{subtitle}</span>}
        </div>
        <div className="flex items-center gap-0.5">
          {toolbar}
          {/* Fullscreen button — always shown */}
          <button
            onClick={() => setIsFullscreen(true)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card transition-colors cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
            title="Fullscreen"
          >
            <IconExpand className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Skip link */}
      <a href="#hdv-after" className="sr-only focus:not-sr-only focus:block focus:px-3 focus:py-1.5 focus:text-xs focus:text-muted-foreground">
        Preskocit HTML nahlad
      </a>

      {/* iframe area */}
      <div className={`relative bg-white dark:bg-gray-50 ${mode !== 'inline' ? 'flex-1' : ''}`}>
        {iframeStatus === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface animate-pulse z-10 min-h-[60px]">
            <span className="text-xs text-muted-foreground">Nacitavam...</span>
          </div>
        )}
        {iframeStatus === 'error' && (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center min-h-[120px]">
            <span className="text-2xl mb-2">⚠️</span>
            <p className="text-sm text-muted-foreground">Obsah sa nepodarilo nacitat.</p>
          </div>
        )}
        <iframe
          src={srcUrl}
          srcDoc={builtSrcDoc}
          sandbox="allow-scripts allow-popups"
          className={`w-full border-0 ${iframeStatus === 'error' ? 'hidden' : ''}`}
          style={iframeStyle}
          title={title}
          aria-label={`HTML dokument: ${title}`}
          onLoad={() => setIframeStatus('loaded')}
          onError={() => setIframeStatus('error')}
        />
      </div>

      <span id="hdv-after" />
    </div>
  );
}
