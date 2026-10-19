import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const S = await import('../lib/spell-item-import.ts');
const L = await import('../lib/library.ts');
const C = await import('../lib/catalog.ts');
const F = await import('../lib/sheet-entry-forms.ts');

export const fixture = (source, file) => readFileSync(new URL(`./fixtures/${source}/${file}.html`, import.meta.url), 'utf8');
export function checkSpellItem(source, itemType) {
  const url = source === 'aon' ? 'https://aonprd.com/SpellDisplay.aspx?ItemName=Fireball' : 'https://www.d20pfsrd.com/magic/all-spells/f/fireball/';
  const html = fixture(source, 'fireball');
  const opts = { itemType, cl: 5, charges: itemType === 'wand' ? 25 : 1 };
  const draft = S.parseSpellItemImport(html, url, opts);
  const parsed = L.parseCreateInput(draft);
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  assert.equal(draft.kind, 'gear');
  assert.equal(draft.sourceUrl, url);
  assert.equal(draft.data.slot, 'slotless');
  assert.equal(draft.data.cl, 5);
  assert.equal(draft.data.spellItem.spellLevel, 3);
  assert.equal(draft.data.spellItem.charges, opts.charges);
  assert.equal(draft.data.cost, itemType === 'wand' ? '5,625 gp' : '375 gp');
  for (const text of ['School: evocation', 'Casting time:', 'Components:', 'Range:', 'Area / Target / Effect:', 'Duration:', 'Saving throw:', 'Spell resistance:', 'Spell levels:']) {
    assert.ok(draft.data.description.includes(text), text);
  }
  assert.match(draft.data.description, /fireball spell generates/i);
  assert.doesNotMatch(draft.data.description, /<\/?[a-z][^>]*>|Copyright|Mythic/);
  // Copying to a character keeps independent charges and all the spell notes.
  const sheet = C.gearFromLibrary(draft.name, draft.data, { libraryEntryId: 'test', sourceUrl: url });
  assert.deepEqual(sheet.spellItem, draft.data.spellItem);
  assert.notEqual(sheet.spellItem, draft.data.spellItem);
  const form = F.gearFormFromItem(sheet);
  const change = F.gearPatchFromForm({ ...form, charges: itemType === 'wand' ? '24' : '0' });
  assert.equal(change.ok, true);
  assert.equal(change.patch.value, itemType === 'wand' ? '5,400 gp' : '0 gp');
  assert.equal(change.patch.spellItem.charges, opts.charges - 1);
  assert.equal(change.patch.notes, sheet.notes);
  assert.equal(F.gearPatchFromForm({ ...form, charges: '-1' }).ok, false);
  assert.equal(F.gearPatchFromForm({ ...form, charges: '1.5' }).ok, false);
  assert.equal(F.gearPatchFromForm({ ...form, charges: itemType === 'wand' ? '51' : '2' }).ok, false);
  assert.equal(F.gearPatchFromForm({ ...form, cl: '' }).ok, false);
  const upgraded = F.gearPatchFromForm({ ...form, cl: '6' });
  assert.equal(upgraded.patch.value, itemType === 'wand' ? '6,750 gp' : '450 gp');
  const exhausted = F.gearPatchFromForm({ ...form, charges: '0' });
  assert.equal(exhausted.patch.value, '0 gp');
  assert.equal(draft.data.spellItem.charges, opts.charges, 'catalog template unchanged');
  const costly = S.parseSpellItemImport(html, url, { ...opts, componentCostGp: 10 });
  assert.equal(L.spellItemValueGp(costly.data.spellItem, 5), itemType === 'wand' ? 5875 : 385);
  for (const bad of [{ cl: 0 }, { cl: 31 }, { cl: 1.5 }, { cl: NaN }, { componentCostGp: -1 }, { charges: 51 }, { charges: -1 }, { charges: 0.5 }]) {
    assert.throws(() => S.parseSpellItemImport(html, url, { ...opts, ...bad }));
  }
  if (itemType === 'wand') assert.throws(() => S.parseSpellItemImport(html, url, { itemType, cl: 5 }), /charges/);
  if (itemType === 'scroll') assert.throws(() => S.parseSpellItemImport(html, url, { ...opts, charges: 0 }), /one charge/);
  for (const bad of [url.replace('https:', 'http:'), url.replace('://', '://user@'), url.replace('.com/', '.com.evil/'), 'https://aonprd.com/Spells.aspx?Class=All', 'https://www.d20pfsrd.com/magic/all-spells/f/']) {
    assert.equal(S.isSpellItemSource(bad), false, bad);
    assert.throws(() => S.parseSpellItemImport(html, bad, opts), /spell link/);
  }
  assert.throws(() => S.parseSpellItemImport('<html>not a spell</html>', url, opts));
  const long = C.gearFromLibrary('Long spell', { ...draft.data, description: 'x'.repeat(12000) }, {});
  assert.equal(long.notes.length, 12000, 'long spell notes survive the sheet copy');
  console.log(`${source.toUpperCase()} ${itemType.toUpperCase()} SPELL IMPORT: PASS`);
}

