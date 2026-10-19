import assert from 'node:assert/strict';
const { parseAonCatalogPage } = await import('../lib/aon-catalog-parser.ts');
import { checkItem } from './test-aon-item-helpers.mjs';
const { draft, html, url } = checkItem('shield', 'MagicArmorDisplay.aspx?ItemName=Caster%27s%20Shield', {
  name: "Caster's Shield", cost: '3,153 gp', weight: 5, slot: 'shield', cl: 6, aura: 'moderate abjuration',
});
assert.match(draft.data.description, /Construction[\s\S]*1,653 gp/);
assert.equal(parseAonCatalogPage(html.replace('<b>Slot</b> shield;', ''), url).data.slot, 'shield');
const { draft: mundane } = checkItem('mithral', 'MagicArmorDisplay.aspx?ItemName=Mithral%20Heavy%20Shield', {
  name: 'Mithral Heavy Shield', cost: '1,020 gp', weight: 5, slot: 'shield',
});
assert.equal('aura' in mundane.data, false);
assert.equal('cl' in mundane.data, false);
assert.match(mundane.data.description, /no aura \(nonmagical\)/);
console.log('AON MAGIC SHIELDS: PASS');
