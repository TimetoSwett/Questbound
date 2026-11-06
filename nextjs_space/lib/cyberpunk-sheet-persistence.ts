// Client persistence for the Cyberpunk 2020 sheet.
//
// The character API replaces the whole `cyberpunk` JSON value and does not
// version writes. Two overlapping PUTs can therefore land in completion
// order, so an older full-sheet body that finishes last erases a newer one.
// This queue never has more than one PUT in flight: a newer snapshot waits
// until the in-flight response settles, then is sent. Waiting for the
// response (not an arbitrary delay) is what makes the older write unable to
// finish last. The unmount path still asks for fetch keepalive; it is queued
// behind any in-flight autosave instead of racing it. Browsers drop a
// keepalive body past about 64 KiB, while a sheet may be up to 256 KiB, so a
// body over CYBERPUNK_KEEPALIVE_MAX_BYTES is sent as a normal fetch instead
// and a warning is logged. The save is never discarded. Each PUT aborts after
// CYBERPUNK_SAVE_TIMEOUT_MS so a hung request cannot stall the queue.
//
// Panels must not copy a sheet from props. `createLatestRef` applies each
// update to the sheet from the previous update, including a second update
// that runs before React renders. `patchCyberpunkSheet` changes one field
// against that latest sheet. Basics still overlays its presented skills via
// `overlayCyberpunkSheet`, which also reads the latest sheet first.

import { defaultCyberpunkSheet, type CyberpunkSheet } from '@/lib/cyberpunk-sheet';

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
  /**
   * The caller asked for keepalive, but the body was over the browser limit.
   * The PUT still went out, as a normal fetch.
   */
  keepaliveDowngraded: boolean;
};

export type CyberpunkSaveTransport = (
  job: CyberpunkSaveJob,
  signal: AbortSignal,
) => Promise<{ ok: boolean }>;

/** Browser keepalive bodies are capped near 64 KiB. Stay under that. */
export const CYBERPUNK_KEEPALIVE_MAX_BYTES = 60_000;

/** A queued PUT that does not settle within this time is aborted. */
export const CYBERPUNK_SAVE_TIMEOUT_MS = 15_000;

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

/** JSON body of the character PUT. Byte size is measured on this string. */
export function cyberpunkSaveBody(job: Pick<CyberpunkSaveJob, 'characterId' | 'name' | 'sheet'>): string {
  return JSON.stringify({ id: job.characterId, name: job.name, cyberpunk: job.sheet });
}

export function cyberpunkSaveBodyBytes(body: string): number {
  return new TextEncoder().encode(body).length;
}

export function cyberpunkKeepaliveForBody(requested: boolean, body: string): {
  keepalive: boolean;
  bytes: number;
  downgraded: boolean;
} {
  const bytes = cyberpunkSaveBodyBytes(body);
  const downgraded = requested && bytes > CYBERPUNK_KEEPALIVE_MAX_BYTES;
  return {
    keepalive: downgraded ? false : requested,
    bytes,
    downgraded,
  };
}

/**
 * Measure the PUT body. A keepalive request over the browser limit is turned
 * into a normal fetch and a warning is logged. The job is still returned so
 * the caller sends it.
 */
export function finalizeCyberpunkSaveJob(job: CyberpunkSaveJob): CyberpunkSaveJob & {
  body: string;
  bytes: number;
  keepaliveDowngraded: boolean;
} {
  const body = cyberpunkSaveBody(job);
  const decision = cyberpunkKeepaliveForBody(job.keepalive, body);
  if (decision.downgraded) {
    console.warn(
      `Cyberpunk save body is ${decision.bytes} bytes, above the ${CYBERPUNK_KEEPALIVE_MAX_BYTES}-byte keepalive limit. Sending a normal fetch so the save is not dropped.`,
    );
  }
  return {
    characterId: job.characterId,
    name: job.name,
    sheet: job.sheet,
    keepalive: decision.keepalive,
    body,
    bytes: decision.bytes,
    keepaliveDowngraded: decision.downgraded,
  };
}

function runCyberpunkSave(
  job: CyberpunkSaveJob,
  transport: CyberpunkSaveTransport,
  timeoutMs: number,
): Promise<{ ok: boolean }> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      resolve({ ok });
    };
    timer = setTimeout(() => {
      controller.abort();
      finish(false);
    }, timeoutMs);
    try {
      transport(job, controller.signal).then(
        (value) => finish(Boolean(value?.ok)),
        () => finish(false),
      );
    } catch {
      finish(false);
    }
  });
}

export function createCyberpunkSaveQueue(
  transport: CyberpunkSaveTransport,
  options?: {
    onSettled?: (settlement: CyberpunkSaveSettlement) => void;
    /** Defaults to CYBERPUNK_SAVE_TIMEOUT_MS. Tests pass a shorter value. */
    timeoutMs?: number;
  },
) {
  const queued: QueuedJob[] = [];
  let draining = false;
  let drainPromise: Promise<void> = Promise.resolve();
  let nextId = 0;
  let lastOkKey: string | null = null;
  const timeoutMs = options?.timeoutMs ?? CYBERPUNK_SAVE_TIMEOUT_MS;

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
        options?.onSettled?.({
          job: request,
          ok: true,
          superseded: isSuperseded(job),
          keepaliveDowngraded: false,
        });
        continue;
      }
      // Decide keepalive from the body we are about to send. A sheet that
      // does not fit in a keepalive PUT is flushed as a normal fetch.
      const prepared = finalizeCyberpunkSaveJob(request);
      const sent: CyberpunkSaveJob = {
        characterId: prepared.characterId,
        name: prepared.name,
        sheet: prepared.sheet,
        keepalive: prepared.keepalive,
      };
      let ok = false;
      try {
        ok = (await runCyberpunkSave(sent, transport, timeoutMs)).ok;
      } catch {
        ok = false;
      }
      if (ok) lastOkKey = key;
      options?.onSettled?.({
        job: sent,
        ok,
        superseded: isSuperseded(job),
        keepaliveDowngraded: prepared.keepaliveDowngraded,
      });
    }
  }

  function whenIdle(): Promise<void> {
    return drainPromise.then(() => {
      if (draining || queued.length > 0) return whenIdle();
    });
  }

  return { enqueue, whenIdle };
}

/**
 * Latest sheet, name, and pending save for the character currently open.
 * `noteCharacter` drops the previous character's sheet as soon as the id
 * changes. The pending payload is left in place so the effect cleanup can
 * flush it under the previous id, then `beginLoad` drops that too.
 */
export function createCyberpunkCharacterDraft(characterId: string) {
  let boundId = characterId;
  const sheet = createLatestRef(defaultCyberpunkSheet());
  let name = '';
  let payloadName = '';
  let payloadSheet = defaultCyberpunkSheet();
  let dropPayloadOnLoad = false;

  return {
    boundId(): string {
      return boundId;
    },
    sheet,
    name(): string {
      return name;
    },
    setName(next: string) {
      name = next;
    },
    payload(): { name: string; sheet: CyberpunkSheet } {
      return { name: payloadName, sheet: payloadSheet };
    },
    setPayload(nextName: string, nextSheet: CyberpunkSheet) {
      payloadName = nextName;
      payloadSheet = nextSheet;
    },
    replaceLoaded(nextName: string, nextSheet: CyberpunkSheet) {
      name = nextName;
      sheet.set(nextSheet);
      payloadName = nextName;
      payloadSheet = nextSheet;
    },
    /** True when `nextId` is a different character and the latest sheet was cleared. */
    noteCharacter(nextId: string): boolean {
      if (nextId === boundId) return false;
      boundId = nextId;
      sheet.set(defaultCyberpunkSheet());
      name = '';
      // The pending payload stays until beginLoad(), so the effect cleanup can
      // flush it under the previous id. A load of the same id must not wipe it.
      dropPayloadOnLoad = true;
      return true;
    },
    /**
     * Call when the load effect starts, after the previous character's unmount
     * flush. A same-id load leaves the draft alone. A new id, or a
     * noteCharacter() that has not been loaded yet, blanks the sheet and the
     * pending payload so the previous character cannot leak forward.
     */
    beginLoad(nextId: string) {
      const characterChanged = nextId !== boundId || dropPayloadOnLoad;
      boundId = nextId;
      dropPayloadOnLoad = false;
      if (!characterChanged) return;
      sheet.set(defaultCyberpunkSheet());
      name = '';
      payloadName = '';
      payloadSheet = defaultCyberpunkSheet();
    },
  };
}
