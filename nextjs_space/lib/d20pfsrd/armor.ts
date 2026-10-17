// d20pfsrd.com mundane armor and shields (core and 3rd party), imported into the 'armor' library kind.
// Magic armor (/magic-items/magic-armor/...) stays rejected.
// Body armor pages carry their own stat block; shield pages borrow their row from an index table.
// Circular import with ../d20pfsrd-parser is safe: neither module uses the other's bindings at module top level.

import { sanitizeSummary, summaryFromDescription } from '../library';
import { D20PFSRD_UNSUPPORTED, HINT, blockText, clip, isD20pfsrdUrl, isSkippable, oneLine } from '../d20pfsrd-parser';
import type { Block, D20pfsrdDraft } from '../d20pfsrd-parser';

export const D20PFSRD_ARMOR_INDEXES = ['https://www.d20pfsrd.com/equipment/armor/', 'https://www.d20pfsrd.com/equipment/3rd-party-equipment/3rd-party-armor-shields/'];

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** True for exactly ['equipment', 'armor', <slug>] item pages; the armor index and nested paths are false. */
export function isArmorItemPath(seg: string[]): boolean {
  return seg.length === 3 && seg[0] === 'equipment' && seg[1] === 'armor' && SLUG.test(seg[2]) && seg[2] !== 'armor' && seg[2] !== 'armor-modifications';
}

export function isD20pfsrdArmorUrl(raw: string): boolean {
  if (!isD20pfsrdUrl(raw)) return false;
  return isArmorItemPath(new URL(raw).pathname.split('/').filter(Boolean).map((s) => s.toLowerCase()));
}

export function armorSlug(url: string): string {
  const seg = new URL(url).pathname.split('/').filter(Boolean);
  return (seg[seg.length - 1] ?? '').toLowerCase();
}

/** Bold labels of a paragraph, normalised: one line, lowercased, colon stripped. */
function boldLabels(html: string): Array<{ label: string; value: string }> {
  const out: Array<{ label: string; value: string }> = [];
  for (const m of html.matchAll(/<(b|strong)\b[^>]*>([\s\S]*?)<\/\1>([\s\S]*?)(?=<(?:b|strong)\b|$)/gi)) {
    const label = oneLine(m[2]).replace(/[:\s]+$/, '').toLowerCase();
    if (label) out.push({ label, value: oneLine(m[3]).replace(/^[:\s]+/, '').replace(/[;\s]+$/, '') });
  }
  return out;
}

/** A page has a stat block when a paragraph carries a bold Armor Bonus / Shield Bonus label. */
export function hasArmorStatBlock(blocks: Block[]): boolean {
  return blocks.some((b) => b.tag === 'p' && !isSkippable(b) && boldLabels(b.html).some((l) => l.label === 'armor bonus' || l.label === 'shield bonus'));
}

const cleanCell = (html: string) => oneLine(html.replace(/<sup\b[\s\S]*?<\/sup>/gi, ''));

/** Signed int with +, -, en dash and minus sign; — / - / empty means null. */
function signedInt(text: string): number | null {
  const v = cleanCell(text).replace(/[–−]/g, '-').trim();
  if (!v || v === '—' || v === '-') return null;
  const m = /[+-]?\d+/.exec(v);
  return m ? Number(m[0]) : null;
}

const intOr = (text: string, fallback: number) => signedInt(text) ?? fallback;

function pounds(text: string): number {
  const v = cleanCell(text).toLowerCase();
  const fraction = /^(\d+)\s*\/\s*(\d+)/.exec(v);
  if (fraction) return Number(fraction[2]) ? Math.round((Number(fraction[1]) / Number(fraction[2])) * 100) / 100 : 0;
  const n = /(\d+(?:\.\d+)?)/.exec(v);
  return n ? Math.min(100_000, Number(n[1])) : 0;
}

const titleCase = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

const SECTION_CATEGORIES: Record<string, string> = {
  'light-armors': 'Light Armor', 'medium-armors': 'Medium Armor', 'heavy-armors': 'Heavy Armor',
  'shields': 'Shield', 'exotic-armors': 'Exotic Armor', 'exotic-shields': 'Exotic Shield', extras: 'Extras',
};
const SECTION_ANCHOR = /<a\s+name=["'](light-armors|medium-armors|heavy-armors|shields|exotic-armors|exotic-shields)["']/i;

/** All index rows whose first cell links to this slug, with their section's category label. */
function armorRows(indexHtml: string, slug: string): Array<{ category: string; cells: string[] }> {
  const out: Array<{ category: string; cells: string[] }> = [];
  let section = '';
  for (const r of indexHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row = r[1];
    const anchor = SECTION_ANCHOR.exec(row);
    if (anchor) { section = anchor[1].toLowerCase(); continue; }
    const cells = [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => c[1]);
    if (cells.length && !cells.some((c) => /<td\b/i.test(c)) && /^extras$/i.test(oneLine(row))) { section = 'extras'; continue; }
    if (cells.length < 10) continue;
    const href = /<a\b[^>]*\bhref=["']([^"']*)["']/i.exec(cells[0])?.[1] ?? '';
    const hrefSlug = (href.split('/').filter(Boolean).pop() ?? '').toLowerCase();
    if (hrefSlug !== slug || section === 'extras') continue; // Extras (spikes, bosses, locked gauntlets) are add-ons, not armor or shields.
    out.push({ category: SECTION_CATEGORIES[section] ?? 'Armor', cells });
  }
  return out;
}

export type ArmorRow = { name: string; category: string; cost: string; acBonus: number; maxDex: number | null; checkPenalty: number; spellFailure: number; speed: string; weight: number; source: string };

/** The index row for this armor page, if any index links to it. `name` is set only when several rows share the slug. */
export function parseArmorTableRow(indexHtml: string, sourceUrl: string, variant?: string): ArmorRow | null {
  const rows = armorRows(indexHtml, armorSlug(sourceUrl));
  if (!rows.length) return null;
  const names = rows.map((r) => oneLine(r.cells[0]));
  const lower = names.map((n) => n.toLowerCase());
  let i = variant ? lower.findIndex((n) => n.includes(variant)) : -1;
  if (i < 0) i = lower.findIndex((n) => n.includes('steel'));
  if (i < 0) i = 0;
  const rowName = names[i];
  const cells = rows[i].cells;
  const speed30 = cleanCell(cells[6]) || '—';
  const speed20 = cleanCell(cells[7]) || '—';
  return {
    name: rows.length > 1 ? titleCase(rowName) : '',
    category: rows[i].category,
    cost: clip(cleanCell(cells[1]), 120),
    acBonus: intOr(cells[2], 0),
    maxDex: signedInt(cells[3]),
    checkPenalty: Math.min(0, intOr(cells[4], 0)),
    spellFailure: Math.min(100, Math.max(0, intOr(cells[5], 0))),
    speed: speed30 === '—' && speed20 === '—' ? '' : `${speed30}/${speed20}`,
    weight: pounds(cells[8]),
    source: cleanCell(cells[9]),
  };
}

export function parseD20pfsrdArmor(title: string, blocks: Block[], sourceUrl: string, indexPages: string[] = []): D20pfsrdDraft {
  const statIndex = blocks.findIndex((b) => b.tag === 'p' && !isSkippable(b) && boldLabels(b.html).some((l) => l.label === 'armor bonus' || l.label === 'shield bonus'));
  let name = title.replace(/\s+/g, ' ').trim();
  let category = '';
  let cost = '';
  let acBonus = 0;
  let maxDex: number | null = null;
  let checkPenalty = 0;
  let spellFailure = 0;
  let speed = '';
  let weight = 0;
  let source = '';
  let haveStats = false;
  let fromRow = false;

  if (statIndex >= 0) {
    haveStats = true;
    const labels = boldLabels(blocks[statIndex].html);
    category = labels[0]?.label.replace(/\b\w/g, (c) => c.toUpperCase()) ?? '';
    const f = (k: string) => labels.find((l) => l.label === k)?.value ?? '';
    cost = clip(f('cost'), 120);
    weight = pounds(f('weight'));
    acBonus = intOr(f('armor bonus') || f('shield bonus'), 0);
    maxDex = signedInt(f('max dex bonus'));
    checkPenalty = Math.min(0, intOr(f('armor check penalty'), 0));
    spellFailure = Math.min(100, Math.max(0, intOr(f('arcane spell failure chance'), 0)));
    speed = f('speed').replace(/\.+$/, '');
  } else {
    const variant = new URL(sourceUrl).hash.replace(/^#/, '').toLowerCase() || undefined;
    let row: ArmorRow | null = null;
    for (const page of indexPages) {
      row = parseArmorTableRow(page, sourceUrl, variant);
      if (row) break;
    }
    if (row) {
      haveStats = true;
      fromRow = true;
      if (row.name) name = row.name;
      category = row.category;
      cost = row.cost;
      acBonus = row.acBonus;
      maxDex = row.maxDex;
      checkPenalty = row.checkPenalty;
      spellFailure = row.spellFailure;
      speed = row.speed;
      weight = row.weight;
      source = row.source;
    }
  }
  if (!haveStats) throw new Error(`${D20PFSRD_UNSUPPORTED} That page has no armor or shield stats.${HINT}`);

  const prose = blocks
    .filter((b, i) => i !== statIndex && !isSkippable(b))
    .map(blockText).filter(Boolean).join('\n\n');
  const lead = fromRow
    ? [category && `${category}.`, speed && `Speed ${speed}.`, source && `Source ${source}.`].filter(Boolean).join(' ')
    : [category && `${category}.`, speed && `Speed ${speed}.`].filter(Boolean).join(' ');
  const description = clip([lead, prose].filter(Boolean).join('\n\n'), 20_000);
  const slot = /shield/i.test(category) || /shield/i.test(name) ? 'shield' : 'armor';
  return {
    kind: 'armor', name: clip(name, 120),
    summary: summaryFromDescription(prose) || sanitizeSummary(name),
    sourceUrl,
    data: { slot, acBonus, maxDex, checkPenalty, spellFailure, weight, cost, description },
  };
}

/** Index pages needed for this armor page: [] unless it is an armor URL without its own stat block. */
export async function d20pfsrdArmorIndexPages(sourceUrl: string, pageHtml: string, fetchHtml: (url: string) => Promise<{ html: string }>): Promise<string[]> {
  if (!isD20pfsrdArmorUrl(sourceUrl)) return [];
  if (/<(b|strong)\b[^>]*>(?:(?!<\/\1>)[\s\S])*(?:Armor|Shield) Bonus\s*<\/\1>/i.test(pageHtml)) return [];
  const out: string[] = [];
  for (const url of D20PFSRD_ARMOR_INDEXES) {
    const { html } = await fetchHtml(url);
    out.push(html);
    if (parseArmorTableRow(html, sourceUrl)) break;
  }
  return out;
}
