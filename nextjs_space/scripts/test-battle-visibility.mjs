// Player view of battle-map tokens linked to bestiary creatures.
import assert from 'node:assert/strict';
import { sanitizeForPlayer, applyCreatureCardsForPlayer } from '../lib/battle-map.ts';

const state = {
  fog: ['5,5'],
  tokens: [
    { id: 'g1', label: 'Goblin Boss', x: 1, y: 1, size: 1, color: '#f00', creatureId: 'cHidden', portraitKey: 'p/g.png', hp: 12, maxHp: 20, conditions: ['prone'], characterName: 'x' },
    { id: 'o1', label: 'Orc', x: 2, y: 2, size: 1, color: '#0f0', creatureId: 'cFull', hp: 5, maxHp: 9 },
    { id: 'h1', label: 'Secret', x: 3, y: 3, size: 1, color: '#00f', hidden: true },
    { id: 'f1', label: 'Fogged', x: 5, y: 5, size: 1, color: '#00f', creatureId: 'cHidden' },
    { id: 'd1', label: 'Gone', x: 6, y: 6, size: 1, color: '#00f', creatureId: 'cDeleted' },
  ],
  turnOrder: [
    { id: 'te_1_g1', label: 'Goblin Boss', initiative: 15, tokenId: 'g1' },
    { id: 'te_2_o1', label: 'Orc', initiative: 10, tokenId: 'o1' },
    { id: 'te_3_h1', label: 'Secret', initiative: 9, tokenId: 'h1' },
    { id: 'te_4_f1', label: 'Fogged', initiative: 8 },
    { id: 'te_5_d1', label: 'Gone', initiative: 7, tokenId: 'd1' },
  ],
  activeId: 'te_1_g1',
};
const cards = new Map([['cHidden', null], ['cFull', { revealLevel: 'full', unlockedSections: [] }]]);
const out = applyCreatureCardsForPlayer(sanitizeForPlayer(state, []), cards, state.tokens);

assert.deepEqual(out.tokens.map((t) => t.id), ['g1', 'o1'], 'hidden-creature token kept; hidden/fogged/deleted removed');
const g = out.tokens[0];
assert.deepEqual(g, { id: 'g1', x: 1, y: 1, size: 1, color: '#f00', label: '???' });
assert.equal(out.tokens[1].hp, 5);
assert.deepEqual(out.turnOrder.map((e) => [e.id, e.label]), [['te_1_g1', '???'], ['te_2_o1', 'Orc']]);
assert.equal(out.activeId, 'te_1_g1');
assert.ok(!JSON.stringify(out).includes('Goblin Boss'));
assert.ok(!JSON.stringify(out).includes('Secret') && !JSON.stringify(out).includes('Fogged'));
console.log('test-battle-visibility: ok');
