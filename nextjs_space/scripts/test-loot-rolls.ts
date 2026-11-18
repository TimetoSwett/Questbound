// Loot rolls (lib/loot.ts): quantity dice, weighted table picks, and the
// full rollLoot flow, all deterministic via injected RNG. No server and no
// database. Run: npm run test:loot-rolls
import assert from 'node:assert/strict';
import { MAX_CP, parseDice, rollDice, rollLoot, weightedPick, type Rng } from '../lib/loot';

const item = { kind: 'item' as const, name: 'Ruby', quantity: '2d6+1', valueGp: 3, weight: 0.1, notes: 'Red' };
const coins = { ...item, kind: 'coins' as const, name: '', quantity: '3', valueGp: 0.25 };

// Quantity dice: plain numbers, NdN, NdN+N, and their maxima.
assert.deepEqual(parseDice('0'), { count: 0, sides: 0, bonus: 0, max: 0 });
assert.deepEqual(parseDice('100000'), { count: 0, sides: 0, bonus: 100000, max: 100000 });
assert.deepEqual(parseDice('100d1000'), { count: 100, sides: 1000, bonus: 0, max: 100000 });
assert.deepEqual(parseDice('1d1'), { count: 1, sides: 1, bonus: 0, max: 1 });
assert.deepEqual(parseDice('1d1000+0'), { count: 1, sides: 1000, bonus: 0, max: 1000 });
for (const expression of ['07', '00']) assert.throws(() => parseDice(expression), Error, expression);

// Deterministic quantity rolls.
assert.equal(rollDice('2d6', () => 0.5), 8); // 4 + 4
assert.equal(rollDice('1d4+2', () => 0.5), 5); // 3 + 2
assert.equal(rollDice('1d100', () => 0.5), 51);
assert.equal(rollDice('0', () => { throw new Error('a constant draws nothing'); }), 0);

// Weighted picks: single entry, boundary draws, and invalid weights.
assert.equal(weightedPick([{ chance: 1, name: 'only' }], () => 0.999)?.name, 'only');
const two = [{ chance: 1, name: 'a' }, { chance: 1, name: 'b' }];
assert.equal(weightedPick(two, () => 0)?.name, 'a');
assert.equal(weightedPick(two, () => 0.4999)?.name, 'a');
assert.equal(weightedPick(two, () => 0.5)?.name, 'b'); // draw lands exactly on the boundary
assert.equal(weightedPick(two, () => 0.9999)?.name, 'b');
assert.equal(weightedPick([{ chance: 1_000_000, name: 'max' }], () => 0)?.name, 'max');
assert.throws(() => weightedPick([{ chance: NaN }]));

// Full rolls: empty, table-free, and table rolls.
assert.deepEqual(rollLoot(null, []), { items: [], cp: 0 });
assert.deepEqual(rollLoot({ rolls: 0, entries: [{ ...item, chance: 1 }] }, [coins], () => 0), { items: [], cp: 75 });
const threeRolls = rollLoot({ rolls: 3, entries: [{ ...item, chance: 1 }] }, [], () => 0);
assert.equal(threeRolls.items.length, 3);
assert.ok(threeRolls.items.every((rolled) => rolled.name === 'Ruby' && rolled.quantity === 3)); // 2d6+1 with all 1s
// A zero-chance entry is never picked, even when the draw is 0.
const neverPicked = rollLoot({ rolls: 2, entries: [{ ...item, name: 'Never', chance: 0 }, { ...item, name: 'Always', chance: 1 }] }, [], () => 0);
assert.deepEqual(neverPicked.items.map((rolled) => rolled.name), ['Always', 'Always']);
// Coin quantities of zero add nothing, and coin totals round to copper.
assert.equal(rollLoot(null, [{ ...coins, quantity: '0' }]).cp, 0);
assert.equal(rollLoot(null, [{ ...coins, quantity: '1', valueGp: 0.004 }]).cp, 0);
assert.equal(rollLoot(null, [{ ...coins, quantity: '1', valueGp: 0.015 }]).cp, 2);
// Same-name items stay separate entries; each quantity is rolled.
const doubled = rollLoot(null, [item, { ...item, quantity: '1d4' }], () => 0);
assert.equal(doubled.items.length, 2);
assert.deepEqual(doubled.items.map((rolled) => rolled.quantity), [3, 1]);

// One fully deterministic table roll, draw by draw: the fixed RNG sequence
// drives both weighted picks and the one quantity die (the loot-list coins
// and the picked coins entry are constants and draw nothing).
const sequence = [0.1, 0.9, 0.7];
let step = 0;
const fixed: Rng = () => {
  if (step >= sequence.length) throw new Error('RNG exhausted');
  return sequence[step++];
};
const table = {
  rolls: 2,
  entries: [
    { ...item, quantity: '1d4', chance: 1 },
    { ...item, kind: 'coins' as const, name: '', quantity: '2', valueGp: 0.5, chance: 2 },
  ],
};
assert.deepEqual(
  rollLoot(table, [{ ...coins, quantity: '1', valueGp: 1 }], fixed),
  { items: [{ name: 'Ruby', quantity: 4, valueGp: 3, weight: 0.1, notes: 'Red' }], cp: 200 },
);

// Invalid tables, lists, and entries are rejected before any roll.
assert.throws(() => rollLoot({ rolls: 1.5, entries: [] }, []));
assert.throws(() => rollLoot({ rolls: 1, entries: Array.from({ length: 201 }, () => ({ ...item, chance: 1 })) }, []));
assert.throws(() => rollLoot(null, Array.from({ length: 201 }, () => coins)));
assert.throws(() => rollLoot(null, [{ ...item, kind: 'gold' as never }]));
assert.throws(() => rollLoot(null, [{ ...item, valueGp: -1 }]));
assert.throws(() => rollLoot(null, [{ ...item, valueGp: 1_000_001 }]));
assert.throws(() => rollLoot(null, [{ ...item, weight: -0.5 }]));
assert.throws(() => rollLoot(null, [{ ...item, weight: 1_000_001 }]));
assert.throws(() => rollLoot(null, [{ ...item, name: '  ' }]));
assert.throws(() => rollLoot(null, [{ ...item, notes: 5 as never }]));
assert.throws(() => rollLoot(null, [{ ...item, quantity: 'bad' }]));

// Coin total cap: just under MAX_CP passes, just over throws.
assert.equal(MAX_CP, 2_147_483_647);
assert.equal(rollLoot(null, [{ ...coins, quantity: '100000', valueGp: 214.74 }]).cp, 2_147_400_000);
assert.throws(() => rollLoot(null, [{ ...coins, quantity: '100000', valueGp: 214.75 }]));

console.log('Loot roll tests passed.');
