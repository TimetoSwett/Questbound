'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { type LibrarySpell, spellLevelLabel } from './types';

export function SpellPicker({ value, classes, disabled, onChange, onPick }: {
  value: string; classes: string[]; disabled?: boolean;
  onChange: (value: string) => void; onPick: (spell: LibrarySpell) => void;
}) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const [results, setResults] = useState<LibrarySpell[]>([]);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState('');
  const request = useRef<AbortController | null>(null);
  const latest = useRef({ value, onPick });
  useEffect(() => { latest.current = { value, onPick }; }, [value, onPick]);
  const classKey = [...new Set(classes.map(normalizeSpellClass).filter(Boolean))].join(',');
  useEffect(() => {
    if (!focused || !value.trim() || disabled) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus('Searching…');
      try {
        const classNames = classKey ? classKey.split(',') : [''];
        const lists = await Promise.all(classNames.map(async (cls) => {
          const query = new URLSearchParams({ kind: 'spell', system: 'pf1e', q: value.trim().slice(0, 120), limit: '10' });
          if (cls) query.set('cls', cls);
          const response = await fetch(`/api/library?${query}`, { signal: controller.signal });
          if (!response.ok) throw new Error();
          return (await response.json()).results as LibrarySpell[];
        }));
        if (controller.signal.aborted) return;
        const matches = [...new Map(lists.flat().map((spell) => [spell.id, spell])).values()].slice(0, 10);
        setResults(matches); setActive(-1); setStatus(matches.length ? '' : 'No library matches. Keep typing your own spell.');
      } catch { if (!controller.signal.aborted) setStatus('Library unavailable. Free typing still works.'); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [value, classKey, focused, disabled]);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (focused && active >= 0) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, focused, id]);
  async function pick(spell: LibrarySpell) {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    const pickedValue = value;
    setFocused(false); setResults([]); setStatus('Loading spell…');
    try {
      const response = await fetch(`/api/library/${encodeURIComponent(spell.id)}`, { signal: controller.signal });
      if (!response.ok) throw new Error();
      const full = await response.json() as LibrarySpell;
      if (!controller.signal.aborted && latest.current.value === pickedValue) latest.current.onPick(full);
      if (!controller.signal.aborted) setStatus('');
    } catch { if (!controller.signal.aborted) setStatus('Could not load spell. Your text is unchanged.'); }
  }
  const open = focused && Boolean(value.trim()) && !disabled;
  return <div className="relative min-w-0">
    <Input role="combobox" aria-label="Spell name" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={open && active >= 0 ? `${id}-${active}` : undefined}
      value={value} disabled={disabled} placeholder="Spell name" className="h-7 text-xs"
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      onChange={(event) => { request.current?.abort(); setResults([]); setActive(-1); setStatus(''); setFocused(true); onChange(event.target.value); }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') { setFocused(false); return; }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); setFocused(true);
          if (results.length) setActive((index) => event.key === 'ArrowDown' ? (index + 1) % results.length : (index <= 0 ? results.length - 1 : index - 1));
        }
        if (event.key === 'Enter' && open && active >= 0 && results[active]) { event.preventDefault(); void pick(results[active]); }
      }} />
    {open && <div id={`${id}-list`} role="listbox" aria-label="Library spells" className="absolute left-0 top-full z-40 mt-1 max-h-64 w-[min(36rem,calc(100vw-4rem))] max-w-[calc(100vw-4rem)] overflow-auto rounded-md border bg-popover p-1 shadow-lg">
      {results.map((spell, index) => <button type="button" role="option" aria-selected={index === active} id={`${id}-${index}`} key={spell.id}
        className={`flex w-full gap-2 rounded p-2 text-left text-xs ${index === active ? 'bg-accent' : 'hover:bg-accent'}`}
        onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => void pick(spell)}>
        <span className="shrink-0 font-semibold">{spell.name}</span><span className="max-w-40 truncate text-muted-foreground">{spellLevelLabel(spell)}</span><span className="min-w-0 truncate text-muted-foreground">{spell.summary}</span>
      </button>)}
      {status && <p className="p-2 text-xs text-muted-foreground" role="status">{status}</p>}
    </div>}
    {!open && status && <p className="text-xs text-muted-foreground" role="status">{status}</p>}
  </div>;
}

/** "Wizard (Evoker)" -> "wizard": ignore parenthetical archetypes/variants when matching spell lists. */
export function normalizeSpellClass(cls: string): string {
  return cls.replace(/\([^)]*\)/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
}
