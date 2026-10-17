// d20pfsrd.com magic items: wondrous items, rings, rods, staves, specific magic
// weapons, specific magic armor/shields, and potions (core and 3rd party).
// Circular import with ../d20pfsrd-parser is safe: neither module uses the other's bindings at module top level.

import { GEAR_SLOTS, sanitizeSummary, summaryFromDescription } from '../library';
import { D20PFSRD_UNSUPPORTED, HINT, blockText, clip, isSkippable, oneLine } from '../d20pfsrd-parser';
import type { Block, D20pfsrdDraft } from '../d20pfsrd-parser';

type MagicItemCategory = 'wondrous' | 'ring' | 'rod' | 'staff' | 'magic-weapon' | 'magic-armor' | 'potion';
const CATEGORIES: Record<string, MagicItemCategory> = { 'wondrous-items': 'wondrous', rings: 'ring', rods: 'rod', staves: 'staff' };

/** Magic item category of a lowercase path (core or 3rd party), else null. */
export function magicItemCategory(seg: string[]): MagicItemCategory | null {
  if (seg[0] !== 'magic-items') return null;
  if (seg[1] === 'wondrous-items') return seg.length === 4 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(seg[2]) ? 'wondrous' : null;
  if (seg[1] === 'rings' || seg[1] === 'rods' || seg[1] === 'staves') return seg.length === 3 ? CATEGORIES[seg[1]] : null;
  // Specific magic weapons: /magic-items/magic-weapons/specific-magic-weapons/<name>/
  if (seg[1] === 'magic-weapons' && seg[2] === 'specific-magic-weapons') {
    return seg.length === 4 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(seg[3]) ? 'magic-weapon' : null;
  }
  // Specific magic armor/shields: /magic-items/magic-armor/specific-magic-armor/<name>/
  // or /magic-items/magic-armor/specific-magic-shields/<name>/
  if (seg[1] === 'magic-armor' && (seg[2] === 'specific-magic-armor' || seg[2] === 'specific-magic-shields')) {
    return seg.length === 4 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(seg[3]) ? 'magic-armor' : null;
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
      : '';
  }
  const aura = clip(f('aura'), 80).replace(/[;\s]+$/, '');
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
