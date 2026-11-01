'use client';

import { useEffect, useState } from 'react';
import { LANGS, useI18n } from '@/lib/i18n';

type SecretState = { set: boolean; last4: string };

type AdminSettings = {
  ui_language: string;
  speech_language_override: string;
  reply_language_override: string;
  endpoint_mode: 'anthropic' | 'compatible';
  endpoint_base_url: string;
  endpoint_model: string;
  gsc_site_url: string;
  ga4_property_id: string;
  features: Record<string, boolean>;
  paths: Record<string, string>;
  secrets: Record<string, SecretState>;
};

const APP_IDS = ['chats', 'files', 'agents', 'personas', 'calendar', 'vectors', 'tools', 'graph', 'data-viewer', 'memory', 'docs', 'search'];

const empty = {
  ui_language: 'en',
  speech_language: '',
  reply_language: '',
  endpoint_mode: 'anthropic' as 'anthropic' | 'compatible',
  endpoint_base_url: '',
  endpoint_model: '',
  anthropic_api_key: '',
  endpoint_api_key: '',
  ahrefs_api_key: '',
  crux_api_key: '',
  cloudflare_api_token: '',
  serpapi_api_key: '',
  gsc_service_account_json: '',
  gsc_site_url: '',
  ga4_service_account_json: '',
  ga4_property_id: '',
  features: {} as Record<string, boolean>,
};

export function SettingsPanel() {
  const { t, refresh } = useI18n();
  const [form, setForm] = useState(empty);
  const [secrets, setSecrets] = useState<Record<string, SecretState>>({});
  const [paths, setPaths] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/admin/settings', { credentials: 'include' })
      .then(r => r.json())
      .then((data: AdminSettings) => {
        setForm(prev => ({
          ...prev,
          ui_language: data.ui_language || 'en',
          speech_language: data.speech_language_override || '',
          reply_language: data.reply_language_override || '',
          endpoint_mode: data.endpoint_mode || 'anthropic',
          endpoint_base_url: data.endpoint_base_url || '',
          endpoint_model: data.endpoint_model || '',
          gsc_site_url: data.gsc_site_url || '',
          ga4_property_id: data.ga4_property_id || '',
          features: data.features || {},
        }));
        setSecrets(data.secrets || {});
        setPaths(data.paths || {});
      })
      .catch(() => setStatus(t('obsError')));
  }, [t]);

  const set = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  const save = async () => {
    setBusy(true);
    setStatus('');
    const res = await fetch('/api/admin/settings', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setStatus(data.error || t('obsError'));
      return;
    }
    setStatus(t('saved'));
    setForm(prev => ({
      ...prev,
      anthropic_api_key: '',
      endpoint_api_key: '',
      ahrefs_api_key: '',
      crux_api_key: '',
      cloudflare_api_token: '',
      serpapi_api_key: '',
      gsc_service_account_json: '',
      ga4_service_account_json: '',
    }));
    if (data.settings?.secrets) setSecrets(data.settings.secrets);
    refresh();
  };

  const test = async (target: string) => {
    setStatus('');
    const res = await fetch('/api/admin/settings/test', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target }),
    });
    const data = await res.json().catch(() => ({ detail: t('obsError') }));
    setStatus(data.detail || t('obsError'));
  };

  const secretNote = (field: string) => secrets[field]?.set
    ? `${t('keySet')} ····${secrets[field].last4}`
    : t('keyMissing');

  return (
    <div className="h-full overflow-y-auto px-4 py-4 space-y-6 text-sm">
      <Section title={t('language')} help={t('languageHelp')}>
        <Select label={t('uiLanguage')} value={form.ui_language} onChange={v => set('ui_language', v)}
          options={LANGS.map(l => ({ id: l.id, label: l.label }))} />
        <Select label={t('speechLanguage')} value={form.speech_language} onChange={v => set('speech_language', v)}
          options={[{ id: '', label: t('follow') }, ...LANGS.map(l => ({ id: l.id, label: l.label }))]} />
        <Select label={t('replyLanguage')} value={form.reply_language} onChange={v => set('reply_language', v)}
          options={[{ id: '', label: t('follow') }, ...LANGS.map(l => ({ id: l.id, label: l.label }))]} />
      </Section>

      <Section title={t('endpoint')} help={t('endpointHelp')}>
        <Select label={t('endpoint')} value={form.endpoint_mode} onChange={v => set('endpoint_mode', v)}
          options={[{ id: 'anthropic', label: t('modeAnthropic') }, { id: 'compatible', label: t('modeCompatible') }]} />
        <Field label={t('claudeKey')} note={secretNote('anthropic_api_key')} value={form.anthropic_api_key} onChange={v => set('anthropic_api_key', v)} secret />
        <button type="button" onClick={() => test('anthropic')} className="text-xs text-primary">{t('test')}</button>
        <Field label={t('baseUrl')} value={form.endpoint_base_url} onChange={v => set('endpoint_base_url', v)} placeholder="http://127.0.0.1:8080/v1" />
        <Field label={t('endpointKey')} note={secretNote('endpoint_api_key')} value={form.endpoint_api_key} onChange={v => set('endpoint_api_key', v)} secret />
        <Field label={t('endpointModel')} value={form.endpoint_model} onChange={v => set('endpoint_model', v)} />
        <button type="button" onClick={() => test('endpoint')} className="text-xs text-primary">{t('test')}</button>
      </Section>

      <Section title={t('sources')} help={t('sourcesHelp')}>
        <Field label={t('gscSite')} value={form.gsc_site_url} onChange={v => set('gsc_site_url', v)} placeholder="https://example.com" />
        <Field label={t('gscJson')} note={secretNote('gsc_service_account_json')} value={form.gsc_service_account_json} onChange={v => set('gsc_service_account_json', v)} area />
        <button type="button" onClick={() => test('gsc')} className="text-xs text-primary">{t('test')}</button>
        <Field label={t('ga4Property')} value={form.ga4_property_id} onChange={v => set('ga4_property_id', v)} />
        <Field label={t('ga4Json')} note={secretNote('ga4_service_account_json')} value={form.ga4_service_account_json} onChange={v => set('ga4_service_account_json', v)} area />
        <button type="button" onClick={() => test('ga4')} className="text-xs text-primary">{t('test')}</button>
        <Field label={t('ahrefsKey')} note={secretNote('ahrefs_api_key')} value={form.ahrefs_api_key} onChange={v => set('ahrefs_api_key', v)} secret />
        <button type="button" onClick={() => test('ahrefs')} className="text-xs text-primary">{t('test')}</button>
        <Field label={t('cruxKey')} note={secretNote('crux_api_key')} value={form.crux_api_key} onChange={v => set('crux_api_key', v)} secret />
        <button type="button" onClick={() => test('crux')} className="text-xs text-primary">{t('test')}</button>
        <Field label={t('cloudflareKey')} note={secretNote('cloudflare_api_token')} value={form.cloudflare_api_token} onChange={v => set('cloudflare_api_token', v)} secret />
        <button type="button" onClick={() => test('cloudflare')} className="text-xs text-primary">{t('test')}</button>
        <Field label={t('serpapiKey')} note={secretNote('serpapi_api_key')} value={form.serpapi_api_key} onChange={v => set('serpapi_api_key', v)} secret />
        <button type="button" onClick={() => test('serpapi')} className="text-xs text-primary">{t('test')}</button>
      </Section>

      <Section title={t('apps')} help={t('appsHelp')}>
        <div className="grid grid-cols-2 gap-2">
          {APP_IDS.map(id => (
            <label key={id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
              <input
                type="checkbox"
                checked={form.features[id] !== false}
                onChange={e => setForm(prev => ({ ...prev, features: { ...prev.features, [id]: e.target.checked } }))}
              />
              <span>{t(`dock.${id}`) === `dock.${id}` ? t(`panel.${id}`) : t(`dock.${id}`)}</span>
            </label>
          ))}
        </div>
      </Section>

      <Section title={t('storage')} help={t('storageHelp')}>
        <ul className="space-y-1 text-xs text-muted-foreground">
          {Object.entries(paths).map(([name, value]) => (
            <li key={name}><span className="text-foreground">{name}</span> · {value}</li>
          ))}
        </ul>
      </Section>

      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={busy} className="rounded-xl bg-primary px-4 py-2 text-white font-medium disabled:opacity-50">
          {t('save')}
        </button>
        {status && <span className="text-xs text-muted-foreground">{status}</span>}
      </div>
    </div>
  );
}

function Section({ title, help, children }: { title: string; help: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground mt-1">{help}</p>
      </div>
      {children}
    </section>
  );
}

function Field({ label, value, onChange, note, secret, area, placeholder }: {
  label: string; value: string; onChange: (value: string) => void;
  note?: string; secret?: boolean; area?: boolean; placeholder?: string;
}) {
  const className = 'w-full rounded-xl border border-border bg-card px-3 py-2 text-foreground';
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{label}{note ? ` · ${note}` : ''}</span>
      {area ? (
        <textarea className={`${className} min-h-24 font-mono text-xs`} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
      ) : (
        <input className={className} type={secret ? 'password' : 'text'} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
      )}
    </label>
  );
}

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (value: string) => void;
  options: { id: string; label: string }[];
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <select className="w-full rounded-xl border border-border bg-card px-3 py-2" value={value} onChange={e => onChange(e.target.value)}>
        {options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </label>
  );
}
