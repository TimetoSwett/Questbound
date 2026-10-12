'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import type { LootEntry, WeightedLootEntry, LootItem } from '@/lib/loot';
import { lootListSchema, lootTableSchema } from '@/lib/loot-validation';

type Table = { id: string; name: string; rolls: number; entries: WeightedLootEntry[] };
const blankEntry = (): WeightedLootEntry => ({ kind: 'item', name: '', chance: 1, quantity: '1', valueGp: 0, weight: 0, notes: '' });
const cleanEntry = (e: LootEntry): LootEntry => ({ kind: e.kind, name: e.name, quantity: e.quantity, valueGp: e.valueGp, weight: e.weight, notes: e.notes });
const cleanTable = (table: Table) => ({ name: table.name, rolls: table.rolls, entries: table.entries.map(e => ({ ...cleanEntry(e), chance: e.chance })) });

async function lootRequest<T>(url: string, method?: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method, ...(body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Could not save loot');
  return data as T;
}
const showError = (error: unknown) => toast.error(error instanceof Error ? error.message : 'Could not load loot');

function EntryRows({ entries, weighted, onChange, disabled }: { entries: WeightedLootEntry[]; weighted?: boolean; onChange: (entries: WeightedLootEntry[]) => void; disabled: boolean }) {
  const edit = (index: number, change: Partial<WeightedLootEntry>) => onChange(entries.map((e, i) => i === index ? { ...e, ...change } : e));
  return <div className="space-y-3">
    <p className="text-xs text-muted-foreground">Quantity: a number, 1d4, or 2d6+1 (up to 100 dice, 1,000 sides, 100,000 total). Coins add quantity × GP per unit to party funds.</p>
    {entries.map((entry, i) => <fieldset key={i} disabled={disabled} className="rounded-lg border border-border p-3 space-y-2">
      <legend className="text-xs px-1">Entry {i + 1}</legend>
      <div className="flex flex-wrap gap-2 items-end">
        <label className="text-xs space-y-1">Kind<Select disabled={disabled} value={entry.kind} onValueChange={kind => edit(i, { kind: kind as LootEntry['kind'] })}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="item">Item</SelectItem><SelectItem value="coins">Coins</SelectItem></SelectContent></Select></label>
        <label className="text-xs space-y-1 flex-1 min-w-32">Name<Input maxLength={200} value={entry.name} onChange={e => edit(i, { name: e.target.value })} placeholder={entry.kind === 'coins' ? 'Gold coins' : 'Item name'} /></label>
        <label className="text-xs space-y-1 w-24">Quantity<Input value={entry.quantity} maxLength={30} onChange={e => edit(i, { quantity: e.target.value })} /></label>
        {weighted && <label className="text-xs space-y-1 w-24">Chance weight<Input type="number" min={0} max={1_000_000} step={1} value={Number.isNaN(entry.chance) ? '' : entry.chance} onChange={e => edit(i, { chance: e.target.value === '' ? NaN : Number(e.target.value) })} /></label>}
        <label className="text-xs space-y-1 w-24">GP per unit<Input type="number" min={0} max={1_000_000} step="any" value={Number.isNaN(entry.valueGp) ? '' : entry.valueGp} onChange={e => edit(i, { valueGp: e.target.value === '' ? NaN : Number(e.target.value) })} /></label>
        <label className="text-xs space-y-1 w-24">Lb per unit<Input type="number" min={0} max={1_000_000} step="any" value={Number.isNaN(entry.weight) ? '' : entry.weight} onChange={e => edit(i, { weight: e.target.value === '' ? NaN : Number(e.target.value) })} /></label>
        <Button variant="ghost" size="sm" onClick={() => onChange(entries.filter((_, index) => index !== i))}>Remove</Button>
      </div>
      <label className="block text-xs space-y-1">Notes<Input maxLength={10_000} value={entry.notes} onChange={e => edit(i, { notes: e.target.value })} /><span className="block text-muted-foreground">Copied onto the item when rolled, so players will see it.</span></label>
    </fieldset>)}
    <Button disabled={disabled || entries.length >= 200} variant="outline" size="sm" onClick={() => onChange([...entries, blankEntry()])}>Add entry</Button>
  </div>;
}

export function LootTableEditor({ campaignId }: { campaignId: string }) {
  const [tables, setTables] = useState<Table[]>([]);
  const [draft, setDraft] = useState<Table | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const url = `/api/loot-tables?campaignId=${encodeURIComponent(campaignId)}`;
  useEffect(() => {
    let active = true;
    lootRequest<Table[]>(url).then(data => { if (active) { setTables(data); setReady(true); } }).catch(showError);
    return () => { active = false; };
  }, [url]);
  const save = async () => {
    if (!draft) return;
    const parsed = lootTableSchema.safeParse(cleanTable(draft));
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? 'Invalid table'); return; }
    setBusy(true);
    try {
      const saved = await lootRequest<Table>('/api/loot-tables', draft.id ? 'PUT' : 'POST', { campaignId, ...(draft.id ? { id: draft.id } : {}), table: parsed.data });
      setTables(await lootRequest<Table[]>(url)); setDraft(saved); toast.success('Loot table saved');
    } catch (error) { showError(error); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!draft?.id || !confirm(`Delete ${draft.name}? Creatures will keep their guaranteed lists.`)) return;
    setBusy(true);
    try {
      await lootRequest(`${url}&id=${encodeURIComponent(draft.id)}`, 'DELETE');
      setTables(await lootRequest<Table[]>(url)); setDraft(null); toast.success('Loot table deleted');
    } catch (error) { showError(error); } finally { setBusy(false); }
  };
  return <section className="mt-8 border-t border-border pt-6 space-y-4">
    <h2 className="font-display text-xl font-bold">Loot tables <span className="text-xs text-muted-foreground">GM only</span></h2>
    <p className="text-sm text-muted-foreground">Each draw picks one entry by relative chance weight, with replacement. Assign tables on creature pages.</p>
    <div className="flex flex-wrap gap-2">
      <Select disabled={!ready || busy} value={draft?.id || 'new'} onValueChange={id => setDraft(tables.find(t => t.id === id) ?? null)}><SelectTrigger className="w-64"><SelectValue placeholder="Choose a table" /></SelectTrigger><SelectContent><SelectItem value="new">Choose a table</SelectItem>{tables.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select>
      <Button disabled={!ready || busy} variant="outline" onClick={() => setDraft({ id: '', name: 'New loot table', rolls: 1, entries: [] })}>New table</Button>
    </div>
    {draft && <div className="space-y-4">
      <div className="flex gap-3"><label className="text-sm flex-1">Table name<Input disabled={busy} maxLength={200} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label><label className="text-sm w-24">Draws<Input disabled={busy} type="number" min={0} max={100} step={1} value={Number.isNaN(draft.rolls) ? '' : draft.rolls} onChange={e => setDraft({ ...draft, rolls: e.target.value === '' ? NaN : Number(e.target.value) })} /></label></div>
      <EntryRows entries={draft.entries} weighted disabled={busy} onChange={entries => setDraft({ ...draft, entries })} />
      <div className="flex gap-2"><Button disabled={busy} onClick={save}>Save table</Button>{draft.id && <Button disabled={busy} variant="destructive" onClick={remove}>Delete table</Button>}</div>
    </div>}
  </section>;
}

type CreatureLoot = { lootTableId: string | null; lootList: LootEntry[] };
export function CreatureLootEditor({ campaignId, creatureId }: { campaignId: string; creatureId: string }) {
  const [tables, setTables] = useState<Table[]>([]);
  const [draft, setDraft] = useState<CreatureLoot | null>(null);
  const [busy, setBusy] = useState(false);
  const url = `/api/creatures/${encodeURIComponent(creatureId)}/loot`;
  useEffect(() => {
    let active = true;
    Promise.all([lootRequest<Table[]>(`/api/loot-tables?campaignId=${encodeURIComponent(campaignId)}`), lootRequest<CreatureLoot>(`${url}?campaignId=${encodeURIComponent(campaignId)}`)])
      .then(([t, loot]) => { if (active) { setTables(t); setDraft(loot); } }).catch(showError);
    return () => { active = false; };
  }, [campaignId, url]);
  const save = useCallback(async () => {
    if (!draft) throw new Error('Loot is still loading');
    const parsed = lootListSchema.safeParse(draft.lootList.map(cleanEntry));
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Invalid guaranteed list');
    return lootRequest<CreatureLoot>(url, 'PUT', { campaignId, lootTableId: draft.lootTableId, lootList: parsed.data });
  }, [campaignId, draft, url]);
  const act = async (roll: boolean) => {
    setBusy(true);
    try {
      const saved = await save(); setDraft(saved);
      if (roll) {
        const result = await lootRequest<{ items: LootItem[]; cp: number }>(`/api/creatures/${encodeURIComponent(creatureId)}/roll-loot`, 'POST', { campaignId });
        toast.success(`Added to party: ${[...result.items.map(i => `${i.quantity} × ${i.name}`), ...(result.cp ? [`${result.cp} cp`] : [])].join(', ') || 'no loot this roll'}`);
      } else toast.success('Creature loot saved');
    } catch (error) { showError(error); } finally { setBusy(false); }
  };
  return <section className="bg-card rounded-lg border border-border p-4 space-y-4 mb-4">
    <h2 className="font-display text-lg font-semibold">Loot <span className="text-xs text-muted-foreground">GM only</span></h2>
    {!draft ? <p className="text-sm text-muted-foreground">Loading loot...</p> : <>
      <label className="block text-sm space-y-1">Loot table<Select disabled={busy} value={draft.lootTableId ?? 'none'} onValueChange={id => setDraft({ ...draft, lootTableId: id === 'none' ? null : id })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No table</SelectItem>{tables.map(t => <SelectItem key={t.id} value={t.id}>{t.name} ({t.rolls} draws)</SelectItem>)}</SelectContent></Select></label>
      <h3 className="text-sm font-semibold">Guaranteed list</h3>
      <EntryRows disabled={busy} entries={draft.lootList.map(e => ({ ...e, chance: 1 }))} onChange={entries => setDraft({ ...draft, lootList: entries.map(cleanEntry) })} />
      <div className="flex gap-2"><Button disabled={busy} variant="outline" onClick={() => act(false)}>Save loot</Button><Button disabled={busy} onClick={() => act(true)}>Roll loot</Button></div>
      <p className="text-xs text-muted-foreground">Roll loot saves these settings and adds a fresh reward to the party each time.</p>
    </>}
  </section>;
}
