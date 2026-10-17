// Turn one d20pfsrd.com mundane gear page into a library draft (PF1e).
// Pure string parsing, like the other d20pfsrd parsers. The caller passes one
// page; nothing is crawled.
//
// Mundane gear pages list many items (one h4 section each). The URL fragment
// (#item-id) picks a single item; without a fragment a multi-item page is
// rejected with a hint to copy the anchored link.
//
// Prices/weights live in page-level tables at the top AND/OR in the item's
// own Price/Weight line. The explicit Price line in the item section wins;
// the page table is the fallback. If neither yields a price nor a weight,
// the import throws instead of silently importing blanks.

import { htmlToText } from '../aon-spell-parser';
import type { CatalogDraft } from '../aon-catalog-parser';
import { sanitizeSummary, summaryFromDescription } from '../library';
import { D20PFSRD_UNSUPPORTED } from '../d20pfsrd-parser';

const HINT = ' Open a goods-and-services page (/equipment/goods-and-services/…) and copy the link with the #item anchor, e.g. …/hunting-camping-survival-gear/#bedroll.';

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const oneLine = (html: string) => htmlToText(html).replace(/\s+/g, ' ').trim();

type ItemSection = { ids: string[]; name: string; html: string };
type PriceEntry = { price: string; weight: number };

/** Normalize an anchor for matching: lowercase, strip leading toc-, decode entities. */
function normAnchor(s: string): string {
  return s.toLowerCase().replace(/^toc-/, '').replace(/&#?\w+;/g, '').trim();
}

/** All anchor ids for an h4 heading: span id, a name, and normalized forms. */
function headingIds(headHtml: string): string[] {
  const ids = new Set<string>();
  for (const m of headHtml.matchAll(/<span\b[^>]*\bid=["']([^"']+)["']/gi)) ids.add(m[1].toLowerCase());
  for (const m of headHtml.matchAll(/<a\b[^>]*\bname=["']([^"']+)["']/gi)) ids.add(m[1].toLowerCase());
  for (const id of [...ids]) ids.add(normAnchor(id));
  return [...ids];
}

/** Split the article into h4 item sections (name + body until the next h3/h4). */
function itemSections(page: string): ItemSection[] {
  let h = page.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, '');
  const start = h.search(/<div\b[^>]*\bid=["']article-content["'][^>]*>/i);
  if (start >= 0) h = h.slice(start);
  const s15 = h.search(/<div\b[^>]*class=["'][^"']*\bsection15\b/i);
  if (s15 >= 0) h = h.slice(0, s15);
  const sections: ItemSection[] = [];
  const heads = [...h.matchAll(/<h4\b[^>]*>([\s\S]*?)<\/h4>/gi)];
  for (let i = 0; i < heads.length; i++) {
    const headHtml = heads[i][1];
    const name = oneLine(headHtml);
    if (!name) continue;
    const bodyStart = heads[i].index! + heads[i][0].length;
    const nextH = h.slice(bodyStart).search(/<h[34]\b/i);
    const body = nextH >= 0 ? h.slice(bodyStart, bodyStart + nextH) : h.slice(bodyStart);
    sections.push({ ids: headingIds(headHtml), name, html: body });
  }
  return sections;
}

/** Cells of a table row as {text, html, link}. */
function rowCells(rowHtml: string): Array<{ text: string; html: string; link: string }> {
  return [...rowHtml.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => ({
    text: oneLine(c[1]),
    html: c[1],
    link: /href=["']#([^"']+)["']/i.exec(c[1])?.[1] ?? '',
  }));
}

/**
 * Build a page-wide anchor -> (price, weight) map from all tables.
 * Header = first row containing both an item-like cell and a price-like cell
 * (skips group rows like "Comfort and Shelter"). Data rows are matched by
 * their #anchor link; rows without anchors are indexed by normalized name.
 */
function pagePriceMap(page: string): Map<string, PriceEntry> {
  const map = new Map<string, PriceEntry>();
  let h = page.replace(/<!--[\s\S]*?-->/g, '');
  const start = h.search(/<div\b[^>]*\bid=["']article-content["'][^>]*>/i);
  if (start >= 0) h = h.slice(start);
  for (const tm of h.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const rows = [...tm[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) => rowCells(r[1]));
    if (!rows.length) continue;
    // Header = first row with a price/cost cell AND a non-price cell (item name).
    let hi = -1, pi = -1, wi = -1;
    for (let i = 0; i < rows.length; i++) {
      const cells = rows[i].map((c) => c.text.toLowerCase());
      const p = cells.findIndex((c) => /^(price|cost)$/.test(c));
      const w = cells.findIndex((c) => /^weight$/.test(c));
      const hasItem = cells.some((c) => c && !/^(price|cost|weight|source|type)$/.test(c));
      if (p >= 0 && hasItem) { hi = i; pi = p; wi = w; break; }
    }
    if (hi < 0) continue;
    for (let i = hi + 1; i < rows.length; i++) {
      const cells = rows[i];
      if (!cells.length || pi >= cells.length) continue;
      const priceRaw = cells[pi].text;
      if (/^(price|cost|weight)$/i.test(priceRaw)) continue; // sub-header row
      const price = parsePrice(priceRaw);
      const weight = wi >= 0 && wi < cells.length ? parseWeight(cells[wi].text) : 0;
      if (!price && !weight) continue;
      const entry: PriceEntry = { price, weight };
      // Index by anchor link first, then by normalized item name.
      const link = cells[0].link || cells.find((c) => c.link)?.link || '';
      if (link) map.set(normAnchor(link), entry);
      const name = normAnchor(cells[0].text);
      if (name && !map.has(name)) map.set(name, entry);
    }
  }
  return map;
}

/** "—"/"-"/"–" -> '' (no price); otherwise trimmed text. */
function parsePrice(raw: string): string {
  const t = raw.trim();
  if (!t || t === '—' || t === '-' || t === '–' || /^—+$/.test(t)) return '';
  return clip(t, 120);
}

/**
 * "5 lbs." -> 5, "1/2 lb." -> 0.5, "1-1/2 lbs." -> 1.5, "½ lb." -> 0.5,
 * "2½" -> 2.5, "1 lb. per 10 ft." -> 1, "—"/"" -> 0. Footnote digits stripped.
 */
function parseWeight(raw: string): number {
  let t = raw.trim().toLowerCase();
  // Strip "per ..." phrases and footnote markers (trailing digits after unit).
  t = t.replace(/\s+per\s+.*$/, '').replace(/(\blbs?\.?)\d+$/, '$1');
  t = t.replace(/[.,\s]+$/, '');
  if (!t || t === '—' || t === '-' || t === '–') return 0;
  // Unicode fractions.
  const uni: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };
  let m = /^(\d+)?\s*([½¼¾⅓⅔])/.exec(t);
  if (m) return Math.min((Number(m[1] || 0) + uni[m[2]]), 100_000);
  // "1-1/2" or "1 1/2".
  m = /^(\d+)\s*[-\s]\s*(\d+)\s*\/\s*(\d+)/.exec(t);
  if (m) {
    const v = Number(m[1]) + Number(m[2]) / Number(m[3]);
    return Number.isFinite(v) ? Math.min(v, 100_000) : 0;
  }
  // "1/2".
  m = /^(\d+)\s*\/\s*(\d+)/.exec(t);
  if (m) {
    const v = Number(m[1]) / Number(m[2]);
    return Number.isFinite(v) ? Math.min(v, 100_000) : 0;
  }
  const num = Number(t.replace(/[^0-9.]/g, ''));
  return Number.isFinite(num) ? Math.min(num, 100_000) : 0;
}

/**
 * Price and weight from the item's own section.
 * The explicit Price/Cost line wins over any table. Supports <b> and <strong>,
 * "Price" or "Cost" labels, and Weight appearing after other fields (Slot etc).
 */
function sectionPriceWeight(html: string): { price: string; weight: number; found: boolean } {
  // Explicit "<b>Price</b> 5 gp" or "<strong>Cost</strong> 5 gp" line.
  const m = /<(b|strong)[^>]*>\s*(price|cost)\s*<\/\1>\s*:?\s*([^<]+?)(?=<\s*(b|strong)\b|;?\s*$)/i.exec(html);
  if (m) {
    const price = parsePrice(oneLine(m[3]));
    // Weight may follow after other fields: find the Weight label after the price.
    const after = html.slice(m.index + m[0].length);
    const wm = /<(b|strong)[^>]*>\s*weight\s*<\/\1>\s*:?\s*([^<;]+)/i.exec(html.slice(0, m.index + m[0].length + 500));
    const weight = wm ? parseWeight(oneLine(wm[2])) : 0;
    void after;
    return { price, weight, found: true };
  }
  return { price: '', weight: 0, found: false };
}

/** Description: paragraphs and lists, minus source citations, labels, and price tables. */
function description(html: string, itemName: string): string {
  let h = html
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
  void itemName;
  return parts.join('\n\n');
}

/** Parse one d20pfsrd mundane gear item into a library create body (not yet schema-checked). */
export function parseD20pfsrdGearPage(html: string, sourceUrl: string): CatalogDraft {
  let fragment = '';
  try { fragment = decodeURIComponent(new URL(sourceUrl).hash.replace(/^#/, '')).toLowerCase(); }
  catch { fragment = ''; }
  const fragNorm = normAnchor(fragment);
  const sections = itemSections(html);
  let item: ItemSection | undefined;
  if (fragment) {
    item = sections.find((s) => s.ids.includes(fragment) || s.ids.includes(fragNorm) || s.ids.includes(`toc-${fragNorm}`));
    if (!item) throw new Error(`${D20PFSRD_UNSUPPORTED} No item "#${fragment}" on that page.${HINT}`);
  } else if (sections.length === 1) {
    item = sections[0];
  } else if (!sections.length) {
    throw new Error(`${D20PFSRD_UNSUPPORTED} That page has no gear entries.${HINT}`);
  } else {
    throw new Error(`${D20PFSRD_UNSUPPORTED} That page lists ${sections.length} items. Copy the link with the #item anchor for the one you want.${HINT}`);
  }
  // Explicit Price line in the section wins; page table is the fallback.
  const own = sectionPriceWeight(item.html);
  const pageMap = pagePriceMap(html);
  let price = own.price, weight = own.weight;
  if (!price && !weight) {
    const key = item.ids.map(normAnchor).find((k) => pageMap.has(k));
    const fb = key ? pageMap.get(key)! : pageMap.get(normAnchor(item.name));
    if (fb) { price = fb.price; weight = fb.weight; }
  }
  if (!price && !weight) {
    throw new Error(`${D20PFSRD_UNSUPPORTED} Could not read a price or weight for "${item.name}".${HINT}`);
  }
  const desc = description(item.html, item.name);
  if (!desc) throw new Error(`${D20PFSRD_UNSUPPORTED} Could not read a description for "${item.name}".${HINT}`);
  const name = clip(item.name, 120);
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
