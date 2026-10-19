'use client';

import { useState, useEffect } from 'react';
import type { ChatAttachment, UserFile, UserReport } from '@/lib/types';
import type { ConversationSummary } from '@/lib/api';
import { listFiles, listReports, listConversations } from '@/lib/api';

interface AttachmentPickerProps {
  onSelect: (attachment: ChatAttachment) => void;
  onClose: () => void;
}

type Tab = 'files' | 'conversations' | 'reports';

export function AttachmentPicker({ onSelect, onClose }: AttachmentPickerProps) {
  const [tab, setTab] = useState<Tab>('files');
  const [files, setFiles] = useState<UserFile[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [reports, setReports] = useState<UserReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTab = (t: Tab) => {
    setLoading(true);
    setError(null);
    if (t === 'files') {
      listFiles(20).then(d => setFiles(d.files)).catch(() => setError('Nepodarilo sa nacitat subory')).finally(() => setLoading(false));
    } else if (t === 'conversations') {
      listConversations(20).then(d => setConversations(d.data)).catch(() => setError('Nepodarilo sa nacitat konverzacie')).finally(() => setLoading(false));
    } else {
      listReports().then(d => setReports(d.reports)).catch(() => setError('Nepodarilo sa nacitat reporty')).finally(() => setLoading(false));
    }
  };

  useEffect(() => {
    loadTab(tab);
  }, [tab]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('sk', { day: 'numeric', month: 'short' });

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 bg-background border border-border rounded-xl shadow-2xl overflow-hidden z-50 max-h-80">
      {/* Tabs */}
      <div className="flex border-b border-border">
        {([
          { id: 'files' as Tab, label: '📁 Subory' },
          { id: 'conversations' as Tab, label: '💬 Chaty' },
          { id: 'reports' as Tab, label: '📊 Reporty' },
        ]).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors cursor-pointer ${
              tab === t.id
                ? 'text-primary border-b-2 border-primary bg-primary/5'
                : 'text-muted-foreground hover:text-foreground hover:bg-card'
            }`}
          >
            {t.label}
          </button>
        ))}
        <button onClick={onClose} className="px-3 py-2.5 text-muted-foreground hover:text-foreground text-xs cursor-pointer hover:bg-card transition-colors">
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="overflow-y-auto max-h-60 p-2">
        {loading ? (
          <div className="text-center py-4 text-xs text-muted-foreground animate-pulse">Nacitavam...</div>
        ) : error ? (
          <div className="text-center py-4">
            <div className="text-xs text-red-400 mb-2">{error}</div>
            <button onClick={() => loadTab(tab)} className="text-xs text-primary hover:underline cursor-pointer">Skusit znova</button>
          </div>
        ) : tab === 'files' ? (
          files.length === 0 ? (
            <div className="text-center py-4 text-xs text-muted-foreground">Ziadne subory</div>
          ) : (
            files.map(f => (
              <button
                key={f.id}
                onClick={() => onSelect({ type: 'file', id: f.id, title: f.originalName, meta: formatSize(f.size) })}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-card text-left transition-colors cursor-pointer"
              >
                <span className="text-sm">📄</span>
                <span className="text-xs text-foreground truncate flex-1">{f.originalName}</span>
                <span className="text-xs text-muted-foreground shrink-0">{formatSize(f.size)}</span>
              </button>
            ))
          )
        ) : tab === 'conversations' ? (
          conversations.length === 0 ? (
            <div className="text-center py-4 text-xs text-muted-foreground">Ziadne konverzacie</div>
          ) : (
            conversations.map(c => (
              <button
                key={c.id}
                onClick={() => onSelect({ type: 'conversation', id: c.id, title: c.title || 'Bez nazvu', meta: formatDate(c.created_at) })}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-card text-left transition-colors cursor-pointer"
              >
                <span className="text-sm">💬</span>
                <span className="text-xs text-foreground truncate flex-1">{c.title || 'Bez nazvu'}</span>
                <span className="text-xs text-muted-foreground shrink-0">{formatDate(c.created_at)}</span>
              </button>
            ))
          )
        ) : (
          reports.length === 0 ? (
            <div className="text-center py-4 text-xs text-muted-foreground">Ziadne reporty</div>
          ) : (
            reports.slice(0, 20).map(r => (
              <button
                key={r.id}
                onClick={() => onSelect({ type: 'report', id: r.filename, title: r.toolName, meta: formatDate(r.createdAt) })}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-card text-left transition-colors cursor-pointer"
              >
                <span className="text-sm">📊</span>
                <span className="text-xs text-foreground truncate flex-1">{r.toolName}</span>
                <span className="text-xs text-muted-foreground shrink-0">{formatDate(r.createdAt)}</span>
              </button>
            ))
          )
        )}
      </div>
    </div>
  );
}
