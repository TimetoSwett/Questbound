import assert from 'node:assert/strict';
const { parseAonCatalogPage } = await import('../lib/aon-catalog-parser.ts');
import { checkItem } from './test-aon-item-helpers.mjs';
const { draft, html, url } = checkItem('weapon', 'MagicWeaponsDisplay.aspx?ItemName=Arachnid%27s%20Fang', {
  name: "Arachnid's Fang", cost: '18,302 gp', weight: 1, slot: 'slotless', cl: 9, aura: 'moderate transmutation',
});
assert.match(draft.data.description, /Construction[\s\S]*9,302 gp/);
assert.match(draft.summary, /^Poison applied/);
assert.equal(parseAonCatalogPage(html.replace('<b>Slot</b> none;', ''), url).data.slot, 'slotless');
console.log('AON MAGIC WEAPONS: PASS');
