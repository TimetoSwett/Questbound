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
  createCyberpunkSaveQueue,
  createLatestRef,
  overlayCyberpunkSheet,
  patchCyberpunkSheet,
  type CyberpunkSaveJob,
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

  // Panels must keep using the updater. Spreading the sheet prop is the bug.
  {
    const basics = readFileSync(join(here, '../app/campaign/[id]/_components/cyberpunk/basics-panel.tsx'), 'utf8');
    const inventory = readFileSync(join(here, '../app/campaign/[id]/_components/cyberpunk/inventory-lifepath-panel.tsx'), 'utf8');
    const sheetView = readFileSync(join(here, '../app/campaign/[id]/_components/cyberpunk-character-sheet.tsx'), 'utf8');
    assert.equal(basics.includes('{ ...sheet'), false);
    assert.equal(inventory.includes('{ ...sheet'), false);
    assert.equal(sheetView.includes('createCyberpunkSaveQueue'), true);
    assert.equal(sheetView.includes('createLatestRef'), true);
    assert.equal(sheetView.includes('keepalive: true'), true);
  }

  console.log('cyberpunk persistence tests passed');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
