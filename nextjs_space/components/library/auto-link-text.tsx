'use client';
// Wraps known library terms in plain text with LibraryTermPopover. Text is never parsed as HTML.
import * as React from 'react';
import { buildTermIndex, matchTerms, type TermIndex } from '@/lib/library-term-match';
import { fetchLibraryTerms } from '@/lib/library-terms-client';
import { LibraryTermPopover } from '@/components/library/library-term-popover';

export function useLibraryTermIndex(system = 'pf1e', kind = 'rule'): TermIndex | null {
  const [index, setIndex] = React.useState<TermIndex | null>(null);
  React.useEffect(() => {
    let alive = true;
    void fetchLibraryTerms(system, kind).then(rows => { if (alive) setIndex(buildTermIndex(rows)); });
    return () => { alive = false; };
  }, [system, kind]);
  return index;
}

export function AutoLinkText({ text, system = 'pf1e', kind = 'rule' }: { text: string; system?: string; kind?: string }) {
  const index = useLibraryTermIndex(system, kind);
  const segments = React.useMemo(() => (index ? matchTerms(text, index) : null), [index, text]);
  if (!segments) return <>{text}</>;
  return (
    <>
      {segments.map((s, i) => (s.match
        ? <LibraryTermPopover key={i} term={s.text}>{s.text}</LibraryTermPopover>
        : <React.Fragment key={i}>{s.text}</React.Fragment>))}
    </>
  );
}
