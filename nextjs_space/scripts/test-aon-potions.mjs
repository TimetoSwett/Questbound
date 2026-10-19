import assert from 'node:assert/strict';
const { parseAonCatalogPage } = await import('../lib/aon-catalog-parser.ts');
import { checkItem } from './test-aon-item-helpers.mjs';
const { draft, html, url } = checkItem('potion', 'MagicPotionsDisplay.aspx?ItemName=Calming%20Oils%20(Gozreh)', {
  name: 'Calming Oils (Gozreh)', cost: '1,000 gp', weight: 0, slot: 'slotless', cl: 5, aura: 'faint abjuration',
});
assert.match(draft.data.description, /Construction[\s\S]*Cost 500 gp/);
assert.equal(parseAonCatalogPage(html.replace('<b>Slot</b> none;', ''), url).data.slot, 'slotless');
console.log('AON POTIONS: PASS');
