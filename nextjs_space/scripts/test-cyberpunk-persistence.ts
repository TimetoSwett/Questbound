// Client persistence for the Cyberpunk sheet. No server and no database.
// Run: npm run test:cyberpunk-persistence
//
// Covers the two overlap failures from the issue #28 smoke on PR #31:
// an older full-sheet PUT must not finish after a newer one (including the
// unmount keepalive), and two panel edits in one turn must both stick.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultCyberpunkSheet, type CyberpunkGearItem, type CyberpunkSheet } from '../lib/cyberpunk-sheet';
import {
  CYBERPUNK_KEEPALIVE_MAX_BYTES,
  CYBERPUNK_SAVE_TIMEOUT_MS,
  createCyberpunkCharacterDraft,
  createCyberpunkSaveQueue,
  createLatestRef,
  cyberpunkKeepaliveForBody,
  cyberpunkSaveBody,
  cyberpunkSaveBodyBytes,
  finalizeCyberpunkSaveJob,
  overlayCyberpunkSheet,
  patchCyberpunkSheet,
  type CyberpunkSaveJob,
  type CyberpunkSaveSettlement,
  type CyberpunkSheetUpdater,
} from '../lib/cyberpunk-sheet-persistence';

const here = dirname(fileURLToPath(import.meta.url));

type Release = {
  job: CyberpunkSaveJob;
  finish: (ok: boolean) => void;
};

function trackedQueue() {
  const calls: Release[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const applied: CyberpunkSheet[] = [];
  const queue = createCyberpunkSaveQueue((job) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    return new Promise((resolve) => {
      calls.push({
        job,
        finish: (ok) => {
          inFlight -= 1;
          if (ok) applied.push(structuredClone(job.sheet));
          resolve({ ok });
        },
      });
    });
  });
  return {
    calls,
    queue,
    applied,
    inFlight: () => inFlight,
    maxInFlight: () => maxInFlight,
  };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function captureWarn(run: () => Promise<void> | void): Promise<string[]> {
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map((arg) => String(arg)).join(' '));
  };
  try {
    await run();
  } finally {
    console.warn = original;
  }
  return warnings;
}

function sheetOverKeepaliveLimit(): CyberpunkSheet {
  return sheet({ handle: 'H'.repeat(CYBERPUNK_KEEPALIVE_MAX_BYTES) });
}

function sheet(patch: Partial<CyberpunkSheet> = {}): CyberpunkSheet {
  return { ...defaultCyberpunkSheet(), ...patch };
}

function withStyle(base: CyberpunkSheet, style: string, money: number | null): CyberpunkSheet {
  return {
    ...base,
    money,
    lifepath: { ...base.lifepath, style },
  };
}

const rope: CyberpunkGearItem = { type: 'Rope', cost: null, wt: null };
const medkit: CyberpunkGearItem = { type: 'Medkit', cost: 50, wt: 1 };

function basicsCommit(updater: CyberpunkSheetUpdater): CyberpunkSheetUpdater {
  return overlayCyberpunkSheet(updater, () => ({ skills: [] }));
}

async function main(): Promise<void> {
  // Older full-sheet PUT is still in flight when Back/unmount sends the newer
  // sheet. The newer keepalive must not start until the older response settles,
  // so the server applies First/money null and then money 99/style Late.
  {
    const harness = trackedQueue();
    const older = sheet({ handle: 'First', money: null });
    const newer = withStyle(sheet({ handle: 'First' }), 'Late', 99);
    harness.queue.enqueue({ characterId: 'c1', name: 'V', sheet: older, keepalive: false });
    assert.equal(harness.calls.length, 1);
    assert.equal(harness.inFlight(), 1);
    assert.equal(harness.calls[0].job.sheet.handle, 'First');
    assert.equal(harness.calls[0].job.sheet.money, null);
    assert.equal(harness.calls[0].job.sheet.lifepath.style, '');
    assert.equal(harness.calls[0].job.keepalive, false);

    harness.queue.enqueue({ characterId: 'c1', name: 'V', sheet: newer, keepalive: true });
    assert.equal(harness.calls.length, 1, 'newer keepalive must wait until the in-flight PUT settles');
    assert.equal(harness.maxInFlight(), 1);

    harness.calls[0].finish(true);
    await flush();
    assert.equal(harness.calls.length, 2);
    assert.equal(harness.calls[1].job.keepalive, true);
    assert.equal(harness.calls[1].job.sheet.handle, 'First');
    assert.equal(harness.calls[1].job.sheet.money, 99);
    assert.equal(harness.calls[1].job.sheet.lifepath.style, 'Late');
    assert.equal(harness.calls[1].job.sheet.role, '');

    harness.calls[1].finish(true);
    await harness.queue.whenIdle();
    assert.equal(harness.maxInFlight(), 1);
    assert.deepEqual(harness.applied.map((saved) => saved.money), [null, 99]);
    assert.equal(harness.applied.at(-1)?.lifepath.style, 'Late');
    assert.equal(harness.applied.at(-1)?.handle, 'First');
  }

  // Edits while a write is in flight collapse to the newest full sheet, which
  // is still sent. The middle money 10 body never hits the server.
  {
    const harness = trackedQueue();
    const first = sheet({ handle: 'First' });
    const middle = sheet({ handle: 'First', money: 10 });
    const newest = withStyle(sheet({ handle: 'First' }), 'Late', 99);
    harness.queue.enqueue({ characterId: 'c1', name: 'V', sheet: first, keepalive: false });
    harness.queue.enqueue({ characterId: 'c1', name: 'V', sheet: middle, keepalive: false });
    harness.queue.enqueue({ characterId: 'c1', name: 'Nova', sheet: newest, keepalive: false });
    assert.equal(harness.calls.length, 1);
    harness.calls[0].finish(true);
    await flush();
    assert.equal(harness.calls.length, 2);
    assert.equal(harness.calls[1].job.name, 'Nova');
    assert.equal(harness.calls[1].job.sheet.money, 99);
    assert.equal(harness.calls[1].job.sheet.lifepath.style, 'Late');
    assert.equal(harness.calls.filter((call) => call.job.sheet.money === 10).length, 0);
    harness.calls[1].finish(true);
    await harness.queue.whenIdle();
    assert.deepEqual(harness.applied.map((saved) => saved.money), [null, 99]);
  }

  // A failed in-flight write still lets the newer snapshot persist.
  {
    const harness = trackedQueue();
    const older = sheet({ handle: 'First' });
    const newer = sheet({ handle: 'First', money: 99 });
    harness.queue.enqueue({ characterId: 'c1', name: 'V', sheet: older, keepalive: false });
    harness.queue.enqueue({ characterId: 'c1', name: 'V', sheet: newer, keepalive: true });
    harness.calls[0].finish(false);
    await flush();
    assert.equal(harness.calls.length, 2);
    assert.equal(harness.calls[1].job.keepalive, true);
    assert.equal(harness.calls[1].job.sheet.money, 99);
    harness.calls[1].finish(true);
    await harness.queue.whenIdle();
    assert.deepEqual(harness.applied.map((saved) => saved.money), [99]);
  }

  // The same bytes are sent again when the in-flight attempt failed. A later
  // identical enqueue after success is not a second PUT.
  {
    const harness = trackedQueue();
    const body = sheet({ handle: 'First', money: 40 });
    harness.queue.enqueue({ characterId: 'c1', name: 'V', sheet: body, keepalive: false });
    harness.queue.enqueue({ characterId: 'c1', name: 'V', sheet: body, keepalive: true });
    harness.calls[0].finish(false);
    await flush();
    assert.equal(harness.calls.length, 2, 'a failed PUT must not count as saved');
    assert.equal(harness.calls[1].job.keepalive, true);
    harness.calls[1].finish(true);
    await harness.queue.whenIdle();
    assert.equal(harness.applied.length, 1);
    assert.equal(harness.applied[0].money, 40);

    harness.queue.enqueue({ characterId: 'c1', name: 'V', sheet: body, keepalive: true });
    await harness.queue.whenIdle();
    assert.equal(harness.calls.length, 2);

    const edited = sheet({ handle: 'First', money: 5 });
    harness.queue.enqueue({ characterId: 'c1', name: 'V', sheet: edited, keepalive: false });
    assert.equal(harness.calls.length, 3);
    assert.equal(harness.calls[2].job.sheet.money, 5);
    harness.calls[2].finish(true);
    await harness.queue.whenIdle();
  }

  // Another character is not dropped when saves are serialized.
  {
    const harness = trackedQueue();
    harness.queue.enqueue({ characterId: 'a', name: 'A', sheet: sheet({ handle: 'Alpha' }), keepalive: true });
    harness.queue.enqueue({ characterId: 'b', name: 'B', sheet: sheet({ handle: 'Beta', money: 8 }), keepalive: false });
    assert.equal(harness.calls.length, 1);
    assert.equal(harness.calls[0].job.characterId, 'a');
    assert.equal(harness.calls[0].job.keepalive, true);
    harness.calls[0].finish(true);
    await flush();
    assert.equal(harness.calls.length, 2);
    assert.equal(harness.calls[1].job.characterId, 'b');
    assert.equal(harness.calls[1].job.sheet.handle, 'Beta');
    assert.equal(harness.calls[1].job.sheet.money, 8);
    harness.calls[1].finish(true);
    await harness.queue.whenIdle();
  }

  // A debounced save still queued behind an in-flight PUT is replaced by the
  // unmount keepalive, which keeps the newest money and style.
  {
    const harness = trackedQueue();
    const held = sheet({ handle: 'First' });
    const debounced = sheet({ handle: 'First', money: 10 });
    const unmount = withStyle(sheet({ handle: 'First' }), 'Late', 99);
    harness.queue.enqueue({ characterId: 'c1', name: 'V', sheet: held, keepalive: false });
    harness.queue.enqueue({ characterId: 'c1', name: 'V', sheet: debounced, keepalive: false });
    harness.queue.enqueue({ characterId: 'c1', name: 'V', sheet: unmount, keepalive: true });
    assert.equal(harness.calls.length, 1);
    assert.equal(harness.calls[0].job.sheet.money, null);
    harness.calls[0].finish(true);
    await flush();
    assert.equal(harness.calls.length, 2);
    assert.equal(harness.calls[1].job.keepalive, true);
    assert.equal(harness.calls[1].job.sheet.money, 99);
    assert.equal(harness.calls[1].job.sheet.lifepath.style, 'Late');
    harness.calls[1].finish(true);
    await harness.queue.whenIdle();
    assert.equal(harness.applied.at(-1)?.money, 99);
    assert.equal(harness.applied.at(-1)?.lifepath.style, 'Late');
  }

  // The queued body is a snapshot. Mutating the caller's object later does not
  // change the PUT that was already handed to the queue.
  {
    const harness = trackedQueue();
    const live = sheet({ handle: 'First' });
    harness.queue.enqueue({ characterId: 'c1', name: 'V', sheet: live, keepalive: false });
    live.handle = 'Mutated';
    live.money = 1;
    assert.equal(harness.calls[0].job.sheet.handle, 'First');
    assert.equal(harness.calls[0].job.sheet.money, null);
    harness.calls[0].finish(true);
    await harness.queue.whenIdle();
  }

  // Solo then money, same turn. Basics overlays skills; money is patched onto
  // the sheet that already has the role.
  {
    const draft = createLatestRef(sheet({ handle: 'First' }));
    draft.update(basicsCommit(patchCyberpunkSheet('role', 'Solo')));
    draft.update(patchCyberpunkSheet('money', 75));
    assert.equal(draft.get().role, 'Solo');
    assert.equal(draft.get().money, 75);
    assert.equal(draft.get().handle, 'First');
    assert.deepEqual(draft.get().skills, []);
  }

  // Add gear then Solo. The role commit must not put the empty gear list back.
  {
    const draft = createLatestRef(sheet({ handle: 'First' }));
    draft.update(patchCyberpunkSheet('gear', [rope]));
    draft.update(basicsCommit(patchCyberpunkSheet('role', 'Solo')));
    assert.equal(draft.get().role, 'Solo');
    assert.deepEqual(draft.get().gear, [rope]);
    assert.deepEqual(draft.get().skills, []);
  }

  // Spreading a sheet captured before the first edit still drops that edit.
  // Callers have to update from the current argument. This locks that contract.
  {
    const draft = createLatestRef(defaultCyberpunkSheet());
    const stale = draft.get();
    draft.update(patchCyberpunkSheet('role', 'Solo'));
    draft.update(() => ({ ...stale, money: 75 }));
    assert.equal(draft.get().role, '');
    assert.equal(draft.get().money, 75);
  }

  // Two fields on the same nested object, still before React renders.
  {
    const draft = createLatestRef(defaultCyberpunkSheet());
    draft.update(patchCyberpunkSheet('lifepath', (lifepath) => ({ ...lifepath, style: 'Late' })));
    draft.update(patchCyberpunkSheet('lifepath', (lifepath) => ({ ...lifepath, clothes: 'Leather' })));
    draft.update(patchCyberpunkSheet('armor', (armor) => ({ ...armor, torso: 12 })));
    draft.update(patchCyberpunkSheet('armor', (armor) => ({ ...armor, skull: 4 })));
    assert.equal(draft.get().lifepath.style, 'Late');
    assert.equal(draft.get().lifepath.clothes, 'Leather');
    assert.equal(draft.get().armor.torso, 12);
    assert.equal(draft.get().armor.skull, 4);
  }

  // Two gear adds read the latest row list, then a role commit keeps both rows.
  {
    const draft = createLatestRef(defaultCyberpunkSheet());
    const rows = createLatestRef<CyberpunkGearItem[]>([]);
    const addGear = (item: CyberpunkGearItem) => {
      const next = rows.update((current) => [...current, item]);
      draft.update(patchCyberpunkSheet('gear', next));
    };
    addGear(rope);
    addGear(medkit);
    draft.update(basicsCommit(patchCyberpunkSheet('role', 'Solo')));
    assert.deepEqual(draft.get().gear, [rope, medkit]);
    assert.equal(draft.get().role, 'Solo');
  }

  // Life events and a lifepath field in one turn keep each other, plus fields
  // another panel already wrote.
  {
    const draft = createLatestRef(sheet({ money: 75, role: 'Solo' }));
    const events = createLatestRef<{ year: number | null; event: string }[]>([]);
    const addEvent = (year: number, event: string) => {
      const next = events.update((current) => [...current, { year, event }]);
      draft.update(patchCyberpunkSheet('lifepath', (lifepath) => ({ ...lifepath, lifeEvents: next })));
    };
    addEvent(2018, 'Left Night City');
    draft.update(patchCyberpunkSheet('lifepath', (lifepath) => ({ ...lifepath, style: 'Late' })));
    addEvent(2019, 'Met a fixer');
    assert.equal(draft.get().money, 75);
    assert.equal(draft.get().role, 'Solo');
    assert.equal(draft.get().lifepath.style, 'Late');
    assert.deepEqual(draft.get().lifepath.lifeEvents, [
      { year: 2018, event: 'Left Night City' },
      { year: 2019, event: 'Met a fixer' },
    ]);
  }

  // Keepalive stays on at the 60_000 byte cap and turns off one byte past it.
  // TextEncoder counts UTF-8 bytes, not UTF-16 code units.
  {
    assert.equal(CYBERPUNK_SAVE_TIMEOUT_MS, 15_000);
    const atLimit = 'a'.repeat(CYBERPUNK_KEEPALIVE_MAX_BYTES);
    const under = cyberpunkKeepaliveForBody(true, atLimit);
    assert.equal(under.bytes, CYBERPUNK_KEEPALIVE_MAX_BYTES);
    assert.equal(under.keepalive, true);
    assert.equal(under.downgraded, false);

    const over = cyberpunkKeepaliveForBody(true, `${atLimit}b`);
    assert.equal(over.bytes, CYBERPUNK_KEEPALIVE_MAX_BYTES + 1);
    assert.equal(over.keepalive, false);
    assert.equal(over.downgraded, true);

    const plain = cyberpunkKeepaliveForBody(false, `${atLimit}b`);
    assert.equal(plain.keepalive, false);
    assert.equal(plain.downgraded, false);

    const marks = '€'.repeat(Math.floor(CYBERPUNK_KEEPALIVE_MAX_BYTES / 3) + 1);
    const multibyte = cyberpunkKeepaliveForBody(true, marks);
    assert.ok(marks.length < CYBERPUNK_KEEPALIVE_MAX_BYTES);
    assert.ok(multibyte.bytes > CYBERPUNK_KEEPALIVE_MAX_BYTES);
    assert.equal(multibyte.keepalive, false);
    assert.equal(new TextEncoder().encode(marks).length, multibyte.bytes);
  }

  // A small unmount flush still uses keepalive and does not warn.
  {
    const warnings = await captureWarn(async () => {
      const harness = trackedQueue();
      const body = sheet({ handle: 'First', money: 4 });
      const bytes = cyberpunkSaveBodyBytes(cyberpunkSaveBody({
        characterId: 'c1',
        name: 'V',
        sheet: body,
      }));
      assert.ok(bytes <= CYBERPUNK_KEEPALIVE_MAX_BYTES);
      harness.queue.enqueue({ characterId: 'c1', name: 'V', sheet: body, keepalive: true });
      assert.equal(harness.calls.length, 1);
      assert.equal(harness.calls[0].job.keepalive, true);
      assert.equal(harness.calls[0].job.sheet.money, 4);
      harness.calls[0].finish(true);
      await harness.queue.whenIdle();
    });
    assert.equal(warnings.length, 0);
  }

  // A sheet over the keepalive cap is still sent. The fetch is a normal PUT,
  // and the downgrade is logged instead of failing silently.
  {
    const warnings = await captureWarn(async () => {
      const settlements: CyberpunkSaveSettlement[] = [];
      const calls: CyberpunkSaveJob[] = [];
      const queue = createCyberpunkSaveQueue((job) => {
        calls.push(job);
        return Promise.resolve({ ok: true });
      }, {
        onSettled: (settlement) => settlements.push(settlement),
      });
      const huge = sheetOverKeepaliveLimit();
      const bytes = cyberpunkSaveBodyBytes(cyberpunkSaveBody({
        characterId: 'c1',
        name: 'V',
        sheet: huge,
      }));
      assert.ok(bytes > CYBERPUNK_KEEPALIVE_MAX_BYTES);
      queue.enqueue({ characterId: 'c1', name: 'V', sheet: huge, keepalive: true });
      await queue.whenIdle();
      assert.equal(calls.length, 1, 'an oversized keepalive save must still be sent');
      assert.equal(calls[0].keepalive, false);
      assert.equal(calls[0].sheet.handle, huge.handle);
      assert.equal(calls[0].sheet.money, null);
      assert.equal(settlements.length, 1);
      assert.equal(settlements[0].ok, true);
      assert.equal(settlements[0].keepaliveDowngraded, true);
      assert.equal(settlements[0].job.keepalive, false);

      // The queue passes keepalive false onward, so the fetch helper must
      // not warn a second time for the same body.
      const again = finalizeCyberpunkSaveJob(calls[0]);
      assert.equal(again.keepalive, false);
      assert.equal(again.keepaliveDowngraded, false);
      assert.equal(again.body.includes(huge.handle), true);
    });
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].includes(String(CYBERPUNK_KEEPALIVE_MAX_BYTES)), true);
    assert.equal(warnings[0].includes('normal fetch'), true);
    assert.equal(warnings[0].includes('not dropped'), true);
  }

  // An in-flight save must not swallow a later oversized unmount flush.
  {
    const warnings = await captureWarn(async () => {
      const harness = trackedQueue();
      const held = sheet({ handle: 'First' });
      const unmount = sheetOverKeepaliveLimit();
      harness.queue.enqueue({ characterId: 'c1', name: 'V', sheet: held, keepalive: false });
      harness.queue.enqueue({ characterId: 'c1', name: 'V', sheet: unmount, keepalive: true });
      assert.equal(harness.calls.length, 1);
      assert.equal(harness.calls[0].job.keepalive, false);
      harness.calls[0].finish(true);
      await flush();
      assert.equal(harness.calls.length, 2);
      assert.equal(harness.calls[1].job.keepalive, false);
      assert.equal(harness.calls[1].job.sheet.handle, unmount.handle);
      harness.calls[1].finish(true);
      await harness.queue.whenIdle();
    });
    assert.equal(warnings.length, 1);
  }

  // A hung PUT is aborted and the newest snapshot still goes out.
  {
    const calls: CyberpunkSaveJob[] = [];
    const hung: { signal: AbortSignal | null } = { signal: null };
    const queue = createCyberpunkSaveQueue((job, signal) => {
      calls.push(job);
      if (calls.length === 1) {
        hung.signal = signal;
        return new Promise(() => {});
      }
      return Promise.resolve({ ok: true });
    }, { timeoutMs: 30 });
    const newest = withStyle(sheet({ handle: 'Next' }), 'Late', 99);
    queue.enqueue({ characterId: 'c1', name: 'V', sheet: sheet({ handle: 'Hung' }), keepalive: false });
    queue.enqueue({ characterId: 'c1', name: 'V', sheet: sheet({ handle: 'Mid', money: 3 }), keepalive: false });
    queue.enqueue({ characterId: 'c1', name: 'Nova', sheet: newest, keepalive: false });
    assert.equal(calls.length, 1);
    const started = Date.now();
    while (calls.length < 2) {
      if (Date.now() - started > 1000) break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(calls.length, 2, 'the queue must continue after the hung save times out');
    assert.equal(hung.signal?.aborted, true);
    assert.equal(calls[1].name, 'Nova');
    assert.equal(calls[1].sheet.handle, 'Next');
    assert.equal(calls[1].sheet.money, 99);
    assert.equal(calls[1].sheet.lifepath.style, 'Late');
    assert.equal(calls.some((call) => call.sheet.money === 3), false);
    await queue.whenIdle();
    assert.ok(Date.now() - started < 1000);
  }

  // A save that settles does not get aborted when the timeout later elapses.
  {
    let aborted = false;
    const queue = createCyberpunkSaveQueue((_job, signal) => {
      signal.addEventListener('abort', () => { aborted = true; });
      return Promise.resolve({ ok: true });
    }, { timeoutMs: 40 });
    queue.enqueue({ characterId: 'c1', name: 'V', sheet: sheet({ handle: 'Fast' }), keepalive: false });
    await queue.whenIdle();
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(aborted, false);
  }

  // Switching characters drops the previous latest sheet immediately. The
  // pending payload survives until beginLoad so it can still be flushed
  // under the previous id, and a later edit cannot see the old handle.
  {
    const draft = createCyberpunkCharacterDraft('char-a');
    draft.replaceLoaded('V', sheet({ handle: 'V', money: 99, role: 'Solo' }));
    draft.setName('V');
    draft.sheet.update(patchCyberpunkSheet('money', 40));
    draft.setPayload('V', draft.sheet.get());
    assert.equal(draft.noteCharacter('char-a'), false);
    assert.equal(draft.sheet.get().handle, 'V');
    assert.equal(draft.sheet.get().money, 40);

    draft.beginLoad('char-a');
    assert.equal(draft.sheet.get().handle, 'V');
    assert.equal(draft.payload().sheet.money, 40);

    assert.equal(draft.noteCharacter('char-b'), true);
    assert.equal(draft.boundId(), 'char-b');
    assert.equal(draft.name(), '');
    assert.equal(draft.sheet.get().handle, '');
    assert.equal(draft.sheet.get().money, null);
    assert.equal(draft.sheet.get().role, '');
    const flushed = draft.payload();
    assert.equal(flushed.name, 'V');
    assert.equal(flushed.sheet.handle, 'V');
    assert.equal(flushed.sheet.money, 40);
    assert.equal(flushed.sheet.role, 'Solo');

    draft.beginLoad('char-b');
    assert.equal(draft.payload().name, '');
    assert.equal(draft.payload().sheet.handle, '');
    assert.equal(draft.payload().sheet.money, null);
    assert.equal(draft.payload().sheet.role, '');
    draft.setName('Nova');
    draft.sheet.update(patchCyberpunkSheet('money', 5));
    draft.sheet.update(patchCyberpunkSheet('handle', 'Nova'));
    assert.equal(draft.sheet.get().money, 5);
    assert.equal(draft.sheet.get().handle, 'Nova');
    assert.equal(draft.sheet.get().role, '');
    assert.equal(draft.noteCharacter('char-b'), false);
    assert.equal(draft.sheet.get().handle, 'Nova');
  }

  // beginLoad itself blanks the draft when the id changes, which is what the
  // sheet effect does after flushing the previous character.
  {
    const draft = createCyberpunkCharacterDraft('char-a');
    draft.replaceLoaded('V', sheet({ handle: 'V', money: 12, role: 'Solo' }));
    const flushed = draft.payload();
    draft.beginLoad('char-b');
    assert.equal(flushed.name, 'V');
    assert.equal(flushed.sheet.handle, 'V');
    assert.equal(flushed.sheet.money, 12);
    assert.equal(flushed.sheet.role, 'Solo');
    assert.equal(draft.boundId(), 'char-b');
    assert.equal(draft.name(), '');
    assert.equal(draft.sheet.get().handle, '');
    assert.equal(draft.sheet.get().money, null);
    assert.equal(draft.sheet.get().role, '');
    assert.equal(draft.payload().sheet.handle, '');
    draft.sheet.update(patchCyberpunkSheet('money', 1));
    assert.equal(draft.sheet.get().money, 1);
    assert.equal(draft.sheet.get().role, '');
    assert.equal(draft.sheet.get().handle, '');
    draft.beginLoad('char-b');
    assert.equal(draft.sheet.get().money, 1);
  }

  // Panels must keep using the updater. Spreading the sheet prop is the bug.
  {
    const basics = readFileSync(join(here, '../app/campaign/[id]/_components/cyberpunk/basics-panel.tsx'), 'utf8');
    const inventory = readFileSync(join(here, '../app/campaign/[id]/_components/cyberpunk/inventory-lifepath-panel.tsx'), 'utf8');
    const sheetView = readFileSync(join(here, '../app/campaign/[id]/_components/cyberpunk-character-sheet.tsx'), 'utf8');
    const persistence = readFileSync(join(here, '../lib/cyberpunk-sheet-persistence.ts'), 'utf8');
    assert.equal(basics.includes('{ ...sheet'), false);
    assert.equal(inventory.includes('{ ...sheet'), false);
    assert.equal(sheetView.includes('createCyberpunkSaveQueue'), true);
    assert.equal(sheetView.includes('createCyberpunkCharacterDraft'), true);
    assert.equal(sheetView.includes('noteCharacter'), true);
    assert.equal(sheetView.includes('beginLoad'), true);
    assert.equal(sheetView.includes('keepalive: true'), true);
    assert.equal(sheetView.includes('finalizeCyberpunkSaveJob'), true);
    assert.equal(sheetView.includes('signal'), true);
    assert.equal(persistence.includes('new AbortController()'), true);
    assert.equal(persistence.includes('new TextEncoder()'), true);
    assert.equal(persistence.includes('createLatestRef'), true);
  }

  console.log('cyberpunk persistence tests passed');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
