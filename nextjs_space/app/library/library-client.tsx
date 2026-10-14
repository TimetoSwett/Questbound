'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { classLabel, type LibrarySpell, rulesUrl, SPELL_CLASSES, SPELL_DESCRIPTORS, SPELL_SCHOOLS, SPELL_SUBSCHOOLS, spellLevelLabel } from '@/components/library/types';
import { HallNav } from '@/components/library/hall-nav';

const fields = [
  ['school', 'School'], ['subschool', 'Subschool'], ['descriptors', 'Descriptors'],
  ['castingTime', 'Casting time'], ['components', 'Components'], ['range', 'Range'],
  ['areaTargetEffect', 'Area / Target / Effect'], ['duration', 'Duration'],
  ['savingThrow', 'Saving throw'], ['spellResistance', 'Spell resistance'],
] as const;

function SpellPages({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
  if (pages <= 1) return null;
  return <nav aria-label="Spell pages" className="flex flex-wrap gap-1">
    {Array.from({ length: pages }, (_, index) => index + 1).map((number) => {
      const current = number === page;
      return <button key={number} type="button" aria-current={current ? 'page' : undefined} aria-label={`Page ${number}`} onClick={() => onPage(number)}
        className={`min-w-8 rounded px-2 py-1 text-sm ${current ? 'bg-primary font-semibold text-primary-foreground' : 'hover:bg-accent'}`}>{number}</button>;
    })}
  </nav>;
}

export function LibraryClient() {
  const [q, setQ] = useState('');
  const [cls, setCls] = useState('');
  const [level, setLevel] = useState('');
  const [school, setSchool] = useState('');
  const [subschool, setSubschool] = useState('');
  const [descriptor, setDescriptor] = useState('');
  const [duration, setDuration] = useState('');
  const [range, setRange] = useState('');
  const [limit, setLimit] = useState('20');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState<{ results: LibrarySpell[]; total: number; loading: boolean; error: string }>({ results: [], total: 0, loading: true, error: '' });
  const [selected, setSelected] = useState<LibrarySpell | null>(null);
  const [detail, setDetail] = useState<{ entry?: LibrarySpell; error?: string }>({});
  const [retry, setRetry] = useState(0);
  const topRef = useRef<HTMLDivElement>(null);
  const filterKey = [q, cls, level, school, subschool, descriptor, duration, range, limit].join('\0');
  const [seenFilters, setSeenFilters] = useState(filterKey);
  if (filterKey !== seenFilters) { setSeenFilters(filterKey); setPage(1); }
  const pageSize = Number(limit) || 20;
  const pages = Math.ceil(search.total / pageSize);
  function goToPage(number: number) {
    setPage(number);
    topRef.current?.scrollIntoView({ block: 'start' });
  }
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearch((current) => ({ results: [], total: current.total, loading: true, error: '' }));
      const query = new URLSearchParams({ kind: 'spell', system: 'pf1e', q, limit, page: String(page) });
      if (cls) query.set('cls', cls);
      if (level !== '') query.set('level', level);
      if (school) query.set('school', school);
      if (subschool) query.set('subschool', subschool);
      if (descriptor) query.set('descriptor', descriptor);
      if (duration.trim()) query.set('duration', duration.trim());
      if (range.trim()) query.set('range', range.trim());
      try {
        const response = await fetch(`/api/library?${query}`, { signal: controller.signal });
        if (!response.ok) throw new Error();
        const body = await response.json();
        if (!controller.signal.aborted) setSearch({ results: body.results, total: body.total ?? body.results.length, loading: false, error: '' });
      } catch { if (!controller.signal.aborted) setSearch({ results: [], total: 0, loading: false, error: 'Could not load the library. Please try again.' }); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [q, cls, level, school, subschool, descriptor, duration, range, limit, page, retry]);
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
  const advanced = school || subschool || descriptor || duration.trim() || range.trim();
  const options = (names: readonly string[], all: string) => <><option value="">{all}</option>{names.map((name) => <option key={name} value={name}>{classLabel(name)}</option>)}</>;
  return <div className="min-h-screen bg-background">
    <header className="border-b bg-card/80"><nav aria-label="Main navigation" className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3">
      <div className="flex items-center gap-2"><Link href="/dashboard" className="font-display text-xl font-bold text-primary">Questbound</Link></div>
      <HallNav current="/library" />
    </nav></header>
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <h1 className="flex items-center gap-2 font-display text-3xl font-bold"><BookOpen className="h-7 w-7" /> Spell Library</h1>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr]">
        <div><Label htmlFor="library-search">Search spells</Label><Input id="library-search" value={q} maxLength={120} onChange={(event) => setQ(event.target.value)} placeholder="Spell name…" /></div>
        <div><Label htmlFor="library-class">Class</Label><select id="library-class" value={cls} onChange={(event) => setCls(event.target.value)} className={selectStyle}><option value="">All classes</option>{SPELL_CLASSES.map((name) => <option key={name} value={name}>{classLabel(name)}</option>)}</select></div>
        <div><Label htmlFor="library-level">Spell level</Label><select id="library-level" value={level} onChange={(event) => setLevel(event.target.value)} className={selectStyle}><option value="">All levels</option>{Array.from({ length: 10 }, (_, index) => <option key={index} value={index}>{index === 0 ? '0 (Cantrips)' : index}</option>)}</select></div>
        <div><Label htmlFor="library-limit">Per page</Label><select id="library-limit" value={limit} onChange={(event) => setLimit(event.target.value)} className={selectStyle}><option value="20">20</option><option value="50">50</option></select></div>
      </div>
      <fieldset className="space-y-3 rounded-lg border p-4">
        <legend className="px-1 text-sm font-semibold">Advanced filters</legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div><Label htmlFor="library-school">School</Label><select id="library-school" value={school} onChange={(event) => setSchool(event.target.value)} className={selectStyle}>{options(SPELL_SCHOOLS, 'All schools')}</select></div>
          <div><Label htmlFor="library-subschool">Subschool</Label><select id="library-subschool" value={subschool} onChange={(event) => setSubschool(event.target.value)} className={selectStyle}>{options(SPELL_SUBSCHOOLS, 'All subschools')}</select></div>
          <div><Label htmlFor="library-descriptor">Descriptor</Label><select id="library-descriptor" value={descriptor} onChange={(event) => setDescriptor(event.target.value)} className={selectStyle}>{options(SPELL_DESCRIPTORS, 'All descriptors')}</select></div>
          <div><Label htmlFor="library-duration">Duration</Label><Input id="library-duration" value={duration} maxLength={80} onChange={(event) => setDuration(event.target.value)} placeholder="round, instantaneous…" /></div>
          <div><Label htmlFor="library-range">Range</Label><Input id="library-range" value={range} maxLength={80} onChange={(event) => setRange(event.target.value)} placeholder="touch, medium, long…" /></div>
        </div>
        {advanced && <Button type="button" variant="ghost" className="h-8 px-2 text-sm" onClick={() => { setSchool(''); setSubschool(''); setDescriptor(''); setDuration(''); setRange(''); }}>Clear advanced filters</Button>}
      </fieldset>
      <div ref={topRef} className="scroll-mt-4 space-y-3">
        <SpellPages page={page} pages={pages} onPage={goToPage} />
        <div aria-live="polite">{search.loading ? <p className="text-muted-foreground">Searching spells…</p> : search.error ? <div><p role="alert">{search.error}</p><Button variant="outline" onClick={() => setRetry((value) => value + 1)}>Try again</Button></div> : <p className="text-sm text-muted-foreground">{search.total} {search.total === 1 ? 'spell' : 'spells'}{pages > 1 ? ` — page ${page} of ${pages}` : ''}</p>}</div>
      </div>
      {!search.loading && !search.error && search.results.length === 0 && <p>No spells match these filters.</p>}
      <ul className="space-y-2">{search.results.map((spell) => <li key={spell.id}><button type="button" onClick={() => { setDetail({}); setSelected(spell); }} className="w-full rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent focus-visible:outline focus-visible:outline-primary">
        <h2 className="font-display font-semibold">{spell.name}</h2><p className="text-sm text-primary">{spellLevelLabel(spell)}</p><p className="mt-1 text-sm text-muted-foreground">{spell.summary}</p>
      </button></li>)}</ul>
      <SpellPages page={page} pages={pages} onPage={goToPage} />
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
