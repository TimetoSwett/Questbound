'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { classLabel, type LibrarySpell, rulesUrl, SPELL_CLASSES, spellLevelLabel } from '@/components/library/types';

const fields = [
  ['school', 'School'], ['subschool', 'Subschool'], ['descriptors', 'Descriptors'],
  ['castingTime', 'Casting time'], ['components', 'Components'], ['range', 'Range'],
  ['areaTargetEffect', 'Area / Target / Effect'], ['duration', 'Duration'],
  ['savingThrow', 'Saving throw'], ['spellResistance', 'Spell resistance'],
] as const;

export function LibraryClient() {
  const [q, setQ] = useState('');
  const [cls, setCls] = useState('');
  const [level, setLevel] = useState('');
  const [limit, setLimit] = useState('20');
  const [search, setSearch] = useState<{ results: LibrarySpell[]; loading: boolean; error: string }>({ results: [], loading: true, error: '' });
  const [selected, setSelected] = useState<LibrarySpell | null>(null);
  const [detail, setDetail] = useState<{ entry?: LibrarySpell; error?: string }>({});
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearch({ results: [], loading: true, error: '' });
      const query = new URLSearchParams({ kind: 'spell', system: 'pf1e', q, limit });
      if (cls) query.set('cls', cls);
      if (level !== '') query.set('level', level);
      try {
        const response = await fetch(`/api/library?${query}`, { signal: controller.signal });
        if (!response.ok) throw new Error();
        const body = await response.json();
        if (!controller.signal.aborted) setSearch({ results: body.results, loading: false, error: '' });
      } catch { if (!controller.signal.aborted) setSearch({ results: [], loading: false, error: 'Could not load the library. Please try again.' }); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [q, cls, level, limit, retry]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    fetch(`/api/library/${encodeURIComponent(selected.id)}`, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error();
      const entry = await response.json() as LibrarySpell;
      if (!controller.signal.aborted) setDetail({ entry });
    }).catch(() => { if (!controller.signal.aborted) setDetail({ error: 'Could not load the spell rules.' }); });
    return () => controller.abort();
  }, [selected]);
  const selectStyle = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';
  return <div className="min-h-screen bg-background">
    <header className="border-b bg-card/80"><nav aria-label="Main navigation" className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
      <div className="flex items-center gap-2"><Link href="/dashboard" className="font-display text-xl font-bold text-primary">Questbound</Link><span className="text-muted-foreground" aria-hidden="true">/</span><span aria-current="page" className="flex items-center gap-1 text-sm font-medium"><BookOpen className="h-4 w-4" /> Library</span></div>
      <Button asChild variant="ghost"><Link href="/dashboard">Dashboard</Link></Button>
    </nav></header>
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <h1 className="flex items-center gap-2 font-display text-3xl font-bold"><BookOpen className="h-7 w-7" /> Spell Library</h1>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr]">
        <div><Label htmlFor="library-search">Search spells</Label><Input id="library-search" value={q} maxLength={120} onChange={(event) => setQ(event.target.value)} placeholder="Spell name…" /></div>
        <div><Label htmlFor="library-class">Class</Label><select id="library-class" value={cls} onChange={(event) => setCls(event.target.value)} className={selectStyle}><option value="">All classes</option>{SPELL_CLASSES.map((name) => <option key={name} value={name}>{classLabel(name)}</option>)}</select></div>
        <div><Label htmlFor="library-level">Spell level</Label><select id="library-level" value={level} onChange={(event) => setLevel(event.target.value)} className={selectStyle}><option value="">All levels</option>{Array.from({ length: 10 }, (_, index) => <option key={index} value={index}>{index === 0 ? '0 (Cantrips)' : index}</option>)}</select></div>
        <div><Label htmlFor="library-limit">Result limit</Label><select id="library-limit" value={limit} onChange={(event) => setLimit(event.target.value)} className={selectStyle}><option value="20">20 results</option><option value="50">50 results</option></select></div>
      </div>
      <div aria-live="polite">{search.loading ? <p className="text-muted-foreground">Searching spells…</p> : search.error ? <div><p role="alert">{search.error}</p><Button variant="outline" onClick={() => setRetry((value) => value + 1)}>Try again</Button></div> : <p className="text-sm text-muted-foreground">{search.results.length} {search.results.length === 1 ? 'result' : 'results'}{search.results.length === Number(limit) ? ' — limit reached; narrow your search to find more spells.' : ''}</p>}</div>
      {!search.loading && !search.error && search.results.length === 0 && <p>No spells match these filters.</p>}
      <ul className="space-y-2">{search.results.map((spell) => <li key={spell.id}><button type="button" onClick={() => { setDetail({}); setSelected(spell); }} className="w-full rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent focus-visible:outline focus-visible:outline-primary">
        <h2 className="font-display font-semibold">{spell.name}</h2><p className="text-sm text-primary">{spellLevelLabel(spell)}</p><p className="mt-1 text-sm text-muted-foreground">{spell.summary}</p>
      </button></li>)}</ul>
    </main>
    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-lg">
        <DialogHeader><DialogTitle>{selected?.name}</DialogTitle><DialogDescription>{selected ? spellLevelLabel(selected) : ''}</DialogDescription></DialogHeader>
        {detail.error ? <p role="alert">{detail.error}</p> : !detail.entry ? <p role="status">Loading rules…</p> : <>
          <dl className="grid gap-3 sm:grid-cols-2">{fields.map(([key, label]) => <div key={key}><dt className="text-sm font-semibold">{label}</dt><dd className="whitespace-pre-wrap text-sm text-muted-foreground">{(Array.isArray(detail.entry?.data[key]) ? (detail.entry.data[key] as string[]).join(', ') : detail.entry?.data[key]) || '—'}</dd></div>)}</dl>
          <div><h3 className="font-semibold">Description</h3><p className="mt-2 whitespace-pre-wrap text-sm">{detail.entry.data.description || '—'}</p></div>
          {rulesUrl(detail.entry.sourceUrl) && <a href={rulesUrl(detail.entry.sourceUrl)} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">See full rules{detail.entry.sourceUrl?.includes('aonprd.com') ? ' on Archives of Nethys' : ''}</a>}
        </>}
      </DialogContent>
    </Dialog>
  </div>;
}
