'use client';
// Client access to the library term endpoints (/api/library/terms, /[id]).
import type { TermRow } from '@/lib/library-term-match';

export type FullEntry = { id: string; name: string; kind: string; summary?: string | null; sourceUrl?: string | null; data?: unknown };

// Term list: in-memory cache plus sessionStorage, revalidated with If-None-Match.
type TermCache = { etag: string | null; terms: TermRow[] };
export type TermsResult = { terms: TermRow[]; changed: boolean };

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

export const TERMS_THROTTLE_MS = 30_000;

type RefresherOptions = {
  system?: string; kind?: string;
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>;
  now?: () => number;
  load?: (key: string) => TermCache | null;
  save?: (key: string, value: TermCache) => void;
  throttleMs?: number;
};

/**
 * Conditional-GET refresher for one (system, kind) term list. At most one request is in flight;
 * `refresh()` joins it, `refresh({ force: true })` queues one follow-up after it (so a forced
 * refresh never returns data older than the call). `{ throttle: true }` skips the request when the
 * last one started under `throttleMs` ago (for focus/visibility triggers). `changed` is true when
 * the terms differ from what this refresher last held (always true for the first result if none was
 * held), so callers rebuild their index only when needed.
 */
export function createTermRefresher(opts: RefresherOptions = {}) {
  const { system = 'pf1e', kind = 'rule', throttleMs = TERMS_THROTTLE_MS } = opts;
  const key = `qb:library-terms:${system}:${kind}`;
  const fetchImpl = opts.fetchImpl ?? ((url, init) => fetch(url, init));
  const now = opts.now ?? Date.now;
  const load = opts.load ?? readStored;
  const save = opts.save ?? writeStored;
  let cache: TermCache | null = null;
  let loaded = false; // a request has completed since creation
  let lastStart = -Infinity;
  let inflight: Promise<TermsResult> | null = null;
  let queued: Promise<TermsResult> | null = null;

  async function run(): Promise<TermsResult> {
    lastStart = now();
    const prev = cache ?? (cache = load(key));
    const headers: Record<string, string> = prev?.etag ? { 'If-None-Match': prev.etag } : {};
    const unchanged = (): TermsResult => ({ terms: prev?.terms ?? [], changed: false });
    try {
      const res = await fetchImpl(`/api/library/terms?${new URLSearchParams({ system, kind })}`, { headers, cache: 'no-cache' });
      if (res.status === 304 && prev) return unchanged();
      if (!res.ok) return unchanged();
      const body: unknown = await res.json();
      const terms = Array.isArray(body) ? body.filter(isTermRow) : [];
      const etag = res.headers.get('ETag');
      const same = !!prev && (etag && prev.etag ? etag === prev.etag : JSON.stringify(prev.terms) === JSON.stringify(terms));
      if (same) return unchanged();
      cache = { etag, terms };
      save(key, cache);
      return { terms, changed: true };
    } catch {
      return unchanged();
    } finally {
      loaded = true;
    }
  }
  function start(): Promise<TermsResult> {
    const p = run().finally(() => { if (inflight === p) inflight = null; });
    inflight = p;
    return p;
  }

  return {
    key,
    /** Terms held (memory or sessionStorage), or null before anything is known. */
    current: (): TermRow[] | null => (cache ?? (cache = load(key)))?.terms ?? null,
    /** True once a request has completed. */
    isLoaded: () => loaded,
    refresh({ force = false, throttle = false }: { force?: boolean; throttle?: boolean } = {}): Promise<TermsResult> {
      if (inflight) {
        if (!force) return inflight;
        // Data may predate the caller's change: run exactly one more request once this one ends.
        return queued ??= inflight.then(() => { queued = null; return start(); });
      }
      if (throttle && now() - lastStart < throttleMs) return Promise.resolve({ terms: this.current() ?? [], changed: false });
      return start();
    },
  };
}
export type TermRefresher = ReturnType<typeof createTermRefresher>;

// Shared refreshers per (system, kind), plus an invalidation counter.
const refreshers = new Map<string, TermRefresher>();
const loadedVersion = new Map<string, number>();
let termsVersion = 0;
export const TERMS_INVALIDATED_EVENT = 'qb:library-terms-invalidated';

export function getTermRefresher(system = 'pf1e', kind = 'rule'): TermRefresher {
  const k = `${system}:${kind}`;
  let r = refreshers.get(k);
  if (!r) { r = createTermRefresher({ system, kind }); refreshers.set(k, r); }
  return r;
}

/**
 * Call after creating, editing or deleting a library rule so auto-linked text picks it up.
 * Bumps the term version (the next fetchLibraryTerms revalidates) and fires
 * 'qb:library-terms-invalidated' on window, which active AutoLinkText stores answer with an
 * unthrottled revalidation. Safe during SSR (no event is dispatched).
 */
export function invalidateLibraryTerms(): void {
  termsVersion++;
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(TERMS_INVALIDATED_EVENT));
}

/** Conditional GET now (queues after any in-flight request); reports whether terms changed. */
export async function revalidateLibraryTerms(system = 'pf1e', kind = 'rule'): Promise<TermsResult> {
  const r = await getTermRefresher(system, kind).refresh({ force: true });
  loadedVersion.set(`${system}:${kind}`, termsVersion);
  return r;
}

/** Cached terms; loads on first use, and revalidates when asked or after invalidateLibraryTerms(). */
export async function fetchLibraryTerms(system = 'pf1e', kind = 'rule', opts: { revalidate?: boolean } = {}): Promise<TermRow[]> {
  const r = getTermRefresher(system, kind);
  const stale = (loadedVersion.get(`${system}:${kind}`) ?? 0) !== termsVersion;
  if (opts.revalidate || stale) return (await revalidateLibraryTerms(system, kind)).terms;
  if (!r.isLoaded()) return (await r.refresh()).terms;
  return r.current() ?? [];
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
