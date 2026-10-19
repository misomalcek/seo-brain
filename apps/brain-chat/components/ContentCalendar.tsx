'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ContentItem, ContentStatus, Site } from '@/lib/types';
import { listContent, updateContentStatus, deleteContent, listSites } from '@/lib/api';
import { useToast } from './Toast';
import { ConfirmDialog } from './ConfirmDialog';
import { ContentItemForm } from './ContentItemForm';

interface ContentCalendarProps {
  isOpen: boolean;
  onClose: () => void;
  embedded?: boolean;
}

const STATUS_CONFIG: Record<ContentStatus, { label: string; icon: string; color: string }> = {
  idea: { label: 'Napady', icon: '💡', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  brief: { label: 'Briefy', icon: '📋', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  draft: { label: 'Drafty', icon: '✏️', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  review: { label: 'Review', icon: '🔍', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  published: { label: 'Publikovane', icon: '✅', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  archived: { label: 'Archiv', icon: '📦', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
};

const ALL_STATUSES: ContentStatus[] = ['idea', 'brief', 'draft', 'review', 'published', 'archived'];

export function ContentCalendar({ isOpen, onClose, embedded }: ContentCalendarProps) {
  const { addToast } = useToast();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'kanban' | 'calendar'>('list');
  const [calendarMonth, setCalendarMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterSite, setFilterSite] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<ContentItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContentItem | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [contentData, sitesData] = await Promise.all([
        listContent({
          status: filterStatus || undefined,
          site: filterSite || undefined,
          search: searchQuery || undefined,
        }),
        listSites(),
      ]);
      setItems(contentData.items);
      setSites(sitesData.sites);
    } catch (err) {
      console.error('Failed to load content:', err);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterSite, searchQuery]);

  useEffect(() => {
    if (isOpen) loadData();
  }, [isOpen, loadData]);

  const handleStatusChange = async (itemId: string, newStatus: ContentStatus) => {
    try {
      await updateContentStatus(itemId, newStatus);
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, status: newStatus } : i));
      addToast(`Status zmeneny na ${STATUS_CONFIG[newStatus].label}`, 'success');
    } catch {
      addToast('Zmena statusu zlyhala', 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteContent(deleteTarget.id);
      setItems(prev => prev.filter(i => i.id !== deleteTarget.id));
      setDeleteTarget(null);
      addToast('Polozka vymazana', 'success');
    } catch {
      addToast('Vymazanie zlyhalo', 'error');
    }
  };

  const handleFormSaved = () => {
    setShowForm(false);
    setEditingItem(null);
    loadData();
  };

  if (!isOpen) return null;

  const getDeadlineColor = (deadline: string | null) => {
    if (!deadline) return '';
    const days = (new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (days < 0) return 'text-red-400';
    if (days < 3) return 'text-orange-400';
    if (days < 7) return 'text-yellow-400';
    return 'text-muted-foreground';
  };

  const formatDeadline = (deadline: string | null) => {
    if (!deadline) return null;
    const d = new Date(deadline);
    const days = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    const dateStr = d.toLocaleDateString('sk-SK', { day: 'numeric', month: 'short' });
    if (days < 0) return `${dateStr} (${Math.abs(days)}d po termine)`;
    if (days === 0) return `${dateStr} (DNES)`;
    if (days === 1) return `${dateStr} (zajtra)`;
    return `${dateStr} (${days}d)`;
  };

  const calendarContent = (
    <div className={embedded ? "flex flex-col h-full min-h-0" : "fixed inset-y-0 right-0 z-50 w-full max-w-4xl bg-background border-l border-border shadow-xl flex flex-col"}>
      {/* Header — skip in embedded mode */}
      {!embedded && <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <span className="text-xl">📅</span>
            <h2 className="text-lg font-bold text-foreground">Content</h2>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {items.length} poloziek
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setEditingItem(null); setShowForm(true); }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-background hover:opacity-90 transition-opacity"
            >
              + Novy
            </button>
            <div className="flex rounded-lg border border-border overflow-hidden">
              {([
                { id: 'list' as const, label: 'Zoznam' },
                { id: 'kanban' as const, label: 'Kanban' },
                { id: 'calendar' as const, label: 'Kalendar' },
              ]).map(v => (
                <button
                  key={v.id}
                  onClick={() => setViewMode(v.id)}
                  className={`px-2.5 py-1 text-xs ${viewMode === v.id ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-muted'}`}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>}

        {/* Filters */}
        <div className="flex items-center gap-2 p-3 border-b border-border flex-wrap">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Hladat..."
            className="w-40 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-foreground focus:outline-none"
          >
            <option value="">Vsetky statusy</option>
            {ALL_STATUSES.map(s => (
              <option key={s} value={s}>{STATUS_CONFIG[s].icon} {STATUS_CONFIG[s].label}</option>
            ))}
          </select>
          <select
            value={filterSite}
            onChange={e => setFilterSite(e.target.value)}
            className="rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-foreground focus:outline-none"
          >
            <option value="">Vsetky weby</option>
            {sites.map(s => (
              <option key={s.id} value={s.id}>{s.domain}</option>
            ))}
          </select>
          <button
            onClick={loadData}
            disabled={loading}
            className="px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            {loading ? '...' : 'Obnovit'}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && items.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Nacitavam...</div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <span className="text-4xl mb-3">📅</span>
              <p className="text-muted-foreground text-sm mb-3">Ziadny content v kalendari</p>
              <button
                onClick={() => { setEditingItem(null); setShowForm(true); }}
                className="px-4 py-2 rounded-lg text-sm bg-primary text-background hover:opacity-90"
              >
                Vytvor prvu polozku
              </button>
            </div>
          ) : viewMode === 'calendar' ? (
            /* Calendar View */
            (() => {
              const year = calendarMonth.getFullYear();
              const month = calendarMonth.getMonth();
              const firstDay = new Date(year, month, 1).getDay();
              const daysInMonth = new Date(year, month + 1, 0).getDate();
              const startOffset = firstDay === 0 ? 6 : firstDay - 1; // Monday start
              const cells: (number | null)[] = Array(startOffset).fill(null);
              for (let d = 1; d <= daysInMonth; d++) cells.push(d);
              while (cells.length % 7 !== 0) cells.push(null);
              const today = new Date();
              const isToday = (d: number) => d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
              const monthLabel = calendarMonth.toLocaleDateString('sk-SK', { month: 'long', year: 'numeric' });

              // Group items by deadline day
              const itemsByDay: Record<number, ContentItem[]> = {};
              for (const item of items) {
                if (!item.deadline) continue;
                const dd = new Date(item.deadline);
                if (dd.getMonth() === month && dd.getFullYear() === year) {
                  const day = dd.getDate();
                  if (!itemsByDay[day]) itemsByDay[day] = [];
                  itemsByDay[day].push(item);
                }
              }

              const noDeadline = items.filter(i => !i.deadline);

              return (
                <div>
                  {/* Month nav */}
                  <div className="flex items-center justify-between mb-3">
                    <button onClick={() => setCalendarMonth(new Date(year, month - 1, 1))} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground text-sm cursor-pointer">←</button>
                    <span className="text-sm font-semibold capitalize">{monthLabel}</span>
                    <button onClick={() => setCalendarMonth(new Date(year, month + 1, 1))} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground text-sm cursor-pointer">→</button>
                  </div>

                  {/* Day headers */}
                  <div className="grid grid-cols-7 gap-px mb-1">
                    {['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'].map(d => (
                      <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1">{d}</div>
                    ))}
                  </div>

                  {/* Calendar grid */}
                  <div className="grid grid-cols-7 gap-px">
                    {cells.map((day, i) => (
                      <div
                        key={i}
                        className={`min-h-[80px] p-1 rounded-lg border transition-colors ${
                          day === null ? 'border-transparent' :
                          isToday(day) ? 'border-primary/40 bg-primary/5' :
                          'border-border/50 hover:border-border bg-card/30'
                        }`}
                      >
                        {day !== null && (
                          <>
                            <div className={`text-[10px] font-medium mb-0.5 ${isToday(day) ? 'text-primary' : 'text-muted-foreground'}`}>{day}</div>
                            <div className="space-y-0.5">
                              {(itemsByDay[day] || []).slice(0, 3).map(item => (
                                <div
                                  key={item.id}
                                  onClick={() => { setEditingItem(item); setShowForm(true); }}
                                  className={`text-[10px] leading-tight px-1 py-0.5 rounded truncate cursor-pointer border ${STATUS_CONFIG[item.status].color}`}
                                  title={item.title}
                                >
                                  {item.title}
                                </div>
                              ))}
                              {(itemsByDay[day] || []).length > 3 && (
                                <div className="text-[9px] text-muted-foreground px-1">+{itemsByDay[day].length - 3}</div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Items without deadline */}
                  {noDeadline.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-border">
                      <div className="text-xs font-medium text-muted-foreground mb-2">Bez terminu ({noDeadline.length})</div>
                      <div className="flex flex-wrap gap-1.5">
                        {noDeadline.map(item => (
                          <div
                            key={item.id}
                            onClick={() => { setEditingItem(item); setShowForm(true); }}
                            className={`text-[11px] px-2 py-1 rounded-lg border cursor-pointer ${STATUS_CONFIG[item.status].color}`}
                          >
                            {STATUS_CONFIG[item.status].icon} {item.title}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()
          ) : viewMode === 'list' ? (
            /* List View — Mobile-first 2026-04-28: stack vertically on narrow screens. Status select row 1 (full-width), title+meta row 2. */
            <div className="space-y-2">
              {items.map(item => (
                <div
                  key={item.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-3 rounded-xl border border-border bg-card hover:bg-card/80 transition-colors group"
                >
                  {/* Status badge */}
                  <select
                    value={item.status}
                    onChange={e => handleStatusChange(item.id, e.target.value as ContentStatus)}
                    className={`text-xs rounded-full px-2 py-1 border font-medium cursor-pointer self-start sm:self-auto shrink-0 ${STATUS_CONFIG[item.status].color}`}
                  >
                    {ALL_STATUSES.map(s => (
                      <option key={s} value={s}>{STATUS_CONFIG[s].icon} {STATUS_CONFIG[s].label}</option>
                    ))}
                  </select>

                  {/* Title + meta */}
                  <div className="flex-1 min-w-0 w-full">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">{item.title}</span>
                      {item.siteDomain && (
                        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">{item.siteDomain}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 text-[11px] text-muted-foreground mt-0.5 flex-wrap">
                      <span>{item.contentType}</span>
                      {item.assigneeName && <span>Prideleny: {item.assigneeName}</span>}
                      {item.keywords.length > 0 && (
                        <span className="truncate max-w-[200px]">{item.keywords.join(', ')}</span>
                      )}
                    </div>
                  </div>

                  {/* Deadline */}
                  {item.deadline && (
                    <span className={`text-xs whitespace-nowrap ${getDeadlineColor(item.deadline)}`}>
                      {formatDeadline(item.deadline)}
                    </span>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => { setEditingItem(item); setShowForm(true); }}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground text-xs"
                      title="Upravit"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button
                      onClick={() => setDeleteTarget(item)}
                      className="p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 text-xs"
                      title="Vymazat"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Kanban View */
            <div className="flex gap-3 overflow-x-auto pb-4 min-h-[400px]">
              {ALL_STATUSES.filter(s => s !== 'archived').map(status => {
                const statusItems = items.filter(i => i.status === status);
                const config = STATUS_CONFIG[status];
                return (
                  <div key={status} className="flex-shrink-0 w-56">
                    <div className={`text-xs font-medium px-3 py-2 rounded-t-lg border ${config.color} flex items-center gap-1.5`}>
                      <span>{config.icon}</span>
                      <span>{config.label}</span>
                      <span className="ml-auto bg-white/10 px-1.5 rounded-full">{statusItems.length}</span>
                    </div>
                    <div className="border border-t-0 border-border rounded-b-lg p-2 space-y-2 min-h-[200px] bg-card/30">
                      {statusItems.map(item => (
                        <div
                          key={item.id}
                          className="p-2.5 rounded-lg border border-border bg-card hover:bg-card/80 cursor-pointer transition-colors"
                          onClick={() => { setEditingItem(item); setShowForm(true); }}
                        >
                          <div className="text-xs font-medium text-foreground line-clamp-2 mb-1">{item.title}</div>
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                            {item.siteDomain && <span className="bg-muted px-1 rounded">{item.siteDomain}</span>}
                            {item.deadline && (
                              <span className={getDeadlineColor(item.deadline)}>
                                {new Date(item.deadline).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short' })}
                              </span>
                            )}
                          </div>
                          {item.assigneeName && (
                            <div className="text-[10px] text-muted-foreground mt-1">{item.assigneeName}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Form overlay */}
      {showForm && (
        <ContentItemForm
          item={editingItem}
          sites={sites}
          onSave={handleFormSaved}
          onClose={() => { setShowForm(false); setEditingItem(null); }}
        />
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Vymazat polozku"
        message={`Naozaj chcete vymazat "${deleteTarget?.title}"?`}
        confirmLabel="Vymazat"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );

  if (embedded) return calendarContent;
  return (<><div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />{calendarContent}</>);
}
