'use client';

import { ItemFilters } from './item-filters';
import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type CatalogHit = {
  id: string;
  kind: string;
  name: string;
  summary: string;
  sourceUrl: string | null;
  data?: Record<string, unknown>;
};

export type CatalogQuery = { kind: string; slot?: string; label: string };

const hallFor = (kind: string) => kind === 'gear' ? '/shop' : kind === 'feat' || kind === 'ability' ? '/training' : '/armory';

export function CatalogSearchDialog({ title, description, queries, knownIds, onClose, onPick, onCustom }: {
  title: string;
  description: string;
  queries: readonly CatalogQuery[];
  knownIds: string[];
  onClose: () => void;
  onPick: (entry: CatalogHit) => void;
  onCustom?: () => void;
}) {
  const inputId = useId();
  const [filter, setFilter] = useState(queries[0]?.kind + (queries[0]?.slot ?? ''));
  const [query, setQuery] = useState('');
  const [itemType, setItemType] = useState('');
  const [slot, setSlot] = useState('');
  const [results, setResults] = useState<CatalogHit[]>([]);
  const [status, setStatus] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(() => new Set(knownIds));
  const active = queries.filter((item) => queries.length === 1 || item.kind + (item.slot ?? '') === filter);
  const activeKey = active.map((item) => `${item.kind}:${item.slot ?? ''}`).join(',');
  const typed = query.trim();

  useEffect(() => {
    if (!typed) return;
    const items = activeKey.split(',').filter(Boolean).map((part) => {
      const [kind, slot] = part.split(':');
      return { kind, slot };
    });
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus('Searching…');
      setResults([]);
      try {
        const lists = await Promise.all(items.map(async (item) => {
          const params = new URLSearchParams({ kind: item.kind, system: 'pf1e', q: typed.slice(0, 120), limit: '15' });
          if (item.slot) params.set('slot', item.slot);
          if (item.kind === 'gear') {
            if (itemType) params.set('itemType', itemType);
            if (slot) params.set('slot', slot);
          }
          const response = await fetch(`/api/library?${params}`, { signal: controller.signal });
          if (!response.ok) throw new Error();
          return (await response.json()).results as CatalogHit[];
        }));
        if (controller.signal.aborted) return;
        const matches = [...new Map(lists.flat().map((entry) => [entry.id, entry])).values()].slice(0, 20);
        setResults(matches);
        setStatus(matches.length ? '' : 'Nothing in the catalog matches that search.');
      } catch {
        if (!controller.signal.aborted) { setResults([]); setStatus('Catalog unavailable.'); }
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [typed, activeKey, itemType, slot]);

  async function choose(entry: CatalogHit) {
    if (added.has(entry.id) || pendingId) return;
    setPendingId(entry.id);
    try {
      const response = await fetch(`/api/library/${encodeURIComponent(entry.id)}`);
      if (!response.ok) throw new Error();
      const full = await response.json() as CatalogHit;
      onPick(full);
      setAdded((prev) => new Set(prev).add(entry.id));
    } catch {
      setStatus('Could not add that entry. Try again.');
    } finally {
      setPendingId(null);
    }
  }

  const browse = hallFor(active[0]?.kind ?? 'weapon');
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg flex-col gap-3 overflow-hidden">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor={inputId}>Search</Label>
          <Input id={inputId} autoFocus value={query} maxLength={120} placeholder="Name…" onChange={(event) => setQuery(event.target.value)} />
          {queries.length > 1 && (
            <div className="flex flex-wrap gap-1">
              {queries.map((item) => {
                const id = item.kind + (item.slot ?? '');
                return <button key={id} type="button" onClick={() => setFilter(id)} className={`rounded px-2 py-1 text-xs ${filter === id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{item.label}</button>;
              })}
            </div>
          )}
        </div>
        {active.some((item) => item.kind === 'gear') && <div className="grid grid-cols-2 gap-3"><ItemFilters itemType={itemType} slot={slot} onTypeChange={setItemType} onSlotChange={setSlot} /></div>}
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {!typed && <p className="px-1 py-6 text-center text-xs text-muted-foreground">Type a name. The catalog only has what you have added. <Link href={browse} className="text-primary hover:underline">Open it</Link> to import one.</p>}
          {typed && results.map((entry) => {
            const onSheet = added.has(entry.id);
            return (
              <button type="button" key={entry.id} disabled={onSheet || pendingId === entry.id} onClick={() => void choose(entry)}
                className="flex w-full items-start gap-3 rounded-md px-2 py-2 text-left text-xs hover:bg-accent disabled:opacity-60">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{entry.name}</span>
                  <span className="block truncate text-muted-foreground">{entry.summary}</span>
                </span>
                <span className="shrink-0 text-muted-foreground">{onSheet ? 'On sheet' : pendingId === entry.id ? 'Adding…' : 'Add'}</span>
              </button>
            );
          })}
          {typed && status && <p className="px-1 py-2 text-xs text-muted-foreground" role="status">{status}</p>}
        </div>
        <div className="flex items-center justify-between gap-2 border-t pt-3">
          {onCustom ? <Button type="button" variant="ghost" size="sm" onClick={onCustom}>Add a custom one</Button> : <span />}
          <Button type="button" variant="outline" size="sm" onClick={onClose}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
