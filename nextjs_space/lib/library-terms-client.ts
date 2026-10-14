'use client';
// Client access to the library term endpoints (/api/library/terms, /[id]).
import type { TermRow } from '@/lib/library-term-match';

export type TermMatch = { id: string; name: string; kind: string; summary: string; sourceUrl: string | null };
export type FullEntry = { id: string; name: string; kind: string; summary?: string | null; sourceUrl?: string | null; data?: unknown };

// Term list: in-memory cache plus sessionStorage, revalidated with If-None-Match.
type TermCache = { etag: string | null; terms: TermRow[] };
const termCache = new Map<string, TermCache>();
const termRequests = new Map<string, Promise<TermRow[]>>();

function readStored(key: string): TermCache | null {
  try {
    const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(key) : null;
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && Array.isArray(parsed.terms) ? parsed as TermCache : null;
  } catch { return null; }
}
function writeStored(key: string, value: TermCache) {
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or unavailable */ }
}
const isTermRow = (r: unknown): r is TermRow => !!r && typeof r === 'object'
  && typeof (r as TermRow).term === 'string' && typeof (r as TermRow).entryId === 'string' && typeof (r as TermRow).kind === 'string';

export function fetchLibraryTerms(system = 'pf1e', kind = 'rule'): Promise<TermRow[]> {
  const key = `qb:library-terms:${system}:${kind}`;
  const pending = termRequests.get(key);
  if (pending) return pending;
  const request = (async () => {
    const cached = termCache.get(key) ?? readStored(key);
    const headers: HeadersInit = cached?.etag ? { 'If-None-Match': cached.etag } : {};
    try {
      const res = await fetch(`/api/library/terms?${new URLSearchParams({ system, kind })}`, { headers, cache: 'no-cache' });
      if (res.status === 304 && cached) { termCache.set(key, cached); return cached.terms; }
      if (!res.ok) return cached?.terms ?? [];
      const body: unknown = await res.json();
      const terms = Array.isArray(body) ? body.filter(isTermRow) : [];
      const next = { etag: res.headers.get('ETag'), terms };
      termCache.set(key, next);
      writeStored(key, next);
      return terms;
    } catch {
      return cached?.terms ?? [];
    }
  })();
  termRequests.set(key, request);
  // Allow revalidation on a later call (e.g. next page mount) while sharing this one.
  request.finally(() => setTimeout(() => termRequests.delete(key), 30_000));
  return request;
}

const entryCache = new Map<string, Promise<FullEntry | null>>();
export function fetchLibraryEntry(id: string): Promise<FullEntry | null> {
  const hit = entryCache.get(id);
  if (hit) return hit;
  const p = (async () => {
    try {
      const res = await fetch(`/api/library/${encodeURIComponent(id)}`);
      return res.ok ? await res.json() as FullEntry : null;
    } catch { return null; }
  })();
  entryCache.set(id, p);
  p.then(e => { if (!e) entryCache.delete(id); });
  return p;
}

/** Plain text of a rule entry's data, or null. */
export function entryText(entry: FullEntry | null): string | null {
  const data = entry?.data;
  if (data && typeof data === 'object' && typeof (data as { text?: unknown }).text === 'string') return (data as { text: string }).text;
  return null;
}
