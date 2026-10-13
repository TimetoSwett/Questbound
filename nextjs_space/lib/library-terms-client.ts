'use client';
// Client access to library term endpoints. The real backend is in progress; until it ships,
// a dev-only mock is used when NEXT_PUBLIC_LIBRARY_TERMS_MOCK=1, or (outside production) when
// the real endpoint returns 404. Delete the mock block once the endpoints exist.
import type { TermRow } from '@/lib/library-term-match';

export type TermMatch = { id: string; name: string; kind: string; summary: string; sourceUrl: string | null };
export type FullEntry = { id: string; name: string; kind: string; summary?: string | null; sourceUrl?: string | null; data?: unknown };

export const LOOKUP_MAX_TERMS = 50;
export const LOOKUP_MAX_TERM_CHARS = 80;

const FORCE_MOCK = process.env.NEXT_PUBLIC_LIBRARY_TERMS_MOCK === '1';
const MOCK_ALLOWED = FORCE_MOCK || process.env.NODE_ENV !== 'production';

// ---------------- dev mock ----------------
type MockRule = TermMatch & { aliases: string[]; category: string; format: string; text: string };
const MOCK_RULES: MockRule[] = [
  { id: 'mock-grab', name: 'Grab', kind: 'rule', aliases: [], category: 'Universal Monster Rule', format: 'grab (attack)',
    summary: 'If the creature hits with the listed attack, it can start a grapple as a free action without provoking.',
    sourceUrl: 'https://aonprd.com/UMR.aspx?ItemName=Grab',
    text: 'If a creature with this special attack hits with the indicated attack, it deals normal damage and attempts to start a grapple as a free action without provoking an attack of opportunity. It gains a +4 bonus on combat maneuver checks made to start and maintain a grapple.' },
  { id: 'mock-greater-grab', name: 'Greater Grab', kind: 'rule', aliases: [], category: 'Universal Monster Rule', format: 'greater grab',
    summary: 'Maintaining a grapple is a move action, and successful checks deal the grab attack\'s damage.',
    sourceUrl: 'https://aonprd.com/UMR.aspx?ItemName=Greater%20Grab',
    text: 'A creature with this ability can maintain a grapple as a move action. Each successful grapple check it makes during successive rounds automatically deals the damage indicated for the attack that established the hold.' },
  { id: 'mock-rend', name: 'Rend', kind: 'rule', aliases: [], category: 'Universal Monster Rule', format: 'rend (2 claws, 1d8+9)',
    summary: 'If it hits with both listed attacks in a round, it latches on and tears flesh for extra damage.',
    sourceUrl: 'https://aonprd.com/UMR.aspx?ItemName=Rend',
    text: 'If it hits with both of the listed attacks in 1 round, a creature with the rend special attack latches onto the opponent\'s body and tears the flesh. This attack deals an additional amount of damage, but no more than once per round.' },
  { id: 'mock-pounce', name: 'Pounce', kind: 'rule', aliases: [], category: 'Universal Monster Rule', format: 'pounce',
    summary: 'When it charges, the creature can make a full attack.',
    sourceUrl: 'https://aonprd.com/UMR.aspx?ItemName=Pounce',
    text: 'When a creature with this special attack makes a charge, it can make a full attack (including rake attacks if the creature also has the rake ability).' },
  { id: 'mock-dr', name: 'Damage Reduction', kind: 'rule', aliases: ['DR'], category: 'Universal Monster Rule', format: 'DR 5/silver',
    summary: 'Ignores a set amount of damage from most weapons and natural attacks.',
    sourceUrl: 'https://aonprd.com/UMR.aspx?ItemName=Damage%20Reduction',
    text: 'A creature with this special quality ignores damage from most weapons and natural attacks. Wounds heal immediately, or the weapon bounces off harmlessly.' },
];
const mockTerms = (): TermRow[] => MOCK_RULES
  .flatMap(r => [r.name, ...r.aliases].map(term => ({ term, entryId: r.id, kind: r.kind })))
  .sort((a, b) => b.term.length - a.term.length);
const mockLookup = (terms: string[]) => terms.map(term => {
  const t = term.toLowerCase();
  const r = MOCK_RULES.find(x => [x.name, ...x.aliases].some(n => n.toLowerCase() === t));
  return { term, match: r ? { id: r.id, name: r.name, kind: r.kind, summary: r.summary, sourceUrl: r.sourceUrl } : null };
});
const mockEntry = (id: string): FullEntry | null => {
  const r = MOCK_RULES.find(x => x.id === id);
  return r ? { id: r.id, name: r.name, kind: r.kind, summary: r.summary, sourceUrl: r.sourceUrl,
    data: { category: r.category, format: r.format, text: r.text, aliases: r.aliases } } : null;
};
const isMockId = (id: string) => id.startsWith('mock-');
// ------------------------------------------

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
    if (FORCE_MOCK) return mockTerms();
    const cached = termCache.get(key) ?? readStored(key);
    const headers: HeadersInit = cached?.etag ? { 'If-None-Match': cached.etag } : {};
    try {
      const res = await fetch(`/api/library/terms?${new URLSearchParams({ system, kind })}`, { headers, cache: 'no-cache' });
      if (res.status === 304 && cached) { termCache.set(key, cached); return cached.terms; }
      if (res.status === 404 && MOCK_ALLOWED) return mockTerms();
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

// Lookup: batched, cached per lowercase term.
const lookupCache = new Map<string, Promise<TermMatch | null>>();
let queue: { term: string; resolve: (m: TermMatch | null) => void }[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function postLookup(terms: string[]): Promise<(TermMatch | null)[]> {
  if (FORCE_MOCK) return mockLookup(terms).map(r => r.match);
  try {
    const res = await fetch('/api/library/lookup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ terms }),
    });
    if (res.status === 404 && MOCK_ALLOWED) return mockLookup(terms).map(r => r.match);
    if (!res.ok) return terms.map(() => null);
    const body: unknown = await res.json();
    return terms.map((_, i) => {
      const m = Array.isArray(body) ? (body[i] as { match?: TermMatch | null } | undefined)?.match : null;
      return m && typeof m.id === 'string' && typeof m.name === 'string' ? m : null;
    });
  } catch {
    return terms.map(() => null);
  }
}

function flush() {
  flushTimer = null;
  const batch = queue;
  queue = [];
  for (let i = 0; i < batch.length; i += LOOKUP_MAX_TERMS) {
    const chunk = batch.slice(i, i + LOOKUP_MAX_TERMS);
    void postLookup(chunk.map(c => c.term)).then(results => chunk.forEach((c, j) => c.resolve(results[j] ?? null)));
  }
}

export function lookupLibraryTerm(term: string): Promise<TermMatch | null> {
  const clean = term.trim().slice(0, LOOKUP_MAX_TERM_CHARS);
  const key = clean.toLowerCase();
  if (!key) return Promise.resolve(null);
  const hit = lookupCache.get(key);
  if (hit) return hit;
  const p = new Promise<TermMatch | null>(resolve => {
    queue.push({ term: clean, resolve });
    flushTimer ??= setTimeout(flush, 15);
  });
  lookupCache.set(key, p);
  p.then(m => { if (!m) setTimeout(() => lookupCache.delete(key), 60_000); });
  return p;
}

const entryCache = new Map<string, Promise<FullEntry | null>>();
export function fetchLibraryEntry(id: string): Promise<FullEntry | null> {
  const hit = entryCache.get(id);
  if (hit) return hit;
  const p = (async () => {
    if (isMockId(id)) return MOCK_ALLOWED ? mockEntry(id) : null;
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
