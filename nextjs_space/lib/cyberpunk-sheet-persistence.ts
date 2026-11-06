// Client persistence for the Cyberpunk 2020 sheet.
//
// The character API replaces the whole `cyberpunk` JSON value and does not
// version writes. Two overlapping PUTs can therefore land in completion
// order, so an older full-sheet body that finishes last erases a newer one.
// This queue never has more than one PUT in flight: a newer snapshot waits
// until the in-flight response settles, then is sent. Waiting for the
// response (not an arbitrary delay) is what makes the older write unable to
// finish last. The unmount path still uses fetch keepalive; it is queued
// behind any in-flight autosave instead of racing it.
//
// Panels must not copy a sheet from props. `createLatestRef` applies each
// update to the sheet from the previous update, including a second update
// that runs before React renders. `patchCyberpunkSheet` changes one field
// against that latest sheet. Basics still overlays its presented skills via
// `overlayCyberpunkSheet`, which also reads the latest sheet first.

import type { CyberpunkSheet } from '@/lib/cyberpunk-sheet';

export type CyberpunkSheetUpdater = (current: CyberpunkSheet) => CyberpunkSheet;

export type CyberpunkSaveJob = {
  characterId: string;
  name: string;
  sheet: CyberpunkSheet;
  keepalive: boolean;
};

export type CyberpunkSaveSettlement = {
  job: CyberpunkSaveJob;
  ok: boolean;
  /** A newer full-sheet write for this same character is already queued. */
  superseded: boolean;
};

export type CyberpunkSaveTransport = (job: CyberpunkSaveJob) => Promise<{ ok: boolean }>;

type QueuedJob = CyberpunkSaveJob & { id: number };

export function createLatestRef<T>(initial: T) {
  let current = initial;
  return {
    get(): T {
      return current;
    },
    set(next: T): T {
      current = next;
      return current;
    },
    update(updater: (current: T) => T): T {
      current = updater(current);
      return current;
    },
  };
}

/**
 * Replace one field on the sheet passed in when the updater runs.
 * A function value is called with that field's latest value so two edits
 * in one turn (two lifepath fields, two armor locations) both stick.
 */
export function patchCyberpunkSheet<K extends keyof CyberpunkSheet>(
  key: K,
  value: CyberpunkSheet[K] | ((current: CyberpunkSheet[K]) => CyberpunkSheet[K]),
): CyberpunkSheetUpdater {
  return (current) => {
    const nextValue = typeof value === 'function'
      ? (value as (field: CyberpunkSheet[K]) => CyberpunkSheet[K])(current[key])
      : value;
    if (Object.is(current[key], nextValue)) return current;
    return { ...current, [key]: nextValue };
  };
}

/**
 * Run `updater` against the latest sheet, then copy `overlay` fields on top.
 * Basics uses this to keep the presented skill list without spreading a
 * stale copy of money, gear, or lifepath from props.
 */
export function overlayCyberpunkSheet(
  updater: CyberpunkSheetUpdater,
  overlay: Partial<CyberpunkSheet> | ((next: CyberpunkSheet) => Partial<CyberpunkSheet>),
): CyberpunkSheetUpdater {
  return (current) => {
    const next = updater(current);
    const extra = typeof overlay === 'function' ? overlay(next) : overlay;
    return { ...next, ...extra };
  };
}

function snapshotSheet(sheet: CyberpunkSheet): CyberpunkSheet {
  return JSON.parse(JSON.stringify(sheet)) as CyberpunkSheet;
}

function payloadKey(job: Pick<CyberpunkSaveJob, 'characterId' | 'name' | 'sheet'>): string {
  return `${job.characterId}\0${job.name}\0${JSON.stringify(job.sheet)}`;
}

export function createCyberpunkSaveQueue(
  transport: CyberpunkSaveTransport,
  options?: { onSettled?: (settlement: CyberpunkSaveSettlement) => void },
) {
  const queued: QueuedJob[] = [];
  let draining = false;
  let drainPromise: Promise<void> = Promise.resolve();
  let nextId = 0;
  let lastOkKey: string | null = null;

  function isSuperseded(job: QueuedJob): boolean {
    return queued.some((pending) => pending.characterId === job.characterId && pending.id > job.id);
  }

  function enqueue(job: CyberpunkSaveJob): void {
    const stored: QueuedJob = {
      id: ++nextId,
      characterId: job.characterId,
      name: job.name,
      sheet: snapshotSheet(job.sheet),
      keepalive: job.keepalive,
    };
    const tail = queued[queued.length - 1];
    if (tail && tail.characterId === stored.characterId) {
      queued[queued.length - 1] = {
        ...stored,
        keepalive: tail.keepalive || stored.keepalive,
      };
    } else {
      queued.push(stored);
    }
    void kick();
  }

  function kick(): Promise<void> {
    if (draining) return drainPromise;
    draining = true;
    const run = drain();
    drainPromise = run.finally(() => {
      draining = false;
      if (queued.length > 0) void kick();
    });
    return drainPromise;
  }

  async function drain(): Promise<void> {
    while (queued.length > 0) {
      const job = queued.shift();
      if (!job) return;
      const request: CyberpunkSaveJob = {
        characterId: job.characterId,
        name: job.name,
        sheet: job.sheet,
        keepalive: job.keepalive,
      };
      const key = payloadKey(request);
      if (key === lastOkKey) {
        options?.onSettled?.({ job: request, ok: true, superseded: isSuperseded(job) });
        continue;
      }
      let ok = false;
      try {
        ok = (await transport(request)).ok;
      } catch {
        ok = false;
      }
      if (ok) lastOkKey = key;
      options?.onSettled?.({ job: request, ok, superseded: isSuperseded(job) });
    }
  }

  function whenIdle(): Promise<void> {
    return drainPromise.then(() => {
      if (draining || queued.length > 0) return whenIdle();
    });
  }

  return { enqueue, whenIdle };
}
