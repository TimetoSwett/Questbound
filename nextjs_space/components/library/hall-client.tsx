'use client';

import { ItemFilters } from './item-filters';
import { AbilityEntryFields } from '@/components/library/ability-entry-fields';
import { ABILITY_TAG_LABELS, buildAbilityData, emptyAbilityForm } from '@/lib/library-ability-form';
import { GearEntryFields } from '@/components/library/gear-entry-fields';
import { buildGearData, emptyGearForm, GEAR_SLOT_LABELS } from '@/lib/library-gear-form';
import { FeatEntryFields } from '@/components/library/feat-entry-fields';
import { buildFeatData, emptyFeatForm } from '@/lib/library-feat-form';
import { SpellEntryForm } from '@/components/library/spell-entry-form';
import { buildHandData, type HandForm } from '@/lib/library-hand-form';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { rulesUrl } from '@/components/library/types';
import { SiteHeader } from '@/components/site-header';
import { HALLS, type HallFilter, type HallId } from './halls';

type Hit = { id: string; kind: string; name: string; summary: string; sourceUrl: string | null; data?: Record<string, string | number | null> };

const DETAIL: Record<string, [string, string][]> = {
  weapon: [['category', 'Category'], ['hands', 'Hands'], ['damage', 'Damage'], ['crit', 'Critical'], ['range', 'Range'], ['type', 'Type'], ['cost', 'Cost'], ['weight', 'Weight']],
  armor: [['slot', 'Slot'], ['acBonus', 'AC bonus'], ['maxDex', 'Max Dex'], ['checkPenalty', 'Check penalty'], ['spellFailure', 'Spell failure'], ['cost', 'Cost'], ['weight', 'Weight']],
  gear: [['slot', 'Slot'], ['aura', 'Aura'], ['cl', 'Caster level'], ['cost', 'Cost'], ['weight', 'Weight']],
  feat: [['featType', 'Type'], ['prerequisites', 'Prerequisites'], ['benefit', 'Benefit']],
  ability: [['tag', 'Type'], ['uses', 'Uses']],
};

function Pages({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
  if (pages <= 1) return null;
  return <nav aria-label="Pages" className="flex flex-wrap gap-1">{Array.from({ length: pages }, (_, index) => index + 1).map((number) => (
    <button key={number} type="button" aria-current={number === page ? 'page' : undefined} onClick={() => onPage(number)}
      className={`min-w-8 rounded px-2 py-1 text-sm ${number === page ? 'bg-primary font-semibold text-primary-foreground' : 'hover:bg-accent'}`}>{number}</button>
  ))}</nav>;
}

export function HallClient({ hall, userName }: { hall: HallId; userName: string }) {
  const config = HALLS[hall];
  const [filterId, setFilterId] = useState<HallFilter['id']>(config.filters[0].id);
  const filter = config.filters.find((item) => item.id === filterId) ?? config.filters[0];
  const [q, setQ] = useState('');
  const [itemType, setItemType] = useState('');
  const [slot, setSlot] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState('20');
  const [search, setSearch] = useState<{ results: Hit[]; total: number; loading: boolean; error: string }>({ results: [], total: 0, loading: true, error: '' });
  const [selected, setSelected] = useState<Hit | null>(null);
  const [detail, setDetail] = useState<Hit | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const filterKey = `${filter.id}|${q}|${limit}|${itemType}|${slot}`;
  const [seen, setSeen] = useState(filterKey);
  if (filterKey !== seen) { setSeen(filterKey); setPage(1); }
  const pageSize = Number(limit) || 20;
  const pages = Math.ceil(search.total / pageSize);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearch((current) => ({ ...current, loading: true, error: '' }));
      const params = new URLSearchParams({ kind: filter.kind, system: 'pf1e', q, limit, page: String(page) });
      if (filter.kind === 'gear') {
        if (itemType) params.set('itemType', itemType);
        if (slot) params.set('slot', slot);
      }
      if ('slot' in filter && filter.slot) params.set('slot', filter.slot);
      try {
        const response = await fetch(`/api/library?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error();
        const body = await response.json();
        if (!controller.signal.aborted) setSearch({ results: body.results, total: body.total ?? body.results.length, loading: false, error: '' });
      } catch { if (!controller.signal.aborted) setSearch({ results: [], total: 0, loading: false, error: 'Could not load the catalog.' }); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [filter, q, limit, page, importOpen, itemType, slot]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    fetch(`/api/library/${encodeURIComponent(selected.id)}`, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error();
      const entry = await response.json() as Hit;
      if (!controller.signal.aborted) setDetail(entry);
    }).catch(() => { if (!controller.signal.aborted) setDetail(null); });
    return () => controller.abort();
  }, [selected]);

  return <div className="min-h-screen bg-background">
    <SiteHeader userName={userName} current={config.path} />
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">{config.title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{config.blurb}</p>
        </div>
        <Button type="button" onClick={() => setImportOpen(true)}>Import or add</Button>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1"><Label htmlFor="hall-search">Search</Label><Input id="hall-search" value={q} maxLength={120} placeholder="Name…" onChange={(event) => setQ(event.target.value)} /></div>
        {config.filters.length > 1 && <div className="flex flex-wrap gap-1">{config.filters.map((item) => (
          <button key={item.id} type="button" onClick={() => setFilterId(item.id)} className={`rounded-md px-3 py-2 text-sm ${item.id === filter.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{item.label}</button>
        ))}</div>}
        {filter.kind === 'gear' && <ItemFilters itemType={itemType} slot={slot} onTypeChange={setItemType} onSlotChange={setSlot} />}
        <div><Label htmlFor="hall-limit">Per page</Label><select id="hall-limit" value={limit} onChange={(event) => setLimit(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="20">20</option><option value="50">50</option></select></div>
      </div>
      <Pages page={page} pages={pages} onPage={setPage} />
      <div aria-live="polite">{search.loading ? <p className="text-muted-foreground">Searching…</p> : search.error ? <p role="alert">{search.error}</p> : <p className="text-sm text-muted-foreground">{search.total} {search.total === 1 ? 'entry' : 'entries'}{pages > 1 ? ` — page ${page} of ${pages}` : ''}</p>}</div>
      {!search.loading && !search.error && search.results.length === 0 && <p>No entries match these filters.</p>}
      <ul className="space-y-2">{search.results.map((entry) => <li key={entry.id}><button type="button" onClick={() => { setDetail(null); setSelected(entry); }} className="w-full rounded-lg border bg-card p-4 text-left hover:bg-accent">
        <h2 className="font-display font-semibold">{entry.name}</h2>
        {entry.summary && <p className="mt-1 text-sm text-muted-foreground">{entry.summary}</p>}
      </button></li>)}</ul>
      <Pages page={page} pages={pages} onPage={setPage} />
    </main>
    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{selected?.name}</DialogTitle><DialogDescription>{selected?.summary}</DialogDescription></DialogHeader>
        {!detail ? <p>Loading…</p> : <>
          <dl className="grid gap-3 sm:grid-cols-2">{(DETAIL[detail.kind] ?? []).map(([key, label]) => <div key={key}><dt className="text-sm font-semibold">{label}</dt><dd className="text-sm text-muted-foreground">{key === 'tag' && detail.kind === 'ability' && detail.data?.[key] ? ABILITY_TAG_LABELS[detail.data[key] as keyof typeof ABILITY_TAG_LABELS] ?? String(detail.data[key]) : key === 'slot' && detail.kind === 'gear' && detail.data?.[key] ? GEAR_SLOT_LABELS[detail.data[key] as keyof typeof GEAR_SLOT_LABELS] ?? String(detail.data[key]) : key === 'maxDex' && detail.data?.[key] === null ? 'No limit' : key === 'hands' && detail.data?.[key] ? HAND_LABELS[String(detail.data[key])] ?? String(detail.data[key]) : detail.data?.[key] === null || detail.data?.[key] === undefined || detail.data?.[key] === '' ? '—' : String(detail.data[key])}</dd></div>)}</dl>
          <p className="whitespace-pre-wrap text-sm">{String(detail.data?.description || '—')}</p>
          {rulesUrl(detail.sourceUrl) && <a href={rulesUrl(detail.sourceUrl)} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">See full rules</a>}
        </>}
      </DialogContent>
    </Dialog>
    {importOpen && <ImportDialog filter={filter} onClose={() => setImportOpen(false)} onSaved={() => setImportOpen(false)} />}
  </div>;
}

const LINK_PLACEHOLDER: Record<string, string> = {
  spell: 'https://www.d20pfsrd.com/magic/all-spells/f/fireball/',
  feat: 'https://www.d20pfsrd.com/feats/combat-feats/power-attack-combat/',
  weapon: 'https://www.d20pfsrd.com/equipment/weapons/weapon-descriptions/longsword/',
  armor: 'https://www.d20pfsrd.com/equipment/armor/chain-shirt/',
  gear: 'https://www.d20pfsrd.com/equipment/goods-and-services/hunting-camping-survival-gear/#bedroll',
  ability: 'https://www.aonprd.com/UMR.aspx?ItemName=Grab',
};

const HAND_LABELS: Record<string, string> = { one: 'One-handed', two: 'Two-handed', off: 'Off-hand' };

function HandStats({ kind, slot, form, onChange }: {
  kind: string; slot?: string; form: HandForm; onChange: (form: HandForm) => void;
}) {
  if (kind !== 'armor' && kind !== 'weapon') return null;
  const update = (key: string, value: string) => {
    onChange({ ...form, [key]: value, ...(key === 'category' ? { ability: value === 'ranged' ? 'dex' : 'str' } : {}) });
  };
  const label = (key: string) => DETAIL[kind].find(([field]) => field === key)?.[1] ?? key;
  const select = (key: string, title: string, value: string, options: [string, string][]) => <div key={key}>
    <Label htmlFor={`hand-${key}`}>{title}</Label>
    <select id={`hand-${key}`} value={value} onChange={(event) => update(key, event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground">
      {options.map(([value, title]) => <option key={value} value={value}>{title}</option>)}
    </select>
  </div>;
  const input = (key: string, title = label(key), numeric?: [number, number, boolean], placeholder?: string) => <div key={key}>
    <Label htmlFor={`hand-${key}`}>{title}</Label>
    <Input id={`hand-${key}`} type={numeric ? 'number' : 'text'} min={numeric?.[0]} max={numeric?.[1]} step={numeric ? numeric[2] ? 1 : 'any' : undefined}
      maxLength={numeric ? undefined : key === 'cost' ? 120 : 40} placeholder={placeholder}
      value={form[key] ?? (numeric && key !== 'maxDex' ? '0' : '')} onChange={(event) => update(key, event.target.value)} />
  </div>;
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    {kind === 'armor' ? <>
      {select('slot', label('slot'), form.slot ?? slot ?? 'armor', [['armor', 'Armor'], ['shield', 'Shield']])}
      {input('acBonus', label('acBonus'), [-100, 100, true])}
      {input('maxDex', label('maxDex'), [-100, 100, true], 'No limit')}
      {input('checkPenalty', label('checkPenalty'), [-100, 0, true])}
      {input('spellFailure', 'Spell failure %', [0, 100, true])}
    </> : <>
      {select('category', label('category'), form.category ?? 'melee', [['melee', 'Melee'], ['ranged', 'Ranged'], ['thrown', 'Thrown'], ['composite', 'Composite']])}
      {select('ability', 'Attack ability', form.ability ?? (form.category === 'ranged' ? 'dex' : 'str'), [['str', 'STR'], ['dex', 'DEX']])}
      {input('damage', 'Damage die (Medium)', undefined, '1d8')}
      {input('crit', label('crit'), undefined, '19-20/x2')}
      {input('range', 'Range ft', [0, 100000, true])}
      {input('type', 'Damage type', undefined, 'S, P, B/P')}
      {select('hands', label('hands'), form.hands ?? '', [['', 'Not set'], ...Object.entries(HAND_LABELS)])}
    </>}
    {input('cost')}
    {input('weight', 'Weight lb', [0, 100000, false])}
  </div>;
}

export function ImportDialog({ filter, onClose, onSaved }: { filter: { id?: string; kind: string; slot?: string; label?: string }; onClose: () => void; onSaved: () => void }) {
  const [mode, setMode] = useState<'link' | 'hand'>(filter.kind === 'spell' ? 'hand' : 'link');
  const [url, setUrl] = useState('');
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null);
  const [drafts, setDrafts] = useState<Array<Record<string, unknown>>>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [gearForm, setGearForm] = useState(emptyGearForm());
  const [abilityForm, setAbilityForm] = useState(emptyAbilityForm());
  const [featForm, setFeatForm] = useState(emptyFeatForm());
  const [handForm, setHandForm] = useState<HandForm>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function loadLink() {
    setBusy(true); setError(''); setDraft(null); setDrafts([]); setSaved([]);
    try {
      const response = await fetch('/api/library/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Import failed.');
      setDraft(body.draft);
      setDrafts(Array.isArray(body.drafts) ? body.drafts : []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Import failed.'); }
    finally { setBusy(false); }
  }

  async function post(body: unknown) {
    const response = await fetch('/api/library', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Could not save.');
  }

  async function save(body: unknown) {
    setBusy(true); setError('');
    try {
      await post(body);
      onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save.'); }
    finally { setBusy(false); }
  }

  function draftProblem(d: Record<string, unknown>): string {
    const kind = String(d.kind);
    if (kind !== filter.kind) {
      const where = kind === 'spell' ? 'the Library' : kind === 'gear' ? 'the Shop' : kind === 'feat' || kind === 'ability' ? 'Training Grounds' : 'the Armory';
      return `That page is a ${kind}. Open ${where} and import it there.`;
    }
    const slot = (d.data as { slot?: unknown } | undefined)?.slot;
    if ('slot' in filter && filter.slot && typeof slot === 'string' && slot !== filter.slot) {
      return slot === 'shield' ? 'That is a shield. Switch to Shields, then save it.' : 'That is armor. Switch to Armor, then save it.';
    }
    return '';
  }

  async function saveDraft() {
    if (!draft) return;
    const problem = draftProblem(draft);
    if (problem) { setError(problem); return; }
    await save(draft);
  }

  /** Several versions from one page (metamagic rods): save the given ones in order, stop at the first error, close once all are saved. */
  async function saveVersions(list: Array<Record<string, unknown>>) {
    setBusy(true); setError('');
    const done = new Set(saved);
    try {
      for (const d of list) {
        const problem = draftProblem(d);
        if (problem) throw new Error(problem);
        await post(d);
        done.add(String(d.name));
        setSaved([...done]);
      }
      if (drafts.every((d) => done.has(String(d.name)))) onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save.'); }
    finally { setBusy(false); }
  }

  const handLabel = filter.kind === 'ability' ? 'ability' : filter.kind === 'armor' && 'slot' in filter && filter.slot === 'shield' ? 'shield' : filter.kind === 'gear' ? 'item' : filter.kind;

  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Add to the catalog</DialogTitle>
        <DialogDescription>{filter.kind === 'spell' ? 'One d20pfsrd spell link, or a spell of your own.' : 'One Archives of Nethys or d20pfsrd page link, or a short entry of your own. This does not import a whole list.'}</DialogDescription>
      </DialogHeader>
      <div className="flex gap-1">
        <button type="button" className={`rounded px-3 py-1 text-sm ${mode === 'link' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`} onClick={() => setMode('link')}>From a link</button>
        <button type="button" className={`rounded px-3 py-1 text-sm ${mode === 'hand' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`} onClick={() => setMode('hand')}>By hand</button>
      </div>
      {mode === 'link' ? <div className="space-y-3">
        <div><Label htmlFor="import-url">Archives of Nethys or d20pfsrd link</Label><Input id="import-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder={LINK_PLACEHOLDER[filter.kind] ?? LINK_PLACEHOLDER.feat} /></div>
        <Button type="button" disabled={busy || !url.trim()} onClick={() => void loadLink()}>{busy ? 'Reading…' : 'Read link'}</Button>
        {drafts.length > 1 ? <div className="space-y-2">
          {drafts.map((d) => <div key={String(d.name)} className="rounded-md border p-3 text-sm">
            <p className="font-semibold">{String(d.name)}{(d.data as { cost?: unknown } | undefined)?.cost ? ` — ${String((d.data as { cost?: unknown }).cost)}` : ''}</p>
            <p className="text-muted-foreground">{String(d.kind)} — {String(d.summary || '')}</p>
            <Button type="button" className="mt-2" disabled={busy || saved.includes(String(d.name))} onClick={() => void saveVersions([d])}>{saved.includes(String(d.name)) ? 'Saved' : 'Save'}</Button>
          </div>)}
          <Button type="button" disabled={busy || drafts.every((d) => saved.includes(String(d.name)))} onClick={() => void saveVersions(drafts.filter((d) => !saved.includes(String(d.name))))}>Save all {drafts.length}</Button>
        </div> : draft && <div className="rounded-md border p-3 text-sm">
          <p className="font-semibold">{String(draft.name)}</p>
          <p className="text-muted-foreground">{String(draft.kind)} — {String(draft.summary || '')}</p>
          <Button type="button" className="mt-2" disabled={busy} onClick={() => void saveDraft()}>Save to catalog</Button>
        </div>}
      </div> : filter.kind === 'spell' ? <SpellEntryForm onCreated={() => onSaved()} /> : <form noValidate className="space-y-3" onSubmit={(event) => {
        event.preventDefault();
        if (filter.kind === 'ability') {
          const result = buildAbilityData({ ...abilityForm, description });
          if (!result.ok) { setError(result.error); return; }
          void save({ kind: 'ability', name, data: result.data });
          return;
        }
        if (filter.kind === 'feat') {
          const result = buildFeatData({ ...featForm, description });
          if (!result.ok) { setError(result.error); return; }
          void save({ kind: 'feat', name, data: result.data });
          return;
        }
        if (filter.kind === 'gear') {
          const result = buildGearData({ ...gearForm, description });
          if (!result.ok) { setError(result.error); return; }
          void save({ kind: 'gear', name, data: result.data });
          return;
        }
        const stats = buildHandData(filter.kind, 'slot' in filter ? filter.slot : undefined, handForm);
        if (!stats.ok) { setError(stats.error); return; }
        void save({ kind: filter.kind, name, data: { ...stats.data, description } });
      }}>
        <div><Label htmlFor="hand-name">Name</Label><Input id="hand-name" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} required /></div>
        {filter.kind === 'ability' && <AbilityEntryFields form={abilityForm} onChange={setAbilityForm} />}
        {filter.kind === 'gear' && <GearEntryFields form={gearForm} onChange={setGearForm} />}
        {filter.kind === 'feat' && <FeatEntryFields form={featForm} onChange={setFeatForm} />}
        <HandStats kind={filter.kind} slot={'slot' in filter ? filter.slot : undefined} form={handForm} onChange={setHandForm} />
        <div><Label htmlFor="hand-body">Description</Label><textarea id="hand-body" value={description} maxLength={20000} onChange={(event) => setDescription(event.target.value)} className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></div>
        <Button type="submit" disabled={busy || !name.trim()}>Save {handLabel}</Button>
      </form>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </DialogContent>
  </Dialog>;
}
