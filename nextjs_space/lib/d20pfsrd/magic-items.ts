// d20pfsrd.com magic items: wondrous items, rings, rods, staves, specific magic
// weapons, specific magic armor/shields, and potions (core and 3rd party).
// Circular import with ../d20pfsrd-parser is safe: neither module uses the other's bindings at module top level.

import { GEAR_SLOTS, sanitizeSummary, summaryFromDescription } from '../library';
import { D20PFSRD_UNSUPPORTED, HINT, blockText, clip, isSkippable, oneLine } from '../d20pfsrd-parser';
import type { Block, D20pfsrdDraft } from '../d20pfsrd-parser';

type MagicItemCategory = 'wondrous' | 'ring' | 'rod' | 'staff' | 'magic-weapon' | 'magic-armor' | 'magic-shield' | 'potion';
const CATEGORIES: Record<string, MagicItemCategory> = { 'wondrous-items': 'wondrous', rings: 'ring', rods: 'rod', staves: 'staff' };

/** Magic item category of a lowercase path (core or 3rd party), else null. */
export function magicItemCategory(seg: string[]): MagicItemCategory | null {
  if (seg[0] !== 'magic-items') return null;
  if (seg[1] === 'wondrous-items') return seg.length === 4 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(seg[2]) ? 'wondrous' : null;
  if (seg[1] === 'rods' && seg[2] === 'metamagic-rods') return isMetamagicRodPath(seg) ? 'rod' : null;
  if (seg[1] === 'rings' || seg[1] === 'rods' || seg[1] === 'staves') return seg.length === 3 ? CATEGORIES[seg[1]] : null;
  // Specific magic weapons: /magic-items/magic-weapons/specific-magic-weapons/<name>/
  if (seg[1] === 'magic-weapons' && seg[2] === 'specific-magic-weapons') {
    return seg.length === 4 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(seg[3]) ? 'magic-weapon' : null;
  }
  // Specific magic armor/shields: /magic-items/magic-armor/specific-magic-armor/<name>/
  // or /magic-items/magic-armor/specific-magic-shields/<name>/
  if (seg[1] === 'magic-armor' && seg[2] === 'specific-magic-armor') {
    return seg.length === 4 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(seg[3]) ? 'magic-armor' : null;
  }
  if (seg[1] === 'magic-armor' && seg[2] === 'specific-magic-shields') {
    return seg.length === 4 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(seg[3]) ? 'magic-shield' : null;
  }
  // Potions: /magic-items/potions/other-potions/<name>/
  if (seg[1] === 'potions' && seg[2] === 'other-potions') {
    return seg.length === 4 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(seg[3]) ? 'potion' : null;
  }
  if (seg[1] === '3rd-party-magic-items') {
    const m = /^3rd-party-(wondrous-items|rings|rods|staves)$/.exec(seg[2] ?? '');
    return m && seg.length === 5 ? CATEGORIES[m[1]] : null;
  }
  return null;
}

/** /magic-items/rods/metamagic-rods/<rod>/ (the 3-segment index is not an item page). */
export function isMetamagicRodPath(seg: string[]): boolean {
  return seg.length === 4 && seg[0] === 'magic-items' && seg[1] === 'rods' && seg[2] === 'metamagic-rods' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(seg[3]);
}

export function isMetamagicRodUrl(raw: string): boolean {
  try { return isMetamagicRodPath(new URL(raw).pathname.split('/').filter(Boolean).map((s) => s.toLowerCase())); } catch { return false; }
}

const SLOT_ALIASES: Record<string, string> = { none: 'slotless', '—': 'slotless', '–': 'slotless', '-': 'slotless', 'no slot': 'slotless', rings: 'ring', shoulder: 'shoulders', wrist: 'wrists', hand: 'hands' };

function pounds(text: string): number {
  const v = text.trim().toLowerCase();
  const fraction = /^(\d+)\s*\/\s*(\d+)/.exec(v);
  if (fraction) return Number(fraction[2]) ? Math.round((Number(fraction[1]) / Number(fraction[2])) * 100) / 100 : 0;
  const n = /(\d+(?:\.\d+)?)/.exec(v);
  return n ? Math.min(100_000, Number(n[1])) : 0;
}

export function parseD20pfsrdMagicItem(title: string, blocks: Block[], sourceUrl: string): D20pfsrdDraft {
  const category = magicItemCategory(new URL(sourceUrl).pathname.split('/').filter(Boolean).map((s) => s.toLowerCase()));
  const isDivider = (b: Block, re: RegExp) => /\bdivider\b/.test(b.cls) && re.test(oneLine(b.html));
  const descFrom = blocks.findIndex((b) => isDivider(b, /^description$/i));
  if (descFrom < 0) throw new Error(`${D20PFSRD_UNSUPPORTED} That page has no magic item DESCRIPTION.${HINT}`);
  const fields = new Map<string, string>();
  for (const b of blocks.slice(0, descFrom)) {
    if (b.tag !== 'p' || isSkippable(b)) continue;
    for (const m of b.html.matchAll(/<(b|strong)\b[^>]*>([\s\S]*?)<\/\1>([\s\S]*?)(?=<(?:b|strong)\b|$)/gi)) {
      const label = oneLine(m[2]).replace(/[:\s]+$/, '').toLowerCase();
      const value = oneLine(m[3]).replace(/^[:\s]+/, '').replace(/[;\s]+$/, '');
      if (label && !fields.has(label)) fields.set(label, value);
    }
  }
  const f = (k: string) => fields.get(k) ?? '';
  const levelLabel = fields.has('cl') ? 'CL' : 'ML';
  const level = f('cl') || f('ml');
  if (!((f('aura') && level) || (fields.has('price') && fields.has('slot')))) {
    throw new Error(`${D20PFSRD_UNSUPPORTED} That page has no magic item Aura/CL (or Price and Slot) line.${HINT}`);
  }

  const consFrom = blocks.findIndex((b, i) => i > descFrom && isDivider(b, /^construction\b/i));
  const prose = blocks.slice(descFrom + 1, consFrom < 0 ? undefined : consFrom)
    .filter((b) => !/\btoc_title\b/.test(b.cls)).map(blockText).filter(Boolean).join('\n\n');
  const construction = consFrom < 0 ? '' : blocks.slice(consFrom + 1).filter((b) => !isSkippable(b)).map(blockText).filter(Boolean).join('\n');
  if (!prose) throw new Error(`${D20PFSRD_UNSUPPORTED} That page has no magic item DESCRIPTION.${HINT}`);

  const rawSlot = f('slot').toLowerCase().replace(/[;:,.!?]+$/, '').trim();
  let slot = SLOT_ALIASES[rawSlot] ?? rawSlot;
  if (!GEAR_SLOTS.some((v) => v === slot)) {
    slot = category === 'ring' ? 'ring'
      : category === 'rod' || category === 'staff' || category === 'magic-weapon' || category === 'potion' ? 'slotless'
      : category === 'magic-armor' ? 'armor'
      : category === 'magic-shield' ? 'shield'
      : '';
  }
  const auraRaw = clip(f('aura'), 80).replace(/[;\s]+$/, '');
  // Non-magical special materials list "no aura (non-magical)" — omit the aura.
  const aura = /no aura/i.test(auraRaw) ? '' : auraRaw;
  const clMatch = /\d+/.exec(level);
  const cl = clMatch ? Number(clMatch[0]) : undefined;
  const statLine = [f('slot') && `Slot ${f('slot')}`, f('aura') && `Aura ${f('aura')}`, level && `${levelLabel} ${level}`].filter(Boolean).join('. ');
  const description = clip([statLine, prose, construction && `Construction\n${construction}`].filter(Boolean).join('\n\n'), 20_000);
  const name = clip(title.replace(/\s+/g, ' ').trim(), 120);
  return {
    kind: 'gear', name,
    summary: summaryFromDescription(prose) || sanitizeSummary(name),
    sourceUrl,
    data: {
      weight: pounds(f('weight')), cost: clip(f('price').replace(/\(\s+/g, '('), 120), description,
      ...(slot ? { slot } : {}),
      ...(aura ? { aura } : {}),
      ...(cl !== undefined && cl >= 0 && cl <= 30 ? { cl } : {}),
    },
  };
}

const VERSIONS = ['lesser', 'normal', 'greater'] as const;
type RodVersion = (typeof VERSIONS)[number];
const VERSION_FRAGMENTS: Record<string, RodVersion> = { lesser: 'lesser', normal: 'normal', standard: 'normal', regular: 'normal', greater: 'greater' };

/** Exactly three "<label> N gp" amounts, one per version (lesser / unlabeled or "standard" = normal / greater); else null. */
function versionAmounts(text: string): Record<RodVersion, { amount: string; label: string }> | null {
  const found = new Map<RodVersion, { amount: string; label: string }>();
  let prev = 0;
  const all = [...text.matchAll(/(\d[\d,]*)\s*gp\b/gi)];
  if (all.length !== 3) return null;
  for (const m of all) {
    const label = text.slice(prev, m.index);
    prev = m.index + m[0].length;
    const v: RodVersion = /\blesser\b/i.test(label) ? 'lesser' : /\bgreater\b/i.test(label) ? 'greater' : 'normal';
    if (found.has(v)) return null;
    found.set(v, { amount: `${m[1]} gp`, label });
  }
  return { lesser: found.get('lesser')!, normal: found.get('normal')!, greater: found.get('greater')! };
}

/**
 * A metamagic rod page describes the lesser, normal and greater rods together.
 * Returns one gear draft per version (page order), or only the one named by the URL fragment
 * (#lesser, #normal/#standard/#regular, #greater). Pages that can't be split fall back to a single draft.
 */
export function parseD20pfsrdMetamagicRod(title: string, blocks: Block[], sourceUrl: string): D20pfsrdDraft[] {
  const rawFragment = new URL(sourceUrl).hash.replace(/^#/, '');
  let wanted: RodVersion | null = null;
  if (rawFragment) {
    let decoded = rawFragment;
    try { decoded = decodeURIComponent(rawFragment); } catch { /* keep raw */ }
    wanted = VERSION_FRAGMENTS[decoded.toLowerCase()] ?? null;
    if (!wanted) throw new Error(`Unknown metamagic rod version '#${decoded}'. Use #lesser, #normal or #greater.`);
  }
  const single = () => [parseD20pfsrdMagicItem(title, blocks, sourceUrl)];
  const isDivider = (b: Block, re: RegExp) => /\bdivider\b/.test(b.cls) && re.test(oneLine(b.html));
  const descFrom = blocks.findIndex((b) => isDivider(b, /^description$/i));
  const consFrom = blocks.findIndex((b, i) => i > descFrom && isDivider(b, /^construction\b/i));
  if (descFrom < 0 || consFrom < 0) return single();

  const preText = blocks.slice(0, descFrom).filter((b) => !isSkippable(b)).map(blockText).join('\n');
  const fields = new Map<string, string>();
  for (const b of blocks.slice(0, descFrom)) {
    if (b.tag !== 'p' || isSkippable(b)) continue;
    for (const m of b.html.matchAll(/<(b|strong)\b[^>]*>([\s\S]*?)<\/\1>([\s\S]*?)(?=<(?:b|strong)\b|$)/gi)) {
      const label = oneLine(m[2]).replace(/[:\s]+$/, '').toLowerCase();
      const value = oneLine(m[3]).replace(/^[:\s]+/, '').replace(/[;\s]+$/, '');
      if (label && !fields.has(label)) fields.set(label, value);
    }
  }
  const proseBlocks = blocks.slice(descFrom + 1, consFrom).filter((b) => !/\btoc_title\b/.test(b.cls));
  let prices = versionAmounts(preText.slice(Math.max(0, preText.search(/\bPrice\b/i))));
  let aura = fields.get('aura') ?? '';
  let shared = proseBlocks;
  if (!prices) {
    // Some pages list the version prices (and the aura) in the first description paragraph.
    const i = proseBlocks.findIndex((b) => versionAmounts(blockText(b)));
    if (i >= 0) {
      prices = versionAmounts(blockText(proseBlocks[i]));
      aura ||= oneLine(/<(b|strong)\b[^>]*>\s*Aura\s*<\/\1>([\s\S]*)$/i.exec(proseBlocks[i].html)?.[2] ?? '').replace(/^[:\s]+|[;\s]+$/g, '');
      shared = proseBlocks.filter((_, j) => j !== i);
    }
  }
  const consText = blocks.slice(consFrom + 1).filter((b) => !isSkippable(b)).map(blockText).filter(Boolean).join('\n');
  const costs = versionAmounts(consText.slice(Math.max(0, consText.search(/\bCost\b/i))));
  const prose = shared.map(blockText).filter(Boolean).join('\n\n');
  if (!prices || !costs || !prose) return single();

  const feats = /\bFeats?\s*:?\s*([^;\n]+)/i.exec(consText)?.[1]?.trim() ?? '';
  const levelLabel = fields.has('cl') ? 'CL' : 'ML';
  const level = fields.get('cl') ?? fields.get('ml') ?? '';
  const clMatch = /\d+/.exec(level);
  const cl = clMatch ? Number(clMatch[0]) : undefined;
  const rawSlot = (fields.get('slot') ?? '').toLowerCase().replace(/[;:,.!?]+$/, '').trim();
  const slot = GEAR_SLOTS.some((v) => v === (SLOT_ALIASES[rawSlot] ?? rawSlot)) ? (SLOT_ALIASES[rawSlot] ?? rawSlot) : 'slotless';
  const auraText = clip(aura, 80).replace(/[;\s]+$/, '');
  const baseName = clip(title.replace(/\s+/g, ' ').trim(), 100);
  const summary = summaryFromDescription(prose) || sanitizeSummary(baseName);

  return VERSIONS.filter((v) => !wanted || v === wanted).map((v) => {
    // A spell-level limit is only reported when the version's own text states one.
    const limit = /\b(\d+(?:st|nd|rd|th)|\w+)[- ]level\b[^.;]{0,20}\bor lower\b/i.exec(prices![v].label)?.[0];
    const statLine = [fields.get('slot') && `Slot ${fields.get('slot')}`, aura && `Aura ${aura}`, level && `${levelLabel} ${level}`, limit, `Price ${prices![v].amount}`]
      .filter(Boolean).join('. ');
    const construction = [feats && `Feats ${feats}`, `Cost ${costs[v].amount}`].filter(Boolean).join('\n');
    const description = clip([statLine, prose, `Construction\n${construction}`].join('\n\n'), 20_000);
    return {
      kind: 'gear' as const,
      name: v === 'normal' ? baseName : `${baseName} (${v[0].toUpperCase()}${v.slice(1)})`,
      summary, sourceUrl,
      data: {
        weight: pounds(fields.get('weight') ?? ''), cost: prices![v].amount, description, slot,
        ...(auraText ? { aura: auraText } : {}),
        ...(cl !== undefined && cl >= 0 && cl <= 30 ? { cl } : {}),
      },
    };
  });
}
