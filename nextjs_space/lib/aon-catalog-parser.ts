// Turn one Archives of Nethys feat or equipment page into a library draft.
// Pure string parsing. This does not crawl indexes — the caller passes one page.

import { htmlToText } from './aon-spell-parser';
import { sanitizeSummary, summaryFromDescription, type LibraryKind } from './library';

const PAGES: Record<string, LibraryKind> = {
  'featdisplay.aspx': 'feat',
  'equipmentweaponsdisplay.aspx': 'weapon',
  'equipmentarmordisplay.aspx': 'armor',
  'equipmentmiscdisplay.aspx': 'gear',
  'umr.aspx': 'ability',
};

export function catalogKindForUrl(raw: string): LibraryKind | null {
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (url.protocol !== 'https:' || host !== 'aonprd.com') return null;
  const file = url.pathname.split('/').pop()?.toLowerCase() ?? '';
  return PAGES[file] ?? null;
}

function entryHtml(html: string): string {
  const block = /id="MainContent_DataListTypes_LabelName_0">([\s\S]*?)<\/span>/i.exec(html)?.[1];
  if (!block) throw new Error('Could not find an entry on that page. Use a display link, not an index.');
  return block.split(/<h2\b/i)[0];
}

function labeled(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /<b>([^<]+)<\/b>\s*:?\s*([\s\S]*?)(?=<b>|<h\d|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const key = htmlToText(match[1]).replace(/:$/, '').trim().toLowerCase();
    if (key) out[key] = htmlToText(match[2]).replace(/[;\s]+$/, '');
  }
  return out;
}

function pounds(text: string | undefined): number {
  const value = (text ?? '').trim().toLowerCase();
  const fraction = /^(\d+)\s*\/\s*(\d+)/.exec(value);
  if (fraction) return Math.round((Number(fraction[1]) / Number(fraction[2])) * 100) / 100;
  const number = /(\d+(?:\.\d+)?)/.exec(value);
  return number ? Math.min(100_000, Number(number[1])) : 0;
}

function feet(text: string | undefined): number {
  if (!text || !/\d/.test(text)) return 0;
  const number = /(\d+)/.exec(text);
  return number ? Math.min(100_000, Number(number[1])) : 0;
}

function signed(text: string | undefined): number | null {
  if (!text || !/\d/.test(text)) return null;
  const number = /([+−–-]?\d+)/.exec(text.replace(/−/g, '-'));
  return number ? Number(number[1].replace('–', '-')) : null;
}

function mediumDamage(text: string | undefined): string {
  const medium = /(\d+d\d+(?:[/+]\d+d\d+)*)\s*\(medium\)/i.exec(text ?? '');
  if (medium) return medium[1].slice(0, 40);
  const any = /(\d+d\d+)/i.exec(text ?? '');
  return any?.[1] ?? '';
}

function clip(text: string, max: number): string {
  return text.trim().slice(0, max);
}

export type CatalogDraft = {
  kind: LibraryKind;
  name: string;
  summary: string;
  sourceUrl: string;
  data: Record<string, unknown>;
};

/** Parse one supported AoN display page into a library create body (not yet schema-checked). */
export function parseAonCatalogPage(html: string, sourceUrl: string): CatalogDraft {
  const kind = catalogKindForUrl(sourceUrl);
  if (!kind) throw new Error('That link is not a feat, weapon, armor, gear, or universal monster rule page.');
  const block = entryHtml(html);
  const title = htmlToText((/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(block)?.[1] ?? '')).replace(/\s+/g, ' ').trim();
  if (!title) throw new Error('That page has no entry name.');
  const fields = labeled(block);
  const body = clip(htmlToText(block).replace(title, '').trim(), 20_000);
  const description = body || title;
  const summary = summaryFromDescription(description) || sanitizeSummary(title);
  const parenthetical = /\(([^)]+)\)\s*$/.exec(title)?.[1]?.trim() ?? '';
  const bareName = clip(title.replace(/\s*\([^)]+\)\s*$/, '').trim() || title, 120);

  if (kind === 'weapon') {
    const range = feet(fields.range);
    const categoryText = fields.category ?? '';
    const category = /ranged/i.test(categoryText) ? 'ranged' : range > 0 ? 'thrown' : 'melee';
    return {
      kind, name: clip(title, 120), summary, sourceUrl,
      data: {
        category, ability: category === 'ranged' ? 'dex' : 'str', damage: mediumDamage(fields.damage),
        crit: clip(fields.critical ?? '', 40), range, type: clip(fields.type ?? '', 40),
        weight: pounds(fields.weight), cost: clip(fields.cost || fields.price || '', 40), description,
      },
    };
  }
  if (kind === 'armor') {
    const check = signed(fields['armor check penalty']);
    const maxDex = signed(fields['max dex bonus']);
    const failure = signed(fields['arcane spell failure chance']);
    const slot = /shield/i.test(`${title} ${fields.category ?? ''}`) ? 'shield' : 'armor';
    return {
      kind, name: clip(title, 120), summary, sourceUrl,
      data: {
        slot, acBonus: signed(fields['armor bonus']) ?? 0, maxDex, checkPenalty: Math.min(0, check ?? 0),
        spellFailure: Math.max(0, Math.min(100, failure ?? 0)), weight: pounds(fields.weight),
        cost: clip(fields.cost || fields.price || '', 40), description,
      },
    };
  }
  if (kind === 'gear') {
    return {
      kind, name: clip(title, 120), summary, sourceUrl,
      data: { weight: pounds(fields.weight), cost: clip(fields.cost || fields.price || '', 40), description },
    };
  }
  if (kind === 'feat') {
    return {
      kind, name: bareName, summary, sourceUrl,
      data: {
        featType: clip(parenthetical, 80), prerequisites: clip(fields.prerequisites ?? '', 500),
        benefit: clip(fields.benefit ?? '', 4_000), description,
      },
    };
  }
  return { kind, name: clip(title, 120), summary, sourceUrl, data: { description } };
}
