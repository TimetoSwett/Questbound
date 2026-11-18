// Dice parser and roller (lib/dice.ts). No server and no database.
// Run: npm run test:dice-parser
import assert from 'node:assert/strict';
import { MAX_EXPRESSION_LENGTH, parseDiceExpression, rollDice } from '../lib/dice';

// Single-term expressions, normalized: "2d20+5", "d6", "3d8-2".
for (const [input, expected] of [
  ['1d20+5', { count: 1, sides: 20, modifier: 5, expression: '1d20+5' }],
  ['2d6-1', { count: 2, sides: 6, modifier: -1, expression: '2d6-1' }],
  ['d6', { count: 1, sides: 6, modifier: 0, expression: '1d6' }],
  ['D20', { count: 1, sides: 20, modifier: 0, expression: '1d20' }],
  ['3d8-2', { count: 3, sides: 8, modifier: -2, expression: '3d8-2' }],
  [' 2d20 + 5 ', { count: 2, sides: 20, modifier: 5, expression: '2d20+5' }],
  ['1 d 20', { count: 1, sides: 20, modifier: 0, expression: '1d20' }],
  ['1d20+0', { count: 1, sides: 20, modifier: 0, expression: '1d20' }],
  ['100d1000', { count: 100, sides: 1000, modifier: 0, expression: '100d1000' }],
  ['1d1000', { count: 1, sides: 1000, modifier: 0, expression: '1d1000' }],
  ['1d20+100000', { count: 1, sides: 20, modifier: 100000, expression: '1d20+100000' }],
  ['1d20-100000', { count: 1, sides: 20, modifier: -100000, expression: '1d20-100000' }],
] as const) {
  assert.deepEqual(parseDiceExpression(input), expected, input);
}

// Invalid input: empty, non-dice, multiple terms, and out-of-bounds values.
for (const input of [
  '', '   ', 'abc', 'd', '20', '1d20+2d6', '2d6+1d4', '1d20+5+3', '1d20 + 5 + 3',
  '0d6', '101d6', '1d1', '1d1001', '1d20+100001', '1d20-100001', '1d20+5x', '1d20.5',
  '-1d20', '1d20+-5', '1d20 +', '1.5d6', 'd20+5d6', '2d6 - 1d4',
]) {
  assert.equal(parseDiceExpression(input), null, input);
}
assert.equal(parseDiceExpression('1'.repeat(MAX_EXPRESSION_LENGTH + 1)), null);
assert.equal(parseDiceExpression(undefined as unknown as string), null);

// Deterministic rolls via the injected RNG (same [min, max) contract as
// crypto.randomInt). Production calls omit it and keep crypto randomness.
assert.deepEqual(rollDice(2, 6, 3, () => 1), { results: [1, 1], total: 5 });
assert.deepEqual(rollDice(2, 6, 3, (min, max) => max - 1), { results: [6, 6], total: 15 });
assert.deepEqual(rollDice(3, 8, 0, () => 5), { results: [5, 5, 5], total: 15 });
assert.deepEqual(rollDice(1, 6, -2, () => 1), { results: [1], total: -1 });
assert.deepEqual(rollDice(0, 6, 5, () => { throw new Error('no dice to roll'); }), { results: [], total: 5 });
const calls: [number, number][] = [];
assert.deepEqual(rollDice(1, 20, 0, (min, max) => { calls.push([min, max]); return min; }), { results: [1], total: 1 });
assert.deepEqual(calls, [[1, 21]]);

// Default (crypto) rolls stay in range and the total is the sum plus modifier.
for (let i = 0; i < 5; i++) {
  const { results, total } = rollDice(2, 6, 3);
  assert.equal(results.length, 2);
  assert.ok(results.every((result) => result >= 1 && result <= 6));
  assert.equal(total, results[0] + results[1] + 3);
}

console.log('Dice parser and roller tests passed.');
