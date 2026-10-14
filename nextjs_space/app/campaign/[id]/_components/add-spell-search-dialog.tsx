'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { levelForCharacter, resolveSpellClass } from '@/components/library/spell-picker';
import { SPELL_CLASSES, classLabel, spellLevelLabel, type LibrarySpell } from '@/components/library/types';

const KNOWN = new Set<string>(SPELL_CLASSES);

/** Character classes that actually have a spell list in the library. */
export function spellcastingClasses(names: string[]): string[] {
  return [...new Set(names.map((name) => resolveSpellClass(name, SPELL_CLASSES)).filter((cls) => KNOWN.has(cls)))];
}

export function AddSpellSearchDialog({ classes, knownIds, onClose, onPick, onCustom }: {
  classes: string[];
  knownIds: string[];
  onClose: () => void;
  onPick: (spell: LibrarySpell) => void;
  onCustom: () => void;
}) {
  const inputId = useId();
  const mine = useMemo(() => spellcastingClasses(classes), [classes]);
  const [query, setQuery] = useState('');
  const [onlyMine, setOnlyMine] = useState(mine.length > 0);
  const [results, setResults] = useState<LibrarySpell[]>([]);
  const [status, setStatus] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(() => new Set(knownIds));

  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus('Searching…');
      try {
        const classNames = onlyMine && mine.length ? mine : [''];
        const lists = await Promise.all(classNames.map(async (cls) => {
          const params = new URLSearchParams({ kind: 'spell', system: 'pf1e', q: q.slice(0, 120), limit: '15' });
          if (cls) params.set('cls', cls);
          const response = await fetch(`/api/library?${params}`, { signal: controller.signal });
          if (!response.ok) throw new Error();
          return (await response.json()).results as LibrarySpell[];
        }));
        if (controller.signal.aborted) return;
        const matches = [...new Map(lists.flat().map((spell) => [spell.id, spell])).values()].slice(0, 20);
        setResults(matches);
        setStatus(matches.length ? '' : 'No spells match that search.');
      } catch {
        if (!controller.signal.aborted) { setResults([]); setStatus('Library unavailable. You can still add a custom spell.'); }
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, onlyMine, mine]);

  async function choose(spell: LibrarySpell) {
    if (added.has(spell.id) || pendingId) return;
    setPendingId(spell.id);
    try {
      const response = await fetch(`/api/library/${encodeURIComponent(spell.id)}`);
      if (!response.ok) throw new Error();
      const full = await response.json() as LibrarySpell;
      onPick(full);
      setAdded((prev) => new Set(prev).add(spell.id));
    } catch {
      setStatus('Could not add that spell. Try again.');
    } finally {
      setPendingId(null);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg flex-col gap-3 overflow-hidden">
        <DialogHeader>
          <DialogTitle>Add spell</DialogTitle>
          <DialogDescription>Search the spell library, then click a spell to put it on this sheet.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor={inputId}>Search spells</Label>
          <Input id={inputId} autoFocus value={query} maxLength={120} placeholder="Bless, fireball, cure light…" onChange={(event) => {
            const value = event.target.value;
            setQuery(value);
            if (!value.trim()) { setResults([]); setStatus(''); }
          }} />
          {mine.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={onlyMine} onChange={(event) => setOnlyMine(event.target.checked)} />
              Only spells on my lists ({mine.map(classLabel).join(', ')})
            </label>
          )}
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto" role="listbox" aria-label="Spell search results">
          {!query.trim() && <p className="px-1 py-6 text-center text-xs text-muted-foreground">Type a spell name to search the library.</p>}
          {results.map((spell) => {
            const level = levelForCharacter(spell.spellLevels ?? [], classes);
            const onSheet = added.has(spell.id);
            return (
              <button
                type="button"
                role="option"
                aria-selected={onSheet}
                key={spell.id}
                disabled={onSheet || pendingId === spell.id}
                onClick={() => void choose(spell)}
                className="flex w-full items-start gap-3 rounded-md px-2 py-2 text-left text-xs hover:bg-accent disabled:opacity-60"
              >
                <span className="w-14 shrink-0 pt-0.5 font-mono text-muted-foreground">level {level}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{spell.name}</span>
                  <span className="block truncate text-muted-foreground">{spellLevelLabel(spell)}{spell.summary ? ` — ${spell.summary}` : ''}</span>
                </span>
                <span className="shrink-0 text-muted-foreground">{onSheet ? 'On sheet' : pendingId === spell.id ? 'Adding…' : 'Add'}</span>
              </button>
            );
          })}
          {status && <p className="px-1 py-2 text-xs text-muted-foreground" role="status">{status}</p>}
        </div>
        <div className="flex items-center justify-between gap-2 border-t pt-3">
          <Button type="button" variant="ghost" size="sm" onClick={onCustom}>Add a custom spell</Button>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
