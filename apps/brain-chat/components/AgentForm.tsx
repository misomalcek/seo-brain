'use client';

/**
 * AgentForm — Sprint G (2026-05-22)
 *
 * Two modes:
 *   mode="create"  → full form: slug, name, description, system_prompt, model, keywords, color, icon
 *   mode="extend"  → lite form: custom_description, extra_system_prompt, extra_keywords
 *                    for adding overrides to a base specialist
 *
 * Used from AgentsPanel "+ Agent" (create) and "✏️" per specialist (extend).
 */

import { useState } from 'react';
import type { SpecialistCard, AgentFormData, ExtensionFormData } from '@/lib/types';
import { createAgent, updateAgent, upsertSpecialistExtension } from '@/lib/api';

// ── Color picker swatches ────────────────────────────────────────────────────

const COLOR_SWATCHES = [
  '#E53E3E', '#DD6B20', '#D69E2E', '#38A169',
  '#3182CE', '#805AD5', '#D53F8C', '#319795',
  '#718096', '#2D3748',
];

const MODEL_OPTIONS = [
  { value: 'haiku',       label: 'Haiku ⚡',    desc: 'Rýchly, jednoduché úlohy' },
  { value: 'sonnet',      label: 'Sonnet',       desc: 'Vyvážený — odporúčaný' },
  { value: 'sonnet-high', label: 'Sonnet+ 🧠',   desc: 'Komplexná analýza' },
] as const;

// ── Props ────────────────────────────────────────────────────────────────────

interface CreateModeProps {
  mode: 'create';
  initialSlug?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

interface ExtendModeProps {
  mode: 'extend';
  specialist: SpecialistCard;
  onSuccess: () => void;
  onCancel: () => void;
}

type AgentFormProps = CreateModeProps | ExtendModeProps;

// ── Create form ───────────────────────────────────────────────────────────────

function CreateAgentForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const [form, setForm] = useState<AgentFormData>({
    slug: '',
    name: '',
    description: '',
    system_prompt: '',
    model: 'sonnet',
    tools: [],
    keywords: [],
    color: '#6B7280',
    icon: '🤖',
  });
  const [keywordsRaw, setKeywordsRaw] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (field: keyof AgentFormData, value: AgentFormData[keyof AgentFormData]) =>
    setForm(prev => ({ ...prev, [field]: value }));

  // Auto-derive slug from name
  const handleNameChange = (v: string) => {
    set('name', v);
    if (!form.slug || form.slug === slugify(form.name)) {
      set('slug', slugify(v));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.slug || !form.name || !form.system_prompt) {
      setError('Slug, meno a systémový prompt sú povinné');
      return;
    }

    setSaving(true);
    try {
      const keywords = keywordsRaw
        .split(',')
        .map(k => k.trim())
        .filter(Boolean);
      await createAgent({ ...form, keywords });
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Chyba pri vytváraní agenta');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name + icon row */}
      <div className="flex gap-3">
        <div className="shrink-0">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Ikona</label>
          <input
            type="text"
            value={form.icon}
            onChange={e => set('icon', e.target.value)}
            className="w-14 text-center text-xl border border-border rounded-lg px-2 py-2 bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
            maxLength={2}
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Meno agenta *</label>
          <input
            type="text"
            value={form.name}
            onChange={e => handleNameChange(e.target.value)}
            placeholder="napr. HR Writer"
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
            required
          />
        </div>
      </div>

      {/* Slug */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          ID (slug) * <span className="font-normal">— malé písmená, číslice, pomlčky</span>
        </label>
        <input
          type="text"
          value={form.slug}
          onChange={e => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-'))}
          placeholder="hr-writer"
          className="w-full border border-border rounded-lg px-3 py-2 text-sm font-mono bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
          required
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Popis (voliteľný)</label>
        <input
          type="text"
          value={form.description}
          onChange={e => set('description', e.target.value)}
          placeholder="Čo tento agent robí..."
          className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* System prompt */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Systémový prompt *</label>
        <textarea
          value={form.system_prompt}
          onChange={e => set('system_prompt', e.target.value)}
          placeholder="Si expert na... Tvoje úlohy sú..."
          rows={5}
          className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
          required
        />
      </div>

      {/* Model */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Model</label>
        <div className="grid grid-cols-3 gap-2">
          {MODEL_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => set('model', opt.value)}
              className={`px-2 py-2 rounded-xl border text-xs text-left transition-colors cursor-pointer ${
                form.model === opt.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-surface text-muted-foreground hover:border-border/80'
              }`}
            >
              <div className="font-semibold">{opt.label}</div>
              <div className="text-[10px] mt-0.5 opacity-70">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Keywords */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Keywords pre auto-routing <span className="font-normal">(oddelené čiarkou)</span>
        </label>
        <input
          type="text"
          value={keywordsRaw}
          onChange={e => setKeywordsRaw(e.target.value)}
          placeholder="hr obsah, pracovné benefity, zamestnanecká hodnota"
          className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* Color */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-2">Farba karty</label>
        <div className="flex gap-2 flex-wrap">
          {COLOR_SWATCHES.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => set('color', c)}
              className={`w-7 h-7 rounded-full transition-transform cursor-pointer ${form.color === c ? 'scale-125 ring-2 ring-offset-1 ring-foreground/30' : 'hover:scale-110'}`}
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
          <input
            type="color"
            value={form.color}
            onChange={e => set('color', e.target.value)}
            className="w-7 h-7 rounded-full cursor-pointer border border-border"
            title="Vlastná farba"
          />
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 py-2 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary/90 disabled:opacity-60 transition-opacity cursor-pointer"
        >
          {saving ? 'Vytvára sa...' : '✓ Vytvoriť agenta'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors cursor-pointer"
        >
          Zrušiť
        </button>
      </div>
    </form>
  );
}

// ── Extend form ───────────────────────────────────────────────────────────────

function ExtendSpecialistForm({
  specialist,
  onSuccess,
  onCancel,
}: {
  specialist: SpecialistCard;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const ext = specialist.extension;
  const [form, setForm] = useState<ExtensionFormData>({
    custom_description: ext?.custom_description ?? '',
    extra_system_prompt: ext?.extra_system_prompt ?? '',
    extra_keywords: ext?.extra_keywords ?? [],
  });
  const [keywordsRaw, setKeywordsRaw] = useState(
    (ext?.extra_keywords ?? []).join(', ')
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const extra_keywords = keywordsRaw
        .split(',')
        .map(k => k.trim())
        .filter(Boolean);
      await upsertSpecialistExtension(specialist.id, { ...form, extra_keywords });
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Chyba pri ukladaní');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Specialist header */}
      <div className="flex items-center gap-2 pb-2 border-b border-border">
        <span className="text-xl">{specialist.icon}</span>
        <div>
          <div className="font-bold text-sm">{specialist.nameLocalized}</div>
          <div className="text-[10px] text-muted-foreground">Rozšírenie základného špecialistu</div>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Vlastný popis <span className="font-normal">(nahrádza pôvodný v UI)</span>
        </label>
        <input
          type="text"
          value={form.custom_description}
          onChange={e => setForm(p => ({ ...p, custom_description: e.target.value }))}
          placeholder={specialist.descriptionLocalized}
          className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Extra inštrukcie <span className="font-normal">(pridané za základný prompt)</span>
        </label>
        <textarea
          value={form.extra_system_prompt}
          onChange={e => setForm(p => ({ ...p, extra_system_prompt: e.target.value }))}
          placeholder="Vždy odpovedaj v slovenčine. Zameraj sa na example.com..."
          rows={4}
          className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Extra keywords <span className="font-normal">(oddelené čiarkou)</span>
        </label>
        <input
          type="text"
          value={keywordsRaw}
          onChange={e => setKeywordsRaw(e.target.value)}
          placeholder="vlastné kľúčové slová pre routing..."
          className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {error && (
        <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 py-2 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary/90 disabled:opacity-60 transition-opacity cursor-pointer"
          style={{ backgroundColor: specialist.color }}
        >
          {saving ? 'Ukladá sa...' : '✓ Uložiť rozšírenie'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors cursor-pointer"
        >
          Zrušiť
        </button>
      </div>
    </form>
  );
}

// ── Shell (slide-in panel) ────────────────────────────────────────────────────

export function AgentForm(props: AgentFormProps) {
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 shrink-0 border-b border-border">
        <h3 className="text-sm font-bold">
          {props.mode === 'create' ? '+ Nový agent' : `✏️ Upraviť špecialistu`}
        </h3>
        <button
          onClick={props.onCancel}
          className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer p-1"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {props.mode === 'create' ? (
          <CreateAgentForm onSuccess={props.onSuccess} onCancel={props.onCancel} />
        ) : (
          <ExtendSpecialistForm
            specialist={props.specialist}
            onSuccess={props.onSuccess}
            onCancel={props.onCancel}
          />
        )}
      </div>
    </div>
  );
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
