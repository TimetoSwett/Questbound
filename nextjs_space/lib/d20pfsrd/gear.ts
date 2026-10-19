// Turn one d20pfsrd.com mundane gear page into a library draft (PF1e).
// Pure string parsing, like the other d20pfsrd parsers. The caller passes one
// page; nothing is crawled.
//
// Mundane gear pages list many items (one h4 section each). The URL fragment
// (#item-id) picks a single item; without a fragment a multi-item page is
// rejected with a hint to copy the anchored link.
//
// Prices/weights live in page-level tables at the top AND/OR in the item's
// own section. Order: the item's own Price/Cost line (not one inside a variant
// <ul> or a later <h5>), then the item's own variant table (first row), then the
// page-level table row (by #anchor, else by name). If none yields a price or a
// weight, the import throws instead of silently importing blanks.
//
// 3rd-party goods (/3rd-party-goods-and-services/<publisher>/<item>/) are one
// item per page: the h1 is the name and the whole article is the section.

import { htmlToText } from '../aon-spell-parser';
import type { CatalogDraft } from '../aon-catalog-parser';
import { sanitizeSummary, summaryFromDescription } from '../library';
import { D20PFSRD_UNSUPPORTED, GEAR_HINT as HINT } from './messages';

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const oneLine = (html: string) => htmlToText(html).replace(/\s+/g, ' ').trim();

type ItemSection = { ids: string[]; name: string; html: string };
type PriceEntry = { price: string; weight: number; name: string; link: string };
type PriceWeight = { price: string; weight: number; name?: string };

/** Normalize an anchor or name for matching: lowercase, strip leading toc-, entities, punctuation. */
function normAnchor(s: string): string {
  return s.toLowerCase().replace(/^toc-/, '').replace(/&#?\w+;?/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** All anchor ids for an h4 heading: span id, a name/id, and normalized forms. */
function headingIds(headHtml: string): string[] {
  const ids = new Set<string>();
  for (const m of headHtml.matchAll(/<span\b[^>]*\bid=["']([^"']+)["']/gi)) ids.add(m[1].toLowerCase());
  for (const m of headHtml.matchAll(/<a\b[^>]*\b(?:name|id)=["']([^"']+)["']/gi)) ids.add(m[1].toLowerCase());
  for (const id of [...ids]) ids.add(normAnchor(id));
  return [...ids];
}

/** The article body only: no comments/scripts, no sidebar widgets, no Section 15. */
function articleHtml(page: string): string {
  let h = page.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, '');
  const start = h.search(/<div\b[^>]*\bid=["']article-content["'][^>]*>/i);
  if (start >= 0) h = h.slice(start);
  for (const re of [/<div\b[^>]*class=["'][^"']*\bsection15\b/i, /<div\b[^>]*class=["'][^"']*\barticle-edit-link\b/i, /<div\b[^>]*class=["'][^"']*\bright-sidebar\b/i]) {
    const i = h.search(re);
    if (i >= 0) h = h.slice(0, i);
  }
  return h;
}

/** Split the article into h4 item sections (name + body until the next h3/h4). */
function itemSections(page: string): ItemSection[] {
  const h = articleHtml(page);
  const sections: ItemSection[] = [];
  const heads = [...h.matchAll(/<h4\b([^>]*)>([\s\S]*?)<\/h4>/gi)];
  for (let i = 0; i < heads.length; i++) {
    if (/\bwidget-title\b/i.test(heads[i][1])) continue;
    const headHtml = heads[i][2];
    const name = oneLine(headHtml);
    if (!name) continue;
    const bodyStart = heads[i].index! + heads[i][0].length;
    const nextH = h.slice(bodyStart).search(/<h[34]\b/i);
    let body = nextH >= 0 ? h.slice(bodyStart, bodyStart + nextH) : h.slice(bodyStart);
    // A page-level category table (<p><a name="table-…">) can sit between the last item of
    // one group and the next h3; it belongs to the page, not to this item (Tent).
    const tbl = body.search(/<p\b[^>]*>\s*<a\b[^>]*\bname=["']table-/i);
    if (tbl >= 0) body = body.slice(0, tbl);
    sections.push({ ids: headingIds(headHtml), name, html: body });
  }
  // A copy-pasted anchor can sit on two headings (tools-kits: "Shears" carries
  // name="TOC-Bridge-Portable"). Give a shared anchor only to the heading whose name it spells.
  const owners = new Map<string, ItemSection[]>();
  for (const sct of sections) for (const id of sct.ids) owners.set(id, [...(owners.get(id) ?? []), sct]);
  for (const [id, list] of owners) {
    if (list.length < 2) continue;
    const named = list.filter((sct) => normAnchor(sct.name) === normAnchor(id));
    if (!named.length) continue;
    for (const sct of list) if (!named.includes(sct)) sct.ids = sct.ids.filter((x) => x !== id);
  }
  return sections;
}

/** A single-item page (3rd-party goods): the h1 title and everything after it. */
function singlePageSection(page: string): ItemSection | null {
  const h = articleHtml(page);
  const m = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(h);
  if (!m) return null;
  const name = oneLine(m[1]);
  if (!name) return null;
  const body = h.slice(m.index + m[0].length).replace(/<div\b[^>]*class=["'][^"']*\bogn-childpages\b[\s\S]*?<\/div>/gi, '');
  return { ids: [], name, html: body };
}

/** Order-free name key: "Key blank, wax" = "Key, Wax Blank", "Chains, breakaway" = "Chain, Breakaway". */
function wordKey(name: string): string {
  const words = normAnchor(name.replace(/\s*\([^)]*\)\s*$/, '')).split('-').filter(Boolean).map((w) => (w.length > 3 ? w.replace(/s$/, '') : w));
  return [...new Set(words)].sort().join(' ');
}

/** Cells of a table row as {text, link}. */
function rowCells(rowHtml: string): Array<{ text: string; link: string }> {
  return [...rowHtml.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => ({
    text: oneLine(c[1].replace(/<sup\b[\s\S]*?<\/sup>/gi, '')), // footnote markers ("20 lbs.<sup>1</sup>")
    link: /href=["']#([^"']+)["']/i.exec(c[1])?.[1] ?? '',
  }));
}

/** Header row (first row with a Price/Cost cell AND a non-price cell) and its column indexes. */
function tableHeader(rows: Array<Array<{ text: string }>>): { hi: number; pi: number; wi: number } | null {
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].map((c) => c.text.toLowerCase().replace(/\s*\d+$/, ''));
    const p = cells.findIndex((c) => /^(price|cost)$/.test(c));
    const w = cells.findIndex((c) => /^weight$/.test(c));
    const hasItem = cells.some((c) => c && !/^(price|cost|weight|source)$/.test(c));
    if (p >= 0 && hasItem) return { hi: i, pi: p, wi: w };
  }
  return null;
}

/**
 * Page-wide anchor/name -> table rows (in page order). Several rows can share
 * one anchor (Tent small/medium/large all link #TOC-Tent; "Chain (10 ft.)" and
 * "Chains, breakaway" both link #TOC-Chain), so every row is kept and the
 * caller picks one; nothing is overwritten by a later row.
 */
function pagePriceMap(page: string): Map<string, PriceEntry[]> {
  const map = new Map<string, PriceEntry[]>();
  const add = (k: string, e: PriceEntry) => { if (k) map.set(k, [...(map.get(k) ?? []), e]); };
  const h = articleHtml(page);
  for (const tm of h.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const rows = [...tm[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) => rowCells(r[1]));
    const hd = tableHeader(rows);
    if (!hd) continue;
    for (let i = hd.hi + 1; i < rows.length; i++) {
      const cells = rows[i];
      if (!cells.length || hd.pi >= cells.length) continue;
      if (/^(price|cost|weight)$/i.test(cells[hd.pi].text)) continue; // sub-header row
      const price = parsePrice(cells[hd.pi].text);
      const weight = hd.wi >= 0 && hd.wi < cells.length ? parseWeight(cells[hd.wi].text) : 0;
      if (!price && !weight) continue;
      const link = cells[0].link || '';
      const entry: PriceEntry = { price, weight, name: cells[0].text, link };
      if (link) add(normAnchor(link), entry);
      add(`name:${normAnchor(cells[0].text)}`, entry);
      add(`words:${wordKey(cells[0].text)}`, entry);
    }
  }
  return map;
}

/** "—"/"-"/"–" -> '' (no price); otherwise trimmed text. */
function parsePrice(raw: string): string {
  const t = raw.trim().replace(/[.;,\s]+$/, '').replace(/^[:\s]+/, '');
  // Dashes, n/a, and bare multipliers ("×2" barding cost relative to armor) are not prices.
  if (!t || /^[—–-]+$/.test(t) || /^(n\/a|none)$/i.test(t) || /^[×x]\s*\d+$/i.test(t)) return '';
  // Coin units like core pages: "25gp" -> "25 gp", "5 GP" -> "5 gp".
  return clip(t.replace(/(\d)\s*(cp|sp|gp|pp)\b/gi, (_, d: string, u: string) => `${d} ${u.toLowerCase()}`), 120);
}

/**
 * Weight in pounds. "5 lbs." -> 5, "1/2 lb." -> 0.5, "1-1/2 lbs." / "1–1/2 lbs." -> 1.5,
 * "½ lb." -> 0.5, "2½" -> 2.5, "1 lb. per 10 ft." -> 1, "8 oz." -> 0.5, "3 tons" -> 6000,
 * ranges take the low end, "—"/""/"varies"/"200 gp" -> 0. Footnote digits stripped.
 */
function parseWeight(raw: string): number {
  let t = raw.trim().toLowerCase().replace(/&#?\w+;?/g, '—');
  t = t.replace(/\s+per\s+.*$/, '');
  if (!t || /^[—–-]/.test(t) || /\b(gp|sp|cp|pp)\b/.test(t)) return 0;
  const unit = /^[\d\s,./½¼¾⅓⅔–-]*\s*(tons?|oz)/.exec(t)?.[1];
  const mult = unit?.startsWith('ton') ? 2000 : unit === 'oz' ? 1 / 16 : 1;
  const cap = (v: number) => (Number.isFinite(v) ? Math.min(Math.round(v * mult * 10_000) / 10_000, 100_000) : 0);
  const uni: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };
  let m = /^(\d+)?\s*([½¼¾⅓⅔])/.exec(t);
  if (m) return cap(Number(m[1] || 0) + uni[m[2]]);
  m = /^(\d+)\s*[-–\s]\s*(\d+)\s*\/\s*(\d+)/.exec(t); // "1-1/2", "1–1/2", "1 1/2"
  if (m) return cap(Number(m[1]) + Number(m[2]) / Number(m[3]));
  m = /^(\d+)\s*\/\s*(\d+)/.exec(t); // "1/2"
  if (m) return cap(Number(m[1]) / Number(m[2]));
  m = /^(\d[\d,]*(?:\.\d+)?)/.exec(t); // leading number only ("1 lb.–8 lbs." -> 1, "10 lbs.1" -> 10)
  return m ? cap(Number(m[1].replace(/,/g, ''))) : 0;
}

/** Strip blocks that hold variant/sub-entry stats, so they cannot pose as the item's own line. */
const ownHtml = (html: string) => html
  .replace(/<(ul|ol|table)\b[\s\S]*?<\/\1>/gi, '')
  .split(/<h5\b/i)[0];

/**
 * The item's own Price/Cost line. "Price" wins over "Cost"; a Cost that follows
 * a Craft label in the same paragraph (technological CONSTRUCTION lines) is not a price.
 * Weight is read from the same paragraph (Price; Slot; Weight works).
 */
function sectionPriceLine(html: string): PriceWeight | null {
  const h = ownHtml(html);
  const label = (l: string) => new RegExp(`<(b|strong)\\b[^>]*>\\s*(?:base\\s+)?${l}\\s*:?\\s*<\\/\\1>\\s*:?\\s*([^<;]*)`, 'gi');
  const paraOf = (i: number) => {
    const s = Math.max(h.lastIndexOf('<p', i), h.lastIndexOf('<br', i), h.lastIndexOf('</p>', i));
    const e = h.indexOf('</p>', i);
    return h.slice(s < 0 ? 0 : s, e < 0 ? h.length : e);
  };
  for (const l of ['price', 'cost']) {
    for (const m of h.matchAll(label(l))) {
      const para = paraOf(m.index!);
      if (l === 'cost' && /<(b|strong)\b[^>]*>\s*craft\s*<\/\1>/i.test(para)) continue;
      const price = parsePrice(oneLine(m[2]));
      // Weight in the price paragraph, else a Weight label elsewhere in the item's own text
      // (3rd-party single-item pages put it on its own line).
      const wm = /<(b|strong)\b[^>]*>\s*weight\s*:?\s*<\/\1>\s*:?\s*([^<;]+)/i.exec(para)
        ?? /<(b|strong)\b[^>]*>\s*weight\s*:?\s*<\/\1>\s*:?\s*([^<;]+)/i.exec(h);
      const weight = wm ? parseWeight(oneLine(wm[2])) : 0;
      if (price || weight) return { price, weight };
    }
  }
  return null;
}

/** First data row of a variant table inside the section (Thieves' tools Common/Concealable/Masterwork). */
function sectionVariantTable(html: string, ids: string[] = []): PriceWeight | null {
  const t = /<table\b[^>]*>([\s\S]*?)<\/table>/i.exec(html.split(/<h5\b/i)[0]);
  if (!t) return null;
  const rows = [...t[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) => rowCells(r[1]));
  const hd = tableHeader(rows);
  if (!hd) return null;
  // Prefer the row whose #link is this item's anchor, then the first row.
  const anchors = new Set(ids.map(normAnchor));
  const order = [...Array(rows.length).keys()].slice(hd.hi + 1);
  const linked = (i: number) => rows[i].some((c) => c.link && anchors.has(normAnchor(c.link)));
  order.sort((x, y) => Number(linked(y)) - Number(linked(x)) || x - y);
  for (const i of order) {
    const c = rows[i];
    if (hd.pi >= c.length) continue;
    const price = parsePrice(c[hd.pi].text);
    const weight = hd.wi >= 0 && hd.wi < c.length ? parseWeight(c[hd.wi].text) : 0;
    if (price || weight) return { price, weight };
  }
  return null;
}

/**
 * All rows of a size table inside the section (Chest: Small/Medium/Large/Huge).
 * A size table is one whose first-column header is Type/Size/Variant/Kind (not Item),
 * with Price and Weight columns. Returns each row's label, price, and weight.
 */
function sectionSizeRows(html: string): Array<{ label: string; price: string; weight: number }> {
  const t = /<table\b[^>]*>([\s\S]*?)<\/table>/i.exec(html.split(/<h5\b/i)[0]);
  if (!t) return [];
  const rows = [...t[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) => rowCells(r[1]));
  const hd = tableHeader(rows);
  if (!hd) return [];
  // Check if first column header is a size/type label (not "Item")
  const firstHeader = rows[hd.hi][0]?.text.toLowerCase() ?? '';
  if (!/^(type|size|variant|kind)$/.test(firstHeader)) return [];
  const result: Array<{ label: string; price: string; weight: number }> = [];
  for (let i = hd.hi + 1; i < rows.length; i++) {
    const c = rows[i];
    if (hd.pi >= c.length) continue;
    const label = c[0]?.text ?? '';
    if (!label) continue;
    const price = parsePrice(c[hd.pi].text);
    const weight = hd.wi >= 0 && hd.wi < c.length ? parseWeight(c[hd.wi].text) : 0;
    if (price || weight) result.push({ label, price, weight });
  }
  return result;
}

const stripParen = (n: string) => n.replace(/\s*\([^)]*\)\s*$/, '');
const ambiguous = (item: ItemSection, rows: PriceEntry[]) => new Error(
  `${D20PFSRD_UNSUPPORTED} "${item.name}" matches several price rows on that page (${rows.slice(0, 4).map((r) => `${r.name}: ${r.price || '—'}`).join('; ')}${rows.length > 4 ? '; …' : ''}), so the price is ambiguous. Link the exact row instead (e.g. #${normAnchor(rows[0].name)}) or add it by hand.`);

/**
 * One row, or several that agree. Rows agree when they have the same price and at most one
 * distinct non-zero weight (a training-cost table repeats "Woolly mammoth 3,000 gp" without a
 * weight). Different prices or weights are ambiguous and throw (Ale 2 sp / 4 cp).
 */
function single(item: ItemSection, rows: PriceEntry[], withName = false): PriceWeight | null {
  if (!rows.length) return null;
  const prices = new Set(rows.map((r) => r.price));
  const weights = new Set(rows.map((r) => r.weight).filter((w) => w > 0));
  if (prices.size > 1 || weights.size > 1) {
    throw ambiguous(item, rows.filter((r, i) => rows.findIndex((o) => o.price === r.price && o.weight === r.weight) === i));
  }
  const best = rows.find((r) => r.weight > 0) ?? rows[0];
  return withName ? best : { price: best.price, weight: best.weight };
}

/**
 * Page-level table row for this item: by anchor first, then by exact name
 * (with and without a trailing parenthetical), then by order-free words.
 * Several rows can share one anchor. Rows are compared to the heading with any
 * trailing "(...)" stripped, and the matching rows must agree:
 *  - exact-name rows win (Woolly mammoth over Woolly mammoth (combat-trained));
 *  - #chain: "Chain (10 ft.)" matches "Chain", "Chains, breakaway" does not -> 30 gp, named "Chain (10 ft.)";
 *  - #ale_luglurch: two "Ale, Luglurch" rows (1 gp / 4 sp) -> ambiguous, throws;
 *  - #TOC-Tent: "Tent, small/medium/…" none matches "Tent" -> ambiguous, throws
 *    (link the row itself instead: #tent-small, see rowByFragment);
 *  - a lone row on the anchor is used as is.
 */
function pageTableRow(item: ItemSection, map: Map<string, PriceEntry[]>): PriceWeight | null {
  const want = normAnchor(stripParen(item.name));
  const anchors = [...new Set(item.ids.map(normAnchor))];
  for (const k of anchors) {
    const rows = map.get(k);
    if (!rows?.length) continue;
    if (rows.length === 1) return single(item, rows);
    // Rows named exactly like the heading first (Woolly mammoth vs Woolly mammoth (combat-trained)),
    // then rows matching once a trailing "(...)" is stripped (Chain (10 ft.)).
    const exact = rows.filter((r) => normAnchor(r.name) === normAnchor(item.name));
    if (exact.length) return single(item, exact);
    const match = rows.filter((r) => normAnchor(stripParen(r.name)) === want);
    if (match.length) return single(item, match, true);
    throw ambiguous(item, rows);
  }
  for (const k of [`name:${normAnchor(item.name)}`, `name:${want}`, `words:${wordKey(item.name)}`]) {
    const rows = map.get(k);
    if (rows?.length) return single(item, rows);
  }
  return null;
}

/**
 * A fragment naming one table row ("#tent-small", "#Tent,%20small", "#tent_small" for the
 * "Tent, small" row). d20pfsrd gives such rows no anchor of their own (all Tent rows link
 * #TOC-Tent), so the row name is the only way to point at one. Returns the row and the
 * section its link points to.
 */
function rowByFragment(fragNorm: string, sections: ItemSection[], map: Map<string, PriceEntry[]>): { row: PriceEntry; item: ItemSection } | null {
  if (!fragNorm) return null;
  const seen = new Set<PriceEntry>();
  for (const rows of map.values()) for (const r of rows) if (normAnchor(r.name) === fragNorm) seen.add(r);
  const rows = [...seen];
  if (!rows.length) return null;
  const item = sections.find((s) => rows[0].link && s.ids.includes(normAnchor(rows[0].link)));
  if (!item) return null;
  const pw = single({ ...item, name: rows[0].name }, rows, true) as PriceEntry;
  return { row: pw, item };
}

/** Description: paragraphs and lists, minus source citations, labels, and price tables. */
function description(html: string): string {
  const h = html
    // Remove the price paragraph, but keep text after a <br> (rules text).
    .replace(/<p\b[^>]*>\s*<(b|strong)[^>]*>\s*(price|cost)\s*<\/\1>[\s\S]*?<\/p>/gi, (p) => {
      const br = p.search(/<br\s*\/?>/i);
      return br >= 0 ? p.slice(br) : '';
    })
    .replace(/<p\b[^>]*\bclass=["'][^"']*\bsource\b[^"']*["'][\s\S]*?<\/p>/gi, '')
    // Strip DESCRIPTION / CONSTRUCTION divider labels and craft-requirement lines.
    .replace(/<p\b[^>]*\bclass=["'][^"']*\bdivider\b[^"']*["'][^>]*>[\s\S]*?<\/p>/gi, '')
    .replace(/<p\b[^>]*>\s*<b[^>]*>\s*construction\s*<\/b>[\s\S]*?<\/p>/gi, '');
  const parts: string[] = [];
  for (const b of h.matchAll(/<(p|ul|ol|table)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi)) {
    const tag = b[1].toLowerCase();
    if (tag === 'table') {
      // Keep non-price tables as text; drop price tables (data already captured).
      const txt = oneLine(b[3]);
      if (/price|cost|weight/i.test(txt.slice(0, 200))) continue;
      const rows = [...b[3].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
        .map((r) => [...r[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => oneLine(c[1])).join(' | '));
      if (rows.length) parts.push(rows.join('\n'));
      continue;
    }
    const text = tag === 'p' ? htmlToText(b[3]) : htmlToText(b[3].replace(/<li\b[^>]*>/gi, '<li>• '));
    if (text.trim()) parts.push(text.trim());
  }
  return parts.join('\n\n');
}

/** 3rd-party goods live one item per page: /equipment/3rd-party-equipment/3rd-party-goods-and-services/<publisher>/<item>/ */
function isSingleItemUrl(sourceUrl: string): boolean {
  try {
    const seg = new URL(sourceUrl).pathname.split('/').filter(Boolean).map((s) => s.toLowerCase());
    return seg[0] === 'equipment' && seg[1] === '3rd-party-equipment' && seg[2] === '3rd-party-goods-and-services' && seg.length === 5;
  } catch { return false; }
}

/** Parse one d20pfsrd mundane gear item into a library create body (not yet schema-checked). */
/**
 * Goods-and-services pages that list services, not carriable gear. Rejected outright:
 * /equipment/goods-and-services/hirelings-servants-services/ (hirelings, inn stays, baths,
 * messengers, tolls, spellcasting). Kept generic so a renamed/added services page is caught too.
 */
export function isServicesGearPath(sourceUrl: string): boolean {
  try {
    const seg = new URL(sourceUrl).pathname.split('/').filter(Boolean).map((s) => s.toLowerCase());
    return seg[0] === 'equipment' && seg[1] === 'goods-and-services' && !!seg[2] && /(^|-)(hirelings?|servants?|services?|lodging)(-|$)/.test(seg[2]);
  } catch { return false; }
}
export const NOT_GEAR = 'That page lists services (hirelings, lodging, spellcasting and the like), not gear, so it cannot be imported as a gear item.';
/** Service rows that sit on otherwise-gear pages (Food & Lodging on hunting-camping-survival-gear). */
const SERVICE_HEADING = /\b(cost of living|lodging|hirelings?|servants?)\b/i;

export function parseD20pfsrdGearPage(html: string, sourceUrl: string): CatalogDraft {
  if (isServicesGearPath(sourceUrl)) throw new Error(`${D20PFSRD_UNSUPPORTED} ${NOT_GEAR}`);
  let fragment = '';
  try { fragment = decodeURIComponent(new URL(sourceUrl).hash.replace(/^#/, '')).toLowerCase(); }
  catch { fragment = ''; }
  const fragNorm = normAnchor(fragment);
  let item: ItemSection | undefined | null;
  let byRow: PriceWeight | null = null; // fragment named one table row (#tent-small)
  if (isSingleItemUrl(sourceUrl)) {
    item = singlePageSection(html);
    if (!item) throw new Error(`${D20PFSRD_UNSUPPORTED} That page has no gear entry.${HINT}`);
  } else {
    const sections = itemSections(html);
    if (fragment) {
      item = sections.find((s) => s.ids.includes(fragment)) ?? sections.find((s) => s.ids.includes(fragNorm));
      if (!item) {
        const hit = rowByFragment(fragNorm, sections, pagePriceMap(html));
        if (hit) { item = hit.item; byRow = hit.row; }
      }
      if (!item) throw new Error(`${D20PFSRD_UNSUPPORTED} No item "#${fragment}" on that page.${HINT}`);
    } else if (sections.length === 1) {
      item = sections[0];
    } else if (!sections.length) {
      throw new Error(`${D20PFSRD_UNSUPPORTED} That page has no gear entries.${HINT}`);
    } else {
      throw new Error(`${D20PFSRD_UNSUPPORTED} That page lists ${sections.length} items. Copy the link with the #item anchor for the one you want.${HINT}`);
    }
  }
  if (SERVICE_HEADING.test(item.name)) throw new Error(`${D20PFSRD_UNSUPPORTED} "${item.name}" is a service, not gear.${HINT}`);
  // Order: the item's own Price line, its own variant table, then the page-level table row.
  // The page table is only consulted when the section itself has nothing, so an
  // ambiguous table (several rows for one anchor) never blocks an item whose own text is clear.
  const pageMap = pagePriceMap(html);
  const own = byRow ? null : sectionPriceLine(item.html) ?? sectionVariantTable(item.html, item.ids);
  const pw: PriceWeight = byRow ?? own ?? pageTableRow(item, pageMap) ?? { price: '', weight: 0 };
  const price = pw.price;
  let weight = pw.weight;
  // Own line without a weight: take the table weight only when an unambiguous row has the same price.
  if (own && price && !weight) {
    let row: PriceWeight | null = null;
    try { row = pageTableRow(item, pageMap); } catch { row = null; }
    if (row && row.price === price) weight = row.weight;
  }
  // Still no weight: a Weight label anywhere in the item's own section, if they all agree
  // (Pack Animal: price from the table, "Yak … Weight 1,000 lbs." in its list).
  if (!byRow && price && !weight) {
    const ws = new Set([...item.html.matchAll(/<(b|strong)\b[^>]*>\s*weight\s*:?\s*<\/\1>\s*:?\s*([^<;]+)/gi)].map((m) => parseWeight(oneLine(m[2]))).filter((w) => w > 0));
    if (ws.size === 1) weight = [...ws][0];
  }
  if (!price && !weight) {
    throw new Error(`${D20PFSRD_UNSUPPORTED} Could not read a price or weight for "${item.name}".${HINT}`);
  }
  const desc = description(item.html);
  if (!desc) throw new Error(`${D20PFSRD_UNSUPPORTED} Could not read a description for "${item.name}".${HINT}`);
  const name = clip(pw.name || item.name, 120);
  return {
    kind: 'gear', name,
    summary: summaryFromDescription(desc) || sanitizeSummary(name),
    sourceUrl,
    data: {
      // Mundane gear is slotless and non-magical: no aura or CL.
      slot: 'slotless',
      weight,
      cost: price || '0 gp',
      description: clip(desc, 20_000),
    },
  };
}

/** Build a draft from parts (shared by single and multi-draft paths). */
function buildGearDraft(name: string, desc: string, price: string, weight: number, sourceUrl: string): CatalogDraft {
  const n = clip(name, 120);
  return {
    kind: 'gear', name: n,
    summary: summaryFromDescription(desc) || sanitizeSummary(n),
    sourceUrl,
    data: {
      slot: 'slotless',
      weight,
      cost: price || '0 gp',
      description: clip(desc, 20_000),
    },
  };
}

/**
 * Parse one d20pfsrd mundane gear item into one or more drafts.
 * Items with a size table (Chest: Small/Medium/Large/...) return one draft per
 * size row, each named "Chest (small)" with its own cost and weight.
 * A fragment naming a specific size (#chest-small) returns just that row.
 */
export function parseD20pfsrdGearDrafts(html: string, sourceUrl: string): CatalogDraft[] {
  if (isServicesGearPath(sourceUrl)) throw new Error(`${D20PFSRD_UNSUPPORTED} ${NOT_GEAR}`);
  let fragment = '';
  try { fragment = decodeURIComponent(new URL(sourceUrl).hash.replace(/^#/, '')).toLowerCase(); }
  catch { fragment = ''; }
  const fragNorm = normAnchor(fragment);

  // Find the item section (same logic as parseD20pfsrdGearPage)
  let item: ItemSection | undefined | null;
  let orphanRow: PriceEntry | null = null; // table row whose #link matches no heading
  if (isSingleItemUrl(sourceUrl)) {
    item = singlePageSection(html);
    if (!item) throw new Error(`${D20PFSRD_UNSUPPORTED} That page has no gear entry.${HINT}`);
  } else {
    const sections = itemSections(html);
    const pageMapForFragment = pagePriceMap(html);
    if (fragment) {
      item = sections.find((s) => s.ids.includes(fragment)) ?? sections.find((s) => s.ids.includes(fragNorm));
      // Don't use rowByFragment here; size-row fragments handled below
      if (!item) {
        // Check if fragment names a size row (e.g., #chest-small)
        const sec = sections.find((s) => {
          const rows = sectionSizeRows(s.html);
          return rows.some((r) => normAnchor(`${s.name}-${r.label}`) === fragNorm || normAnchor(`${s.name} ${r.label}`) === fragNorm);
        });
        if (sec) item = sec;
      }
      // Fallback: fragment matches a table row's #link but no heading.
      // Import from the row alone, matching a description by name if possible.
      if (!item) {
        for (const rows of pageMapForFragment.values()) {
          const hit = rows.find((r) => normAnchor(r.link) === fragNorm || normAnchor(r.link) === fragment);
          if (hit) { orphanRow = hit; break; }
        }
        if (orphanRow) {
          // Try to find a description by fuzzy name match against headings
          const rowNameNorm = normAnchor(orphanRow.name);
          item = sections.find((s) =>
            normAnchor(s.name) === rowNameNorm ||
            normAnchor(stripParen(s.name)) === normAnchor(stripParen(orphanRow!.name)) ||
            wordKey(s.name) === wordKey(orphanRow!.name)
          ) ?? null;
        }
      }
      if (!item && !orphanRow) throw new Error(`${D20PFSRD_UNSUPPORTED} No item "#${fragment}" on that page.${HINT}`);
    } else if (sections.length === 1) {
      item = sections[0];
    } else if (!sections.length) {
      throw new Error(`${D20PFSRD_UNSUPPORTED} That page has no gear entries.${HINT}`);
    } else {
      throw new Error(`${D20PFSRD_UNSUPPORTED} That page lists ${sections.length} items. Copy the link with the #item anchor for the one you want.${HINT}`);
    }
  }
  // Orphan row: table row with no matching heading and no description found.
  // Import from the row alone.
  if (orphanRow && !item) {
    const name = clip(orphanRow.name, 120);
    const desc = `Price ${orphanRow.price || '—'}${orphanRow.weight ? `, Weight ${orphanRow.weight} lb.` : ''}. Imported from the equipment table; no description section exists on the source page.`;
    return [buildGearDraft(name, desc, orphanRow.price, orphanRow.weight, sourceUrl)];
  }
  if (!item) throw new Error(`${D20PFSRD_UNSUPPORTED} No item "#${fragment}" on that page.${HINT}`);
  if (SERVICE_HEADING.test(item.name)) throw new Error(`${D20PFSRD_UNSUPPORTED} "${item.name}" is a service, not gear.${HINT}`);

  const desc = description(item.html);
  if (!desc) throw new Error(`${D20PFSRD_UNSUPPORTED} Could not read a description for "${item.name}".${HINT}`);

  // Check for size table
  const sizeRows = sectionSizeRows(item.html);
  if (sizeRows.length > 1) {
    // If fragment specifies a size, return just that row
    if (fragment) {
      const match = sizeRows.find((r) =>
        normAnchor(`${item!.name}-${r.label}`) === fragNorm ||
        normAnchor(`${item!.name} ${r.label}`) === fragNorm ||
        normAnchor(r.label) === fragNorm
      );
      if (match) {
        return [buildGearDraft(`${item.name} (${match.label.toLowerCase()})`, desc, match.price, match.weight, sourceUrl)];
      }
    }
    // Return one draft per size row
    return sizeRows.map((r) =>
      buildGearDraft(`${item!.name} (${r.label.toLowerCase()})`, desc, r.price, r.weight, sourceUrl)
    );
  }

  // Single draft (existing behavior)
  return [parseD20pfsrdGearPage(html, sourceUrl)];
}
