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
import { D20PFSRD_UNSUPPORTED } from '../d20pfsrd-parser';

const HINT = ' Open a goods-and-services page (/equipment/goods-and-services/…) and copy the link with the #item anchor, e.g. …/hunting-camping-survival-gear/#bedroll.';

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const oneLine = (html: string) => htmlToText(html).replace(/\s+/g, ' ').trim();

type ItemSection = { ids: string[]; name: string; html: string };
type PriceEntry = { price: string; weight: number; name: string };
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
      const entry: PriceEntry = { price, weight, name: cells[0].text };
      const link = cells[0].link || '';
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
  return clip(t, 120);
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
      const wm = /<(b|strong)\b[^>]*>\s*weight\s*:?\s*<\/\1>\s*:?\s*([^<;]+)/i.exec(para);
      const weight = wm ? parseWeight(oneLine(wm[2])) : 0;
      if (price || weight) return { price, weight };
    }
  }
  return null;
}

/** First data row of a variant table inside the section (Thieves' tools Common/Concealable/Masterwork). */
function sectionVariantTable(html: string): PriceWeight | null {
  const t = /<table\b[^>]*>([\s\S]*?)<\/table>/i.exec(html.split(/<h5\b/i)[0]);
  if (!t) return null;
  const rows = [...t[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) => rowCells(r[1]));
  const hd = tableHeader(rows);
  if (!hd) return null;
  for (let i = hd.hi + 1; i < rows.length; i++) {
    const c = rows[i];
    if (hd.pi >= c.length) continue;
    const price = parsePrice(c[hd.pi].text);
    const weight = hd.wi >= 0 && hd.wi < c.length ? parseWeight(c[hd.wi].text) : 0;
    if (price || weight) return { price, weight };
  }
  return null;
}

/**
 * Page-level table row for this item: by anchor first, then by exact name
 * (with and without a trailing parenthetical). When several rows share the
 * anchor, the one whose name equals the heading wins, else the first row, and
 * its row name is returned so "Tent" imports as "Tent, small" (honest about which row).
 */
function pageTableRow(item: ItemSection, map: Map<string, PriceEntry[]>): PriceWeight | null {
  const want = normAnchor(item.name);
  const anchors = [...new Set(item.ids.map(normAnchor))];
  for (const k of anchors) {
    const rows = map.get(k);
    if (!rows?.length) continue;
    const exact = rows.find((r) => normAnchor(r.name) === want);
    if (exact) return { price: exact.price, weight: exact.weight };
    return rows.length > 1 ? rows[0] : { price: rows[0].price, weight: rows[0].weight };
  }
  for (const k of [`name:${want}`, `name:${normAnchor(item.name.replace(/\s*\([^)]*\)\s*$/, ''))}`, `words:${wordKey(item.name)}`]) {
    const rows = map.get(k);
    if (rows?.length) return { price: rows[0].price, weight: rows[0].weight };
  }
  return null;
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
export function parseD20pfsrdGearPage(html: string, sourceUrl: string): CatalogDraft {
  let fragment = '';
  try { fragment = decodeURIComponent(new URL(sourceUrl).hash.replace(/^#/, '')).toLowerCase(); }
  catch { fragment = ''; }
  const fragNorm = normAnchor(fragment);
  let item: ItemSection | undefined | null;
  if (isSingleItemUrl(sourceUrl)) {
    item = singlePageSection(html);
    if (!item) throw new Error(`${D20PFSRD_UNSUPPORTED} That page has no gear entry.${HINT}`);
  } else {
    const sections = itemSections(html);
    if (fragment) {
      item = sections.find((s) => s.ids.includes(fragment)) ?? sections.find((s) => s.ids.includes(fragNorm));
      if (!item) throw new Error(`${D20PFSRD_UNSUPPORTED} No item "#${fragment}" on that page.${HINT}`);
    } else if (sections.length === 1) {
      item = sections[0];
    } else if (!sections.length) {
      throw new Error(`${D20PFSRD_UNSUPPORTED} That page has no gear entries.${HINT}`);
    } else {
      throw new Error(`${D20PFSRD_UNSUPPORTED} That page lists ${sections.length} items. Copy the link with the #item anchor for the one you want.${HINT}`);
    }
  }
  // Order: the item's own Price line, its own variant table, then the page-level table row.
  const pageMap = pagePriceMap(html);
  const row = pageTableRow(item, pageMap);
  const pw: PriceWeight = sectionPriceLine(item.html) ?? sectionVariantTable(item.html) ?? row ?? { price: '', weight: 0 };
  const price = pw.price;
  let weight = pw.weight;
  // Own line without a weight: take the table weight only when that row has the same price.
  if (price && !weight && row && row !== pw && row.price === price) weight = row.weight;
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
      cost: price,
      description: clip(desc, 20_000),
    },
  };
}
