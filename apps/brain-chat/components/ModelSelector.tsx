'use client';

import { useState, useRef, useEffect } from 'react';

export type ModelOption = 'default' | 'auto' | 'opus-4.5' | 'opus-4.6' | 'sonnet-4.5' | 'sonnet-4.6' | 'haiku-4.5';

interface ModelSelectorProps {
  value: ModelOption;
  onChange: (model: ModelOption) => void;
}

const MODEL_OPTIONS: { id: ModelOption; label: string; short: string; description: string }[] = [
  { id: 'default', label: 'Default', short: 'D', description: 'Sonnet 4.5 (systémový)' },
  { id: 'auto', label: 'Auto', short: 'A', description: 'Podľa agenta' },
  { id: 'sonnet-4.6', label: 'Sonnet 4.6', short: 'S+', description: 'Najnovší Sonnet' },
  { id: 'sonnet-4.5', label: 'Sonnet 4.5', short: 'S', description: 'Rýchly a schopný' },
  { id: 'opus-4.6', label: 'Opus 4.6', short: 'O+', description: 'Najsilnejší model' },
  { id: 'opus-4.5', label: 'Opus 4.5', short: 'O', description: 'Silný reasoning' },
  { id: 'haiku-4.5', label: 'Haiku 4.5', short: 'H', description: 'Najrýchlejší' },
];

export function ModelSelector({ value, onChange }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const current = MODEL_OPTIONS.find(m => m.id === value) || MODEL_OPTIONS[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-surface-hover border border-transparent hover:border-border transition-colors cursor-pointer"
        title={`Model: ${current.label}`}
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
        </svg>
        <span>{current.short}</span>
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-48 rounded-lg border border-border bg-surface shadow-lg z-50 py-1">
          {MODEL_OPTIONS.map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => { onChange(opt.id); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-surface-hover transition-colors cursor-pointer ${
                value === opt.id ? 'text-primary font-medium' : 'text-foreground'
              }`}
            >
              <span className="w-5 text-center font-mono text-[10px] text-muted-foreground">{opt.short}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium">{opt.label}</div>
                <div className="text-[10px] text-muted-foreground">{opt.description}</div>
              </div>
              {value === opt.id && (
                <svg className="h-3.5 w-3.5 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
