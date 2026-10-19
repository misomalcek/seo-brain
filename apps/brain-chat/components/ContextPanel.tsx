'use client';

import { useState, useEffect } from 'react';
import type { ContextItem, BrandAsset } from '@/lib/types';
import { listBrandAssets, getBrandAsset } from '@/lib/api';

const TYPE_ICONS: Record<string, string> = {
  file: '📁',
  report: '📋',
  framework: '📐',
  'brand-asset': '🏢',
};

interface ContextPanelProps {
  items: ContextItem[];
  onRemove: (id: string) => void;
  onAddBrandAsset: (item: ContextItem) => void;
  activeSiteId: string | null;
}

export function ContextPanel({ items, onRemove, onAddBrandAsset, activeSiteId }: ContextPanelProps) {
  const [showBrandPicker, setShowBrandPicker] = useState(false);

  return (
    <div className="border border-border rounded-xl bg-surface px-3 py-2 mb-3">
      {/* Context items */}
      {items.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 items-center max-h-[100px] sm:max-h-[120px] overflow-y-auto">
          <span className="text-xs text-muted-foreground mr-1">Kontext:</span>
          {items.map(item => (
            <span
              key={item.id}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/5 border border-primary/20 text-xs"
              title={item.label}
            >
              <span>{item.icon || TYPE_ICONS[item.type] || '📄'}</span>
              <span className="max-w-[120px] truncate text-foreground">{item.label}</span>
              <button
                onClick={() => onRemove(item.id)}
                className="ml-0.5 text-muted-foreground hover:text-red-400 transition-colors cursor-pointer"
                title="Odstranit z kontextu"
              >
                ×
              </button>
            </span>
          ))}
          <button
            onClick={() => setShowBrandPicker(!showBrandPicker)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors cursor-pointer"
            title="Pridat brand asset"
          >
            + Brand
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Kontext je prázdny — pridajte súbory, datasety alebo brand assets cez nástroje.</span>
          <button
            onClick={() => setShowBrandPicker(!showBrandPicker)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors cursor-pointer shrink-0"
            title="Pridat brand asset"
          >
            + Brand
          </button>
        </div>
      )}

      {/* Brand asset picker */}
      {showBrandPicker && (
        <BrandAssetPicker
          activeSiteId={activeSiteId}
          existingIds={new Set(items.filter(i => i.type === 'brand-asset').map(i => i.id))}
          onAdd={(item) => {
            onAddBrandAsset(item);
          }}
          onClose={() => setShowBrandPicker(false)}
        />
      )}
    </div>
  );
}

// Brand Asset Picker sub-component
function BrandAssetPicker({
  activeSiteId,
  existingIds,
  onAdd,
  onClose,
}: {
  activeSiteId: string | null;
  existingIds: Set<string>;
  onAdd: (item: ContextItem) => void;
  onClose: () => void;
}) {
  const [assets, setAssets] = useState<BrandAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  // Load assets on mount
  useEffect(() => {
    listBrandAssets(activeSiteId || undefined)
      .then(data => setAssets(data.assets))
      .catch(err => console.error('Failed to load brand assets:', err))
      .finally(() => setLoading(false));
  }, [activeSiteId]);

  const handleAdd = async (asset: BrandAsset) => {
    setLoadingId(asset.id);
    try {
      const full = await getBrandAsset(asset.id);
      onAdd({
        id: `brand-${asset.id}`,
        type: 'brand-asset',
        label: asset.title,
        content: full.content || '',
        icon: '🏢',
      });
    } catch (err) {
      console.error('Failed to load brand asset:', err);
    } finally {
      setLoadingId(null);
    }
  };

  const ASSET_TYPE_ICONS: Record<string, string> = {
    'voice-guide': '🗣️',
    'writing-dna': '✍️',
    'style-guide': '🎨',
    'topic-clusters': '🗂️',
    'seo-strategy': '📈',
    'web-architecture': '🏗️',
    'sitemap': '🗺️',
    'quality-checklist-seo': '✅',
    'quality-checklist-content': '✅',
    'custom': '📝',
  };

  return (
    <div className="mt-2 border-t border-border pt-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground">Brand Assets</span>
        <button
          onClick={onClose}
          className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
        >
          ✕
        </button>
      </div>
      {loading ? (
        <div className="text-xs text-muted-foreground animate-pulse py-2">Nacitavam...</div>
      ) : assets.length === 0 ? (
        <div className="text-xs text-muted-foreground py-2">Ziadne brand assets</div>
      ) : (
        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
          {assets.map(asset => {
            const isAdded = existingIds.has(`brand-${asset.id}`);
            return (
              <button
                key={asset.id}
                onClick={() => !isAdded && handleAdd(asset)}
                disabled={isAdded || loadingId === asset.id}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors cursor-pointer ${
                  isAdded
                    ? 'bg-primary/10 border border-primary/30 text-primary'
                    : 'border border-border hover:border-primary/30 hover:bg-primary/5 text-muted-foreground hover:text-foreground'
                } disabled:opacity-50`}
              >
                <span>{ASSET_TYPE_ICONS[asset.assetType] || '📝'}</span>
                <span className="max-w-[100px] truncate">{asset.title}</span>
                {isAdded && <span className="text-primary">✓</span>}
                {loadingId === asset.id && <span className="animate-pulse">...</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
