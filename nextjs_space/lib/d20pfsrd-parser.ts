// Turn one d20pfsrd.com spell or feat page into a library draft (PF1e).
// Pure string parsing, like the AoN parsers. The caller passes one page; nothing is crawled.

import { htmlToText, parseLevels, parseSchool } from './aon-spell-parser';
import type { CatalogDraft } from './aon-catalog-parser';
import { sanitizeSummary, summaryFromDescription } from './library';
import { magicItemCategory, parseD20pfsrdMagicItem } from './d20pfsrd/magic-items';
import { weaponPath, parseD20pfsrdWeapon } from './d20pfsrd/weapons';
import { parseD20pfsrdGearPage } from './d20pfsrd/gear';
import { isArmorItemPath, parseD20pfsrdArmor } from './d20pfsrd/armor';

import { D20PFSRD_UNSUPPORTED, HINT } from './d20pfsrd/messages';
// Re-exported: route.ts, the armor/weapon/magic-item parsers and tests import them from here.
export { D20PFSRD_UNSUPPORTED, HINT };

export type D20pfsrdDraft = CatalogDraft & { spellLevels?: Array<{ cls: string; level: number }> };

const HOSTS = new Set(['d20pfsrd.com', 'www.d20pfsrd.com']);

function parseUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && HOSTS.has(u.hostname.toLowerCase()) ? u : null;
  } catch { return null; }
}

export function isD20pfsrdUrl(raw: string): boolean {
  return parseUrl(raw) !== null;
}

/** Spell, feat, and magic item (wondrous/ring/rod/staff) page URLs only; indexes, categories and everything else return null. */
export function d20pfsrdKindForUrl(raw: string): 'spell' | 'feat' | 'gear' | 'weapon' | 'armor' | null {
  const u = parseUrl(raw);
  if (!u) return null;
  const seg = u.pathname.split('/').filter(Boolean).map((s) => s.toLowerCase());
  if (seg[0] === 'magic-items') return magicItemCategory(seg) ? 'gear' : null;
  if (weaponPath(seg)) return 'weapon';
  if (seg[0] === 'equipment' && seg[1] === 'armor') return isArmorItemPath(seg) ? 'armor' : null;
  if (seg[0] === 'magic' && (seg[1] === 'all-spells' || seg[1] === '3rd-party-spells')) return seg.length === 4 ? 'spell' : null;
  if (seg[0] === 'equipment' && seg[1] === 'goods-and-services' && seg.length === 3) return 'gear';
  // 3rd-party goods are one item per page under a publisher: …/3rd-party-goods-and-services/<publisher>/<item>/
  if (seg[0] === 'equipment' && seg[1] === '3rd-party-equipment' && seg[2] === '3rd-party-goods-and-services' && seg.length === 5) return 'gear';
  if (seg[0] === 'feats') {
    if (seg[1] === '3rd-party-feats') return seg.length >= 4 && seg.length <= 5 ? 'feat' : null;
    return seg.length === 3 ? 'feat' : null;
  }
  return null;
}

export const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
export const oneLine = (html: string) => htmlToText(html).replace(/\s+/g, ' ').trim();

export type Block = { tag: string; cls: string; html: string };

/** Remove whole <div class="…match…">…</div> elements, nested divs included. */
function stripDivs(html: string, cls: RegExp): string {
  let out = html;
  for (;;) {
    const open = /<div\b[^>]*\bclass=["']([^"']*)["'][^>]*>/gi;
    let start = -1;
    let m: RegExpExecArray | null;
    while ((m = open.exec(out))) if (cls.test(m[1])) { start = m.index; break; }
    if (start < 0) return out;
    const tag = /<(\/?)div\b[^>]*>/gi;
    tag.lastIndex = start;
    let depth = 0;
    let end = out.length;
    let t: RegExpExecArray | null;
    while ((t = tag.exec(out))) {
      depth += t[1] ? -1 : 1;
      if (depth === 0) { end = t.index + t[0].length; break; }
    }
    out = out.slice(0, start) + out.slice(end);
  }
}

/** The entry's title and the blocks (p / lists / tables / headings) after it, minus chrome and extras. */
function entryBlocks(page: string, kind: 'spell' | 'feat' | 'gear' | 'weapon' | 'armor'): { title: string; blocks: Block[] } {
  let h = page.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, '');
  const start = h.search(/<div\b[^>]*\bid=["']article-content["'][^>]*>/i);
  if (start >= 0) h = h.slice(start);
  const s15 = h.search(/<div\b[^>]*class=["'][^"']*\bsection15\b/i);
  if (s15 >= 0) h = h.slice(0, s15);
  const m = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(h);
  const title = m ? oneLine(m[1]) : '';
  if (!m || !title) throw new Error(`${D20PFSRD_UNSUPPORTED} That page has no entry name.${HINT}`);
  let body = h.slice(m.index + m[0].length)
    .replace(/<div\b[^>]*\bid=["']toc_container["'][\s\S]*?<\/ul>\s*<\/div>/i, '')
    .replace(/<div\b[^>]*shopify[^>]*>[\s\S]*?<\/div>/gi, '');
  // Everything from the first "extra" marker on is dropped: editor's notes, mythic text, and
  // (for spells) any sub-heading, which on d20pfsrd starts a related spell such as "Cure Light Wounds, Mass".
  // Magic items keep text after an editor's note (construction), so notes and FAQ boxes are removed instead of cutting there.
  if (kind === 'gear') body = stripDivs(body, /\b(ed-note-outer|faq)\b/i);
  const cuts = [
    kind === 'gear' ? -1 : body.search(/<div\b[^>]*class=["'][^"']*\bed-note-outer\b/i),
    body.search(/<[a-z][^>]*\b(?:id|name)=["'](?:TOC-)?Mythic[_-]/i),
    body.search(/<h[2-6]\b[^>]*>(?:\s*<[^>]+>)*\s*Mythic\b/i),
    kind !== 'feat' ? body.search(/<h4\b/i) : -1, // a sub-heading starts a related entry (e.g. "Bag of Holding, Minor")
  ].filter((i) => i >= 0);
  if (cuts.length) body = body.slice(0, Math.min(...cuts));
  const blocks: Block[] = [];
  for (const b of body.matchAll(/<(p|ul|ol|table|h[2-6])\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi)) {
    blocks.push({ tag: b[1].toLowerCase(), cls: /class=["']([^"']*)["']/i.exec(b[2])?.[1] ?? '', html: b[3] });
  }
  return { title, blocks };
}

export function blockText(b: Block): string {
  if (b.tag === 'table') {
    const rows = [...b.html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) => [...r[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => oneLine(c[1])).join(' | '));
    const caption = oneLine(/<caption\b[^>]*>([\s\S]*?)<\/caption>/i.exec(b.html)?.[1] ?? '');
    return [caption, ...rows].filter(Boolean).join('\n');
  }
  if (b.tag === 'ul' || b.tag === 'ol') return htmlToText(b.html.replace(/<li\b[^>]*>/gi, '<li>• '));
  return htmlToText(b.html);
}

export const isSkippable = (b: Block) => /\b(divider|toc_title)\b/.test(b.cls);

/** Leading <b>/<strong> label of a paragraph and the rest of it as text. */
function leadingLabel(html: string): { label: string; value: string } | null {
  const m = /^\s*<(b|strong)\b[^>]*>([\s\S]*?)<\/\1>([\s\S]*)$/i.exec(html);
  if (!m) return null;
  const label = oneLine(m[2]).replace(/[:\s]+$/, '');
  if (!label || label.length > 40) return null;
  return { label, value: htmlToText(m[3]).replace(/^[:\s]+/, '').trim() };
}

function parseSpell(title: string, blocks: Block[], sourceUrl: string): D20pfsrdDraft {
  const fields = new Map<string, string>();
  const order: string[] = [];
  const stats = blocks.filter((b) => b.tag === 'p' && !isSkippable(b));
  let descFrom = blocks.findIndex((b) => isSkippable(b) && /^description$/i.test(oneLine(b.html)));
  if (descFrom < 0) {
    // No DESCRIPTION divider: the description is whatever follows the last labeled paragraph.
    let last = -1;
    blocks.forEach((b, i) => { if (b.tag === 'p' && !isSkippable(b) && leadingLabel(b.html)) last = i; });
    descFrom = last;
  }
  for (const b of stats) {
    if (blocks.indexOf(b) > descFrom && descFrom >= 0) break;
    for (const m of b.html.matchAll(/<(b|strong)\b[^>]*>([\s\S]*?)<\/\1>([\s\S]*?)(?=<(?:b|strong)\b|$)/gi)) {
      const label = oneLine(m[2]).replace(/[:\s]+$/, '');
      const value = oneLine(m[3]).replace(/^[:\s]+/, '').replace(/[;\s]+$/, '');
      if (!label || fields.has(label.toLowerCase())) continue;
      fields.set(label.toLowerCase(), value);
      order.push(label);
    }
  }
  const f = (k: string) => fields.get(k) ?? '';
  if (!f('school') || !f('level')) throw new Error(`${D20PFSRD_UNSUPPORTED} That page has no spell School and Level.${HINT}`);
  const { school, subschool, descriptors } = parseSchool(f('school'));
  if (!school) throw new Error(`${D20PFSRD_UNSUPPORTED} That page has no spell School and Level.${HINT}`);
  const ate = order
    .filter((l) => /^(area|target|targets|effect)\b/i.test(l) || /^(target|area|effect)\s+or\b/i.test(l))
    .map((l) => `${l[0].toUpperCase()}${l.slice(1)}: ${f(l.toLowerCase())}`).join('; ');
  const description = blocks.slice(descFrom + 1)
    .filter((b) => !isSkippable(b)).map(blockText).filter(Boolean).join('\n\n');
  const name = clip(title.replace(/\s+/g, ' ').trim(), 120);
  return {
    kind: 'spell', name,
    summary: summaryFromDescription(description) || sanitizeSummary(name),
    sourceUrl,
    data: {
      school: clip(school, 40), subschool: clip(subschool, 60), descriptors: descriptors.map((d) => clip(d, 40)),
      castingTime: clip(f('casting time'), 100), components: clip(f('components'), 300), range: clip(f('range'), 150),
      areaTargetEffect: clip(ate, 400), duration: clip(f('duration'), 150), savingThrow: clip(f('saving throw'), 200),
      spellResistance: clip(f('spell resistance'), 100), description: clip(description, 20_000),
    },
    spellLevels: parseLevels(f('level')).slice(0, 40),
  };
}

function parseFeat(title: string, blocks: Block[], sourceUrl: string): D20pfsrdDraft {
  const sections: Array<{ key: string; label: string; parts: string[] }> = [];
  let flavor = '';
  const pre: string[] = [];
  for (const b of blocks) {
    if (isSkippable(b)) continue;
    const text = blockText(b);
    if (!text) continue;
    if (b.tag === 'p' && /\bdescription\b/.test(b.cls) && !flavor && !sections.length) { flavor = oneLine(text); continue; }
    const lab = b.tag === 'p' ? leadingLabel(b.html) : null;
    if (lab) {
      const bare = lab.label.replace(/\(s\)/gi, '').trim();
      const key = /^prerequisites?$/i.test(bare) ? 'prerequisites' : /^benefits?$/i.test(bare) ? 'benefit' : bare.toLowerCase();
      const label = key === 'prerequisites' ? 'Prerequisites' : key === 'benefit' ? 'Benefit' : bare;
      sections.push({ key, label, parts: lab.value ? [lab.value] : [] });
    } else if (sections.length) sections[sections.length - 1].parts.push(text);
    else if (!flavor) flavor = oneLine(text);
    else pre.push(text);
  }
  const benefit = sections.find((s) => s.key === 'benefit')?.parts.join('\n\n') ?? '';
  if (!benefit) throw new Error(`${D20PFSRD_UNSUPPORTED} That page has no feat Benefit.${HINT}`);
  const prerequisites = (sections.find((s) => s.key === 'prerequisites')?.parts.join(' ') ?? '').replace(/[.\s]+$/, '');
  const description = [
    flavor, ...pre,
    ...sections.map((s) => `${s.label}: ${s.key === 'prerequisites' ? prerequisites : s.parts.join('\n\n')}`),
  ].filter(Boolean).join('\n\n');
  const clean = title.replace(/\s+/g, ' ').trim();
  const featType = /\(([^)]+)\)\s*$/.exec(clean)?.[1]?.trim() ?? '';
  const name = clip(clean.replace(/\s*\([^)]+\)\s*$/, '').trim() || clean, 120);
  return {
    kind: 'feat', name,
    summary: flavor ? sanitizeSummary(flavor) : summaryFromDescription(benefit) || sanitizeSummary(name),
    sourceUrl,
    data: {
      featType: clip(featType, 80), prerequisites: clip(prerequisites, 500), benefit: clip(benefit, 4_000), description: clip(description, 20_000),
    },
  };
}

/** Parse one d20pfsrd spell, feat, or magic item page into a library create body (not yet schema-checked). */
export function parseD20pfsrdPage(html: string, sourceUrl: string, indexPages: string[] = []): D20pfsrdDraft {
  const kind = d20pfsrdKindForUrl(sourceUrl);
  if (!kind) throw new Error(`${D20PFSRD_UNSUPPORTED}${HINT}`);
  // Mundane gear pages are split into h4 item sections by the gear parser itself.
  const gearPath = new URL(sourceUrl).pathname.toLowerCase();
  if (kind === 'gear' && (gearPath.startsWith('/equipment/goods-and-services/') || gearPath.startsWith('/equipment/3rd-party-equipment/3rd-party-goods-and-services/'))) {
    return parseD20pfsrdGearPage(html, sourceUrl);
  }
  const { title, blocks } = entryBlocks(html, kind);
  if (kind === 'gear') return parseD20pfsrdMagicItem(title, blocks, sourceUrl);
  if (kind === 'weapon') return parseD20pfsrdWeapon(title, blocks, sourceUrl);
  if (kind === 'armor') return parseD20pfsrdArmor(title, blocks, sourceUrl, indexPages);
  return kind === 'spell' ? parseSpell(title, blocks, sourceUrl) : parseFeat(title, blocks, sourceUrl);
}
