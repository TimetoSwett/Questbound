import assert from 'node:assert/strict';
const { parseAonCatalogPage } = await import('../lib/aon-catalog-parser.ts');
import { checkItem } from './test-aon-item-helpers.mjs';
const { draft, html, url } = checkItem('armor', 'MagicArmorDisplay.aspx?ItemName=Advocate%27s%20Armor', {
  name: "Advocate's Armor", cost: '33,160 gp', weight: 15, slot: 'armor', cl: 11, aura: 'moderate enchantment',
});
assert.match(draft.data.description, /Construction[\s\S]*16,660 gp/);
assert.match(draft.summary, /^The papery layers/);
assert.equal(parseAonCatalogPage(html.replace('<b>Slot</b> armor;', ''), url).data.slot, 'armor');
console.log('AON MAGIC ARMOR: PASS');
