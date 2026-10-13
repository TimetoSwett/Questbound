#!/usr/bin/env tsx
/*
 * Archives of Nethys (aonprd.com, PF1e) spell importer -> shared library.
 *
 *   npm run import:aon-spells -- [--limit N] [--dry-run] [--delay 2000]
 *        [--retry-failed] [--refresh-index] [--dir .aon-import] [--allow-remote-db] [--skip-dns-check]
 *        [--export <spells.jsonl>]
 *   npm run import:aon-spells -- --from-file <spells.jsonl> [--limit N] [--dry-run] [--allow-remote-db]
 *
 * - --export: append every parsed spell (the exact upsert input: kind, system,
 *   name, summary, sourceUrl, data, spellLevels) as one JSON line. Resume-safe:
 *   records already in the file (by sourceUrl) are not appended again, and a
 *   torn last line from a kill is skipped/terminated.
 * - --from-file: no network. Validates each line with the library schemas and
 *   upserts it (same idempotent upsert), so a live deploy can load from file.
 *
 * - Target DB: DATABASE_URL. Non-localhost databases are refused unless
 *   --allow-remote-db is given (guards against hitting production by accident).
 * - Polite: one request at a time, >= --delay ms (default 2000, min 1500)
 *   between page fetches; backs off on 429/5xx/network errors and honors
 *   Retry-After. Uses the same guarded fetcher as the monster importer.
 * - Resumable: <dir>/checkpoint.json holds the cached spell index and a status
 *   per spell URL; it is rewritten atomically after every spell, so Ctrl-C or
 *   kill at any point resumes without refetching finished pages.
 * - Idempotent: writes go through upsertLibraryEntry (user entries only get
 *   sourceUrl + matchedAon; AoN entries are updated).
 * - Parse/validation/fetch failures go to <dir>/report.jsonl; the run continues.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fetchStatblockHtml } from '../lib/statblock-fetch';
import { AON_SPELL_INDEX_URL, parseSpellIndex, parseSpellPage, type AonIndexItem } from '../lib/aon-spell-parser';
import { spellDataSchema, spellLevelsSchema, sanitizeSummary, upsertLibraryEntry, normalizeNameKey, type UpsertInput } from '../lib/library';

type Status = 'created' | 'matched' | 'updated' | 'failed' | 'dry-ok';
type Checkpoint = { version: 1; indexFetchedAt: string | null; items: AonIndexItem[]; status: Record<string, Status> };

const USER_AGENT = 'Mozilla/5.0 (compatible; QuestboundSpellImporter/1.0; polite PF1e spell library import, ~1 req/2s)';

function args(argv: string[]) {
  const o = { limit: Infinity, dryRun: false, delay: 2000, retryFailed: false, refreshIndex: false, dir: '.aon-import', allowRemoteDb: false, skipDnsCheck: false, exportPath: '', fromFile: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--limit') o.limit = Math.max(0, Number(argv[++i]));
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--delay') o.delay = Math.max(1500, Number(argv[++i]) || 2000);
    else if (a === '--retry-failed') o.retryFailed = true;
    else if (a === '--refresh-index') o.refreshIndex = true;
    else if (a === '--dir') o.dir = argv[++i];
    else if (a === '--allow-remote-db') o.allowRemoteDb = true;
    else if (a === '--skip-dns-check') o.skipDnsCheck = true;
    else if (a === '--export') o.exportPath = argv[++i];
    else if (a === '--from-file') o.fromFile = argv[++i];
    else if (a === '--help' || a === '-h') { console.log(readFileSync(new URL(import.meta.url)).toString().split('*/')[0]); process.exit(0); }
    else throw new Error(`Unknown option ${a}`);
  }
  if (!Number.isFinite(o.limit) && o.limit !== Infinity) throw new Error('--limit must be a number');
  return o;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Polite fetcher: spacing, backoff on 429/5xx/network, Retry-After. */
export function createPoliteFetcher(delayMs: number, opts: { maxRetries?: number; log?: (s: string) => void; fetchImpl?: typeof fetch; sleepImpl?: (ms: number) => Promise<void>; now?: () => number; resolver?: (host: string) => Promise<Array<{ address: string }>> } = {}) {
  const { maxRetries = 5, log = console.log, fetchImpl = fetch, sleepImpl = sleep, now = Date.now, resolver } = opts;
  let last = 0;
  let requests = 0;
  const get = async (url: string, maxBytes?: number): Promise<string> => {
    for (let attempt = 0; ; attempt++) {
      const wait = last + delayMs - now();
      if (wait > 0) await sleepImpl(wait);
      last = now();
      requests++;
      let status = 0;
      let retryAfter: string | null = null;
      const capture: typeof fetch = async (input, init) => {
        const r = await fetchImpl(input, init);
        status = r.status;
        retryAfter = r.headers.get('retry-after');
        return r;
      };
      try {
        const { html } = await fetchStatblockHtml(url, capture, 30_000, resolver as never, { maxBytes, userAgent: USER_AGENT });
        return html;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Policy refusals (blocked host/address, redirect, size cap) are permanent; don't back off on them.
        const policy = /^(Blocked|Redirect refused|Invalid URL|Source exceeds)/.test(msg);
        const retryable = !policy && (status === 429 || status >= 500 || status === 0);
        if (!retryable || attempt >= maxRetries) throw Object.assign(new Error(msg), { status });
        let backoff = Math.min(300_000, 5000 * 2 ** attempt);
        if (retryAfter) {
          const secs = Number(retryAfter);
          const at = Number.isFinite(secs) ? secs * 1000 : Date.parse(retryAfter) - now();
          if (Number.isFinite(at) && at > 0) backoff = Math.min(600_000, Math.max(backoff, at));
        }
        log(`  ! ${status || 'network'} on ${url} (${msg}); backing off ${Math.round(backoff / 1000)}s`);
        await sleepImpl(backoff);
        last = now();
      }
    }
  };
  return { get, stats: () => ({ requests }) };
}

export type ExportRecord = UpsertInput & { kind: 'spell'; system: 'pf1e' | 'dnd35'; sourceUrl: string; summary: string };

/** Read an export file: valid records (validated with the library schemas) + bad line numbers. Torn/blank lines are skipped. */
export function readExportFile(path: string): { records: ExportRecord[]; bad: Array<{ line: number; error: string }>; urls: Set<string> } {
  const records: ExportRecord[] = [];
  const bad: Array<{ line: number; error: string }> = [];
  const urls = new Set<string>();
  if (!existsSync(path)) return { records, bad, urls };
  readFileSync(path, 'utf8').split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    try {
      const r = JSON.parse(line);
      if (r?.kind !== 'spell' || !['pf1e', 'dnd35'].includes(r?.system) || typeof r?.name !== 'string' || !r.name.trim() || typeof r?.sourceUrl !== 'string') throw new Error('missing kind/system/name/sourceUrl');
      const rec: ExportRecord = { kind: 'spell', system: r.system, name: r.name.trim().slice(0, 120), sourceUrl: r.sourceUrl, summary: sanitizeSummary(r.summary ?? ''), data: spellDataSchema.parse(r.data), spellLevels: spellLevelsSchema.parse(r.spellLevels ?? []) };
      records.push(rec);
      urls.add(rec.sourceUrl);
    } catch (e) {
      bad.push({ line: i + 1, error: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
    }
  });
  return { records, bad, urls };
}

/** Appender that never writes a sourceUrl twice and repairs a torn last line first. */
export function createExporter(path: string) {
  const { urls } = readExportFile(path);
  if (existsSync(path)) {
    const buf = readFileSync(path);
    if (buf.length && buf[buf.length - 1] !== 0x0a) appendFileSync(path, '\n');
  }
  return {
    has: (url: string) => urls.has(url),
    write(rec: ExportRecord): boolean {
      if (urls.has(rec.sourceUrl)) return false;
      appendFileSync(path, JSON.stringify(rec) + '\n');
      urls.add(rec.sourceUrl);
      return true;
    },
  };
}

/** Upsert every record of an export file (no network). */
export async function loadFromFile(db: Parameters<typeof upsertLibraryEntry>[0] | null, path: string, opts: { limit?: number; dryRun?: boolean; log?: (s: string) => void } = {}) {
  const { records, bad } = readExportFile(path);
  const todo = records.slice(0, opts.limit ?? undefined);
  const counts: Record<string, number> = { invalid: bad.length };
  for (const rec of todo) {
    const action = opts.dryRun || !db ? 'valid' : (await upsertLibraryEntry(db, rec)).action;
    counts[action] = (counts[action] ?? 0) + 1;
  }
  return { counts, bad, total: records.length };
}

function loadCheckpoint(path: string): Checkpoint {
  if (!existsSync(path)) return { version: 1, indexFetchedAt: null, items: [], status: {} };
  return JSON.parse(readFileSync(path, 'utf8'));
}
function saveCheckpoint(path: string, cp: Checkpoint) {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(cp));
  renameSync(tmp, path); // atomic on POSIX: a kill never leaves a torn file
}

async function main() {
  const o = args(process.argv.slice(2));
  const dbUrl = process.env.DATABASE_URL ?? '';
  if (!o.dryRun) {
    if (!dbUrl) throw new Error('DATABASE_URL is required (or use --dry-run)');
    // Unparseable URLs count as remote; a ?host= override (libpq/Prisma) must also be local or a socket path.
    const host = (() => { try { const u = new URL(dbUrl); const q = u.searchParams.get('host'); return q && !q.startsWith('/') ? q : u.hostname; } catch { return '(unparseable)'; } })();
    if (!['localhost', '127.0.0.1', '::1', '[::1]', ''].includes(host) && !o.allowRemoteDb) throw new Error(`Refusing non-local DB host "${host}" without --allow-remote-db`);
  }
  if (o.fromFile) {
    const { prisma } = o.dryRun ? { prisma: null } : await import('../lib/prisma');
    const t = Date.now();
    const res = await loadFromFile(prisma, resolve(o.fromFile), { limit: o.limit === Infinity ? undefined : o.limit, dryRun: o.dryRun });
    for (const b of res.bad.slice(0, 20)) console.log(`  invalid line ${b.line}: ${b.error}`);
    console.log(`From file: ${res.total} valid records; ${JSON.stringify(res.counts)} in ${((Date.now() - t) / 1000).toFixed(1)}s${o.dryRun ? ' (dry run, no DB writes)' : ''}`);
    if (prisma) await prisma.$disconnect();
    return;
  }
  const dir = resolve(o.dir);
  mkdirSync(dir, { recursive: true });
  const exporter = o.exportPath ? createExporter(resolve(o.exportPath)) : null;
  const cpPath = join(dir, o.dryRun ? 'checkpoint.dry-run.json' : 'checkpoint.json');
  const reportPath = join(dir, 'report.jsonl');
  const cp = loadCheckpoint(cpPath);
  // --skip-dns-check: for sandboxes whose DNS returns proxy (198.18/15) addresses.
  // The host allowlist (aonprd.com, HTTPS only) still applies.
  const fetcher = createPoliteFetcher(o.delay, o.skipDnsCheck ? { resolver: async () => [{ address: '93.184.216.34' }] } : {});

  let stop = false;
  const onSignal = (sig: string) => { if (stop) process.exit(130); stop = true; console.log(`\n${sig}: finishing current spell, then saving checkpoint (press again to force)`); };
  process.on('SIGINT', () => onSignal('SIGINT'));
  process.on('SIGTERM', () => onSignal('SIGTERM'));

  if (!cp.items.length || o.refreshIndex) {
    console.log(`Fetching spell index ${AON_SPELL_INDEX_URL}`);
    const html = await fetcher.get(AON_SPELL_INDEX_URL, 8 * 1024 * 1024);
    cp.items = parseSpellIndex(html);
    cp.indexFetchedAt = new Date().toISOString();
    if (!cp.items.length) throw new Error('Spell index parsed to 0 spells; layout changed?');
    saveCheckpoint(cpPath, cp);
    console.log(`Index: ${cp.items.length} spells (cached in checkpoint)`);
  }

  const { prisma } = o.dryRun ? { prisma: null } : await import('../lib/prisma');
  const pending = cp.items.filter((it) => !cp.status[it.url] || (o.retryFailed && cp.status[it.url] === 'failed'));
  const todo = pending.slice(0, o.limit === Infinity ? undefined : o.limit);
  console.log(`${Object.keys(cp.status).length}/${cp.items.length} already processed; ${pending.length} pending; doing ${todo.length}${o.dryRun ? ' (dry run)' : ''}`);
  const counts: Record<string, number> = {};
  const t0 = Date.now();
  for (const [i, item] of todo.entries()) {
    if (stop) break;
    let status: Status;
    try {
      const html = await fetcher.get(item.url);
      const p = parseSpellPage(html, item.name);
      const data = spellDataSchema.parse(p.data);
      const spellLevels = spellLevelsSchema.parse(p.spellLevels);
      if (normalizeNameKey(p.name) !== normalizeNameKey(item.name)) appendFileSync(reportPath, JSON.stringify({ at: new Date().toISOString(), url: item.url, warning: `page name "${p.name}" != index name "${item.name}"` }) + '\n');
      const rec: ExportRecord = { kind: 'spell', system: 'pf1e', name: p.name, summary: sanitizeSummary(item.summary), sourceUrl: item.url, data, spellLevels };
      exporter?.write(rec);
      if (o.dryRun) status = 'dry-ok';
      else status = (await upsertLibraryEntry(prisma!, rec)).action;
    } catch (e) {
      status = 'failed';
      const err = e instanceof Error ? e.message : String(e);
      appendFileSync(reportPath, JSON.stringify({ at: new Date().toISOString(), url: item.url, name: item.name, error: err.slice(0, 2000) }) + '\n');
    }
    cp.status[item.url] = status;
    saveCheckpoint(cpPath, cp);
    counts[status] = (counts[status] ?? 0) + 1;
    console.log(`[${i + 1}/${todo.length}] ${status.padEnd(7)} ${item.name}`);
  }
  const secs = (Date.now() - t0) / 1000;
  const done = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`Done: ${JSON.stringify(counts)} in ${secs.toFixed(1)}s (${done ? (secs / done).toFixed(2) : '-'} s/spell, ${fetcher.stats().requests} requests). Checkpoint: ${cpPath}${counts.failed ? `; failures in ${reportPath}` : ''}`);
  if (prisma) await prisma.$disconnect();
  if (stop) process.exit(130);
}

if (process.argv[1] && /import-aon-spells/.test(process.argv[1])) {
  main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
}
