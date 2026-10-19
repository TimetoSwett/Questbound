import assert from 'node:assert/strict';
import { fixture } from './test-spell-item-helpers.mjs';
const D = await import('../lib/d20pfsrd-parser.ts');
const L = await import('../lib/library.ts');
export function checkItemPage(itemType) {
  const html = fixture('d20pfsrd', `${itemType}s/item-format`);
  const paths = [`magic-items/${itemType}s/test-${itemType}/`, `magic-items/3rd-party-magic-items/3rd-party-${itemType}s/test-publisher/test-${itemType}/`];
  for (const path of paths) for (const host of ['d20pfsrd.com', 'www.d20pfsrd.com']) {
    const url = `https://${host}/${path}`;
    assert.equal(D.d20pfsrdKindForUrl(url), 'gear');
    const [draft] = D.parseD20pfsrdDrafts(html, url);
    assert.equal(L.parseCreateInput(draft).ok, true);
    assert.equal(draft.kind, 'gear');
    assert.equal(draft.data.cost, '1,000 gp');
    assert.equal(draft.data.slot, 'slotless');
    assert.equal(draft.data.cl, 3);
    assert.equal(draft.data.weight, 0.5);
    assert.equal(draft.data.aura, 'faint evocation');
    assert.match(draft.data.description, /Construction[\s\S]*500 gp/);
    assert.doesNotMatch(draft.data.description, /Copyright|<\/?[a-z][^>]*>/);
    assert.equal(D.parseD20pfsrdPage(html.replace('<b>Aura</b> faint evocation;', '<b>Aura</b> no aura (non-magical);'), url).data.aura, undefined);
    assert.throws(() => D.parseD20pfsrdPage('<h1>Not an item</h1>', url), /magic item/);
    assert.equal(D.d20pfsrdKindForUrl(url.replace('https:', 'http:')), null);
  }
  for (const path of [`magic-items/${itemType}s/`, `magic-items/${itemType}s/a/b/`, `magic-items/3rd-party-magic-items/3rd-party-${itemType}s/`, `magic-items/3rd-party-magic-items/3rd-party-${itemType}s/test-publisher/`]) {
    assert.equal(D.d20pfsrdKindForUrl(`https://www.d20pfsrd.com/${path}`), null);
  }
  console.log(`D20 ${itemType.toUpperCase()} ITEM PAGE: PASS`);
}
