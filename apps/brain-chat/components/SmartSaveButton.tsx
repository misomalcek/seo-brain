'use client';

import { useState, useEffect, useRef } from 'react';
import { generateFile, detectFormats, createFile } from '@/lib/api';
import { useToast } from './Toast';
import type { GenerateFormat } from '@/lib/types';

interface SmartSaveButtonProps {
  content: string;
}

const FORMAT_LABELS: Record<GenerateFormat, { label: string; icon: string }> = {
  md: { label: 'Markdown', icon: '📝' },
  html: { label: 'HTML', icon: '🌐' },
  docx: { label: 'Word', icon: '📄' },
  xlsx: { label: 'Excel', icon: '📊' },
  pptx: { label: 'PowerPoint', icon: '📽️' },
  csv: { label: 'CSV', icon: '📋' },
  json: { label: 'JSON', icon: '{}' },
  txt: { label: 'Text', icon: '📃' },
};

const TEXT_FORMATS: GenerateFormat[] = ['md', 'txt', 'html', 'csv', 'json'];

export function SmartSaveButton({ content }: SmartSaveButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [filename, setFilename] = useState('brain-export');
  const [suggestedFormats, setSuggestedFormats] = useState<GenerateFormat[]>(['md']);
  const menuRef = useRef<HTMLDivElement>(null);
  const { addToast } = useToast();

  // Detect best formats when opening
  useEffect(() => {
    if (isOpen && content) {
      detectFormats(content)
        .then(d => setSuggestedFormats(d.formats))
        .catch(() => setSuggestedFormats(['md']));
    }
  }, [isOpen, content]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const handleSave = async (format: GenerateFormat) => {
    setSaving(true);
    try {
      if (TEXT_FORMATS.includes(format)) {
        // Text formats use the simple create endpoint
        const ext = format === 'md' ? '.md' : format === 'html' ? '.html' : format === 'csv' ? '.csv' : format === 'json' ? '.json' : '.txt';
        await createFile(`${filename}${ext}`, content);
      } else {
        // Binary formats use the generate endpoint
        await generateFile(content, format, filename);
      }
      setSaved(format);
      setIsOpen(false);
      addToast(`Subor ulozeny ako ${FORMAT_LABELS[format].label}`, 'success');
      setTimeout(() => setSaved(null), 3000);
    } catch (err) {
      addToast('Nepodarilo sa ulozit subor', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return (
      <span className="text-xs text-green-400 px-1.5 py-0.5">
        Ulozene ({FORMAT_LABELS[saved as GenerateFormat]?.label})
      </span>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={saving}
        className="p-1.5 rounded transition-all text-xs cursor-pointer text-muted-foreground hover:text-primary hover:bg-primary/10"
        title="Ulozit do suboru"
      >
        {saving ? (
          <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" strokeDasharray="60" strokeDashoffset="20" />
          </svg>
        ) : (
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
          </svg>
        )}
      </button>

      {isOpen && (
        <div className="absolute bottom-full right-0 mb-1 w-56 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
          {/* Filename input */}
          <div className="p-2 border-b border-border">
            <input
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder="Nazov suboru"
              className="w-full px-2 py-1 text-xs bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>

          {/* Suggested formats */}
          {suggestedFormats.length > 0 && (
            <div className="px-2 pt-1.5 pb-0.5">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Odporucane</div>
              {suggestedFormats.map(fmt => (
                <button
                  key={fmt}
                  onClick={() => handleSave(fmt)}
                  disabled={saving}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-foreground hover:bg-primary/10 rounded-lg transition-colors"
                >
                  <span>{FORMAT_LABELS[fmt].icon}</span>
                  <span className="font-medium">{FORMAT_LABELS[fmt].label}</span>
                  <span className="text-muted-foreground ml-auto">.{fmt}</span>
                </button>
              ))}
            </div>
          )}

          {/* All formats */}
          <div className="px-2 pt-1 pb-2 border-t border-border/50">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Vsetky formaty</div>
            <div className="grid grid-cols-2 gap-0.5">
              {(Object.keys(FORMAT_LABELS) as GenerateFormat[])
                .filter(f => !suggestedFormats.includes(f))
                .map(fmt => (
                  <button
                    key={fmt}
                    onClick={() => handleSave(fmt)}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-card rounded transition-colors"
                  >
                    <span className="text-[10px]">{FORMAT_LABELS[fmt].icon}</span>
                    <span>.{fmt}</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
