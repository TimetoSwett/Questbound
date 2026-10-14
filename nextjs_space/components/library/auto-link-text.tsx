'use client';
// Wraps known library terms in plain text with LibraryTermPopover. Text is never parsed as HTML.
import * as React from 'react';
import { buildTermIndex, matchTerms, type TermIndex } from '@/lib/library-term-match';
import { getTermRefresher, TERMS_INVALIDATED_EVENT } from '@/lib/library-terms-client';
import { LibraryTermPopover } from '@/components/library/library-term-popover';

// One shared term index per (system, kind) for the whole page, shared by every AutoLinkText.
// It is rebuilt only when a revalidation reports changed terms (see createTermRefresher).
type IndexEntry = { index: TermIndex | null; listeners: Set<() => void>; started: boolean; system: string; kind: string };
const indexes = new Map<string, IndexEntry>();
const entryFor = (key: string, system: string, kind: string) => {
  let e = indexes.get(key);
  if (!e) { e = { index: null, listeners: new Set(), started: false, system, kind }; indexes.set(key, e); }
  return e;
};

function refreshEntry(e: IndexEntry, opts: { force?: boolean; throttle?: boolean }) {
  void getTermRefresher(e.system, e.kind).refresh(opts).then(({ terms, changed }) => {
    if (!changed && e.index) return;
    e.index = buildTermIndex(terms);
    e.listeners.forEach(l => l());
  });
}

// Page-wide triggers: attached once while any subscriber exists, removed when the last one leaves.
const REFRESH_INTERVAL_MS = 5 * 60_000;
let subscriberCount = 0;
let detach: (() => void) | null = null;
function refreshActive(opts: { force?: boolean; throttle?: boolean }) {
  indexes.forEach(e => { if (e.listeners.size > 0) refreshEntry(e, opts); });
}
function attachTriggers() {
  if (typeof window === 'undefined') return;
  const onFocus = () => refreshActive({ throttle: true });
  const onVisible = () => { if (document.visibilityState === 'visible') refreshActive({ throttle: true }); };
  const onInvalidate = () => refreshActive({ force: true });
  const timer = setInterval(() => refreshActive({}), REFRESH_INTERVAL_MS);
  window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener(TERMS_INVALIDATED_EVENT, onInvalidate);
  detach = () => {
    clearInterval(timer);
    window.removeEventListener('focus', onFocus);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener(TERMS_INVALIDATED_EVENT, onInvalidate);
  };
}

export function useLibraryTermIndex(system = 'pf1e', kind = 'rule'): TermIndex | null {
  const key = `${system}:${kind}`;
  const subscribe = React.useCallback((cb: () => void) => {
    const e = entryFor(key, system, kind);
    e.listeners.add(cb);
    if (subscriberCount++ === 0) attachTriggers();
    if (!e.started) {
      e.started = true;
      refreshEntry(e, {});
    }
    return () => {
      e.listeners.delete(cb);
      if (--subscriberCount === 0) { detach?.(); detach = null; }
    };
  }, [key, system, kind]);
  return React.useSyncExternalStore(subscribe, () => entryFor(key, system, kind).index, () => null);
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
