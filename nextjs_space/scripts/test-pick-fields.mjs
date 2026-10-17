// Field whitelist used by map pin/node PUT routes: unknown keys (campaignId,
// id, createdAt...) are dropped and mistyped known fields reject the update.
import assert from 'node:assert/strict';
const { pickFields } = await import('../lib/pick-fields.ts');

const FIELDS = { name: 'string', x: 'number', visibility: 'visibility' };

assert.deepEqual(pickFields({ id: 'a', campaignId: 'other', name: 'Keep', x: 3 }, FIELDS), { name: 'Keep', x: 3 });
assert.deepEqual(pickFields({ createdAt: '2020-01-01' }, FIELDS), {});
assert.deepEqual(pickFields({ visibility: 'shared' }, FIELDS), { visibility: 'shared' });
assert.equal(pickFields({ visibility: 'public' }, FIELDS), null);
assert.equal(pickFields({ x: '3' }, FIELDS), null);
assert.equal(pickFields({ x: Number.NaN }, FIELDS), null);
assert.equal(pickFields({ name: { set: 'x' } }, FIELDS), null);
assert.deepEqual(pickFields(null, FIELDS), {});
assert.deepEqual(pickFields([1, 2], FIELDS), {});

console.log('PICK FIELDS TESTS: PASS');
