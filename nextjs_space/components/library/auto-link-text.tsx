'use client';
// Wraps known library terms in plain text with LibraryTermPopover. Text is never parsed as HTML.
import * as React from 'react';
import { buildTermIndex, matchTerms, type TermIndex } from '@/lib/library-term-match';
import { fetchLibraryTerms } from '@/lib/library-terms-client';
import { LibraryTermPopover } from '@/components/library/library-term-popover';

// One shared term index per (system, kind) for the whole page, built once and shared by every AutoLinkText.
type IndexEntry = { index: TermIndex | null; listeners: Set<() => void>; started: boolean };
const indexes = new Map<string, IndexEntry>();
const entryFor = (key: string) => {
  let e = indexes.get(key);
  if (!e) { e = { index: null, listeners: new Set(), started: false }; indexes.set(key, e); }
  return e;
};

export function useLibraryTermIndex(system = 'pf1e', kind = 'rule'): TermIndex | null {
  const key = `${system}:${kind}`;
  const subscribe = React.useCallback((cb: () => void) => {
    const e = entryFor(key);
    e.listeners.add(cb);
    if (!e.started) {
      e.started = true;
      void fetchLibraryTerms(system, kind).then(rows => {
        e.index = buildTermIndex(rows);
        e.listeners.forEach(l => l());
      });
    }
    return () => { e.listeners.delete(cb); };
  }, [key, system, kind]);
  return React.useSyncExternalStore(subscribe, () => entryFor(key).index, () => null);
}

export function AutoLinkText({ text, system = 'pf1e', kind = 'rule' }: { text: string; system?: string; kind?: string }) {
  const index = useLibraryTermIndex(system, kind);
  const segments = React.useMemo(() => (index ? matchTerms(text, index) : null), [index, text]);
  if (!segments) return <>{text}</>;
  return (
    <>
      {segments.map((s, i) => (s.match
        ? <LibraryTermPopover key={i} term={s.text} entryId={s.match.entryId}>{s.text}</LibraryTermPopover>
        : <React.Fragment key={i}>{s.text}</React.Fragment>))}
    </>
  );
}
