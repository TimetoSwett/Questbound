// Turn one d20pfsrd.com mundane gear page into a library draft (PF1e).
// Pure string parsing, like the other d20pfsrd parsers. The caller passes one
// page; nothing is crawled.
//
// Mundane gear pages list many items (one h4 section each). The URL fragment
// (#item-id) picks a single item; without a fragment a multi-item page is
// rejected with a hint to copy the anchored link.

import { htmlToText } from '../aon-spell-parser';
import type { CatalogDraft } from '../aon-catalog-parser';
import { sanitizeSummary, summaryFromDescription } from '../library';

const UNSUPPORTED = 'd20pfsrd import currently supports spells, feats and mundane gear only.';
const HINT = ' Open a goods-and-services page (/equipment/goods-and-services/…) and copy the link with the #item anchor, e.g. …/hunting-camping-survival-gear/#bedroll.';

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const oneLine = (html: string) => htmlToText(html).replace(/\s+/g, ' ').trim();

type ItemSection = { id: string; name: string; html: string };

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
    const id = /<span\b[^>]*\bid=["']([^"']+)["']/i.exec(headHtml)?.[1]
      ?? /<a\b[^>]*\bname=["'](?:TOC-)?([^"']+)["']/i.exec(headHtml)?.[1]
      ?? '';
    const name = oneLine(headHtml);
    if (!name) continue;
    const bodyStart = heads[i].index! + heads[i][0].length;
    const nextH = h.slice(bodyStart).search(/<h[34]\b/i);
    const body = nextH >= 0 ? h.slice(bodyStart, bodyStart + nextH) : h.slice(bodyStart);
    sections.push({ id: id.toLowerCase(), name, html: body });
  }
  return sections;
}

/** Price and weight from a "<b>Price</b> X; <b>Weight</b> Y" paragraph or a variant table. */
function priceWeight(html: string): { price: string; weight: number } {
  let price = '', weight = 0;
  // Variant table first: first data row wins (e.g. Thieves' Tools Common/Concealable/Masterwork).
  const table = /<table\b[^>]*>([\s\S]*?)<\/table>/i.exec(html);
  if (table) {
    const rows = [...table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
      .map((r) => [...r[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => oneLine(c[1])));
    const header = rows[0]?.map((c) => c.toLowerCase()) ?? [];
    const pi = header.findIndex((c) => /price|cost/.test(c));
    const wi = header.findIndex((c) => /weight/.test(c));
    const first = rows.find((r) => r.length > 1 && !/price|cost|weight|type/i.test(r.join(' ')));
    if (first && pi >= 0) price = first[pi] ?? '';
    if (first && wi >= 0) weight = parseWeight(first[wi] ?? '');
    if (price) return { price: clip(price, 120), weight };
  }
  // Plain "<b>Price</b> 1 sp; <b>Weight</b> 5 lbs." paragraph.
  const m = /<b[^>]*>\s*price\s*<\/b>\s*([^<;]+);?\s*(?:<b[^>]*>\s*weight\s*<\/b>\s*([^<]+))?/i.exec(html);
  if (m) {
    price = oneLine(m[1]);
    if (m[2]) weight = parseWeight(oneLine(m[2]));
  }
  return { price: clip(price, 120), weight };
}

/** "5 lbs." -> 5, "1/2 lb." -> 0.5, "—"/"" -> 0. */
function parseWeight(raw: string): number {
  const t = raw.trim().toLowerCase().replace(/[.,\s]+$/, '');
  if (!t || t === '—' || t === '-' || t === '–') return 0;
  const frac = /^(\d+)\s*\/\s*(\d+)/.exec(t);
  if (frac) {
    const v = Number(frac[1]) / Number(frac[2]);
    return Number.isFinite(v) ? Math.min(v, 100_000) : 0;
  }
  const num = Number(t.replace(/[^0-9.]/g, ''));
  return Number.isFinite(num) ? Math.min(num, 100_000) : 0;
}

/** Description: paragraphs and lists after the price line, minus source citations and tables. */
function description(html: string): string {
  // Drop the price paragraph and any variant table (their data is in price/weight already).
  let h = html
    .replace(/<p\b[^>]*>\s*<b[^>]*>\s*price\s*<\/b>[\s\S]*?<\/p>/i, '')
    .replace(/<table\b[\s\S]*?<\/table>/gi, '')
    .replace(/<p\b[^>]*\bclass=["'][^"']*\bsource\b[^"']*["'][\s\S]*?<\/p>/gi, '');
  const parts: string[] = [];
  for (const b of h.matchAll(/<(p|ul|ol)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)) {
    const tag = b[1].toLowerCase();
    const text = tag === 'p' ? htmlToText(b[2]) : htmlToText(b[2].replace(/<li\b[^>]*>/gi, '<li>• '));
    if (text.trim()) parts.push(text.trim());
  }
  return parts.join('\n\n');
}

/** Parse one d20pfsrd mundane gear item into a library create body (not yet schema-checked). */
export function parseD20pfsrdGearPage(html: string, sourceUrl: string): CatalogDraft {
  let fragment = '';
  try { fragment = decodeURIComponent(new URL(sourceUrl).hash.replace(/^#/, '')).toLowerCase(); }
  catch { fragment = ''; }
  const sections = itemSections(html);
  let item: ItemSection | undefined;
  if (fragment) {
    item = sections.find((s) => s.id === fragment || s.id === `toc-${fragment}`);
    if (!item) throw new Error(`${UNSUPPORTED} No item "#${fragment}" on that page.${HINT}`);
  } else if (sections.length === 1) {
    item = sections[0];
  } else if (!sections.length) {
    throw new Error(`${UNSUPPORTED} That page has no gear entries.${HINT}`);
  } else {
    throw new Error(`${UNSUPPORTED} That page lists ${sections.length} items. Copy the link with the #item anchor for the one you want.${HINT}`);
  }
  const { price, weight } = priceWeight(item.html);
  const desc = description(item.html);
  if (!desc) throw new Error(`${UNSUPPORTED} Could not read a description for "${item.name}".${HINT}`);
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
