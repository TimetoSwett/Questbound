import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { catalogKindForUrl, parseAonCatalogPage } = await import('../lib/aon-catalog-parser.ts');
const { gearDataSchema, parseCreateInput } = await import('../lib/library.ts');

export const fixture = (name) => readFileSync(new URL(`./fixtures/aon/${name}.html`, import.meta.url), 'utf8');
export function checkItem(name, path, expected) {
  const url = `https://aonprd.com/${path}`;
  const html = fixture(name);
  for (const host of ['aonprd.com', 'www.aonprd.com']) {
    assert.equal(catalogKindForUrl(url.replace('aonprd.com', host)), 'gear');
  }
  const draft = parseAonCatalogPage(html, url);
  assert.equal(draft.sourceUrl, url);
  assert.equal(draft.kind, 'gear');
  assert.equal(parseCreateInput(draft).ok, true, JSON.stringify(parseCreateInput(draft)));
  gearDataSchema.parse(draft.data);
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(key === 'name' ? draft.name : draft.data[key], value, key);
  }
  for (const text of [draft.name, draft.summary, draft.data.description]) {
    assert.ok(text);
    assert.doesNotMatch(text, /<\/?[a-z][^>]*>|&(?:#\d+|[a-z]+);/i);
    assert.doesNotMatch(text, /Toggle Theme|Site Owner/);
  }
  assert.equal(catalogKindForUrl(url.replace('https:', 'http:')), null);
  assert.equal(catalogKindForUrl(url.replace('aonprd.com', 'aonprd.com.example.org')), null);
  assert.equal(catalogKindForUrl(url.replace('Display.aspx', '.aspx')), null);
  assert.throws(() => parseAonCatalogPage('<html>Not an item</html>', url), /Could not find an entry/);
  return { draft, html, url };
}
