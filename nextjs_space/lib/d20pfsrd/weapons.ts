// d20pfsrd.com mundane weapons (core and 3rd party).
// Magic weapons are not handled here.
// Circular import with ../d20pfsrd-parser is safe: neither module uses the other's bindings at module top level.

import {
  D20PFSRD_UNSUPPORTED, HINT, isD20pfsrdUrl, blockText,
  isSkippable, oneLine, clip,
  type Block, type D20pfsrdDraft,
} from '../d20pfsrd-parser';
import { htmlToText } from '../aon-spell-parser';
import { sanitizeSummary, summaryFromDescription } from '../library';

export function isD20pfsrdWeaponUrl(raw: string): boolean {
  return isD20pfsrdUrl(raw) && weaponPath(new URL(raw).pathname.split('/').filter(Boolean).map((s) => s.toLowerCase()));
}

/** Single mundane weapon page on a lowercase path (core or 3rd party). */
export function weaponPath(seg: string[]): boolean {
  return seg[0] === 'equipment' && (
    (seg.length === 4 && seg[1] === 'weapons' && seg[2] === 'weapon-descriptions') ||
    (seg.length === 5 && seg[1] === '3rd-party-equipment' && seg[2] === '3rd-party-weapons')
  );
}

const clean = (s: string) => oneLine(s.replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi, ''));
const nonDash = (s: string) => /^[-–—]+$/.test(s.trim()) ? '' : s.trim();
const labelKey = (s: string) => clean(s).replace(/[:\s]+$/, '').toLowerCase();

/** Leading <b>/<strong> label of a paragraph and the rest of it as text. */
function leadingLabel(html: string): { label: string; value: string } | null {
  const m = /^\s*<(b|strong)\b[^>]*>([\s\S]*?)<\/\1>([\s\S]*)$/i.exec(html);
  if (!m) return null;
  const label = oneLine(m[2]).replace(/[:\s]+$/, '');
  if (!label || label.length > 40) return null;
  return { label, value: htmlToText(m[3]).replace(/^[:\s]+/, '').trim() };
}

function paragraphStats(b: Block): Map<string, string> {
  const fields = new Map<string, string>();
  for (const m of b.html.matchAll(/<(b|strong)\b[^>]*>([\s\S]*?)<\/\1>([\s\S]*?)(?=<(?:b|strong)\b|$)/gi)) {
    const label = labelKey(m[2]);
    if (label && !fields.has(label)) fields.set(label, clean(m[3]).replace(/^[:\s]+/, '').replace(/[;\s]+$/, ''));
  }
  return fields;
}

function tableStats(b: Block): Map<string, string> {
  const rows = [...b.html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) =>
    [...r[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => clean(c[1])));
  const fields = new Map<string, string>();
  const headerIndex = rows.findIndex((r) => r.some((c) => /^dmg\s*\(m\)$/i.test(c)) && r.some((c) => /^critical$/i.test(c)));
  if (headerIndex < 0 || !rows[headerIndex + 1]) return fields;
  const headers = rows[headerIndex];
  const row = rows[headerIndex + 1];
  const keys: Record<string, string> = { 'dmg (m)': 'medium damage', range: 'range increment', 'fighter weapon group': 'weapon group' };
  headers.forEach((h, i) => fields.set(keys[h.toLowerCase()] ?? h.toLowerCase(), row[i] ?? ''));
  fields.set('category', headers[0]);
  fields.set('proficiency', /\(([^)]+)\)/.exec(headers[0])?.[1] ?? '');
  return fields;
}

export function parseD20pfsrdWeapon(title: string, blocks: Block[], sourceUrl: string): D20pfsrdDraft {
  const faq = blocks.findIndex((b) => /^FAQ/i.test(oneLine(b.html)));
  if (faq >= 0) blocks = blocks.slice(0, faq);
  const fields = new Map<string, string>();
  const statBlocks = new Set<Block>();
  for (const b of blocks) {
    if (isSkippable(b)) continue;
    const f = b.tag === 'p' ? paragraphStats(b) : b.tag === 'table' ? tableStats(b) : new Map<string, string>();
    if (!(f.has('damage') || f.has('medium damage')) || !f.has('critical')) continue;
    statBlocks.add(b);
    for (const [k, v] of f) if (!fields.has(k)) fields.set(k, v);
  }
  if (!statBlocks.size) throw new Error(`${D20PFSRD_UNSUPPORTED} That page has no weapon Damage and Critical stats.${HINT}`);
  const f = (k: string) => nonDash(fields.get(k) ?? '');
  const damage = fields.has('medium damage') ? /\b\d+d\d+\b/i.exec(f('medium damage'))?.[0] ?? ''
    : /\b(\d+d\d+)\s*\(medium\)/i.exec(f('damage'))?.[1] ?? '';
  const rangeText = f('range increment');
  const ranged = /\branged\b/i.test(f('category'));
  const category = ranged ? /composite/i.test(title) ? 'composite' : /\bthrown\b/i.test(rangeText) ? 'thrown' : 'ranged' : 'melee';
  const weight = /^(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?/.exec(f('weight'));
  const pounds = weight ? Number(weight[1]) / (Number(weight[2]) || 1) : 0;
  const metadata = [
    ['Proficiency', f('proficiency')],
    ['Weapon group', f('weapon group') || f('weapon groups') || f('weapon group(s)')],
    ['Special', f('special')],
  ].filter(([, value]) => value).map(([label, value]) => `${label}: ${value.replace(/[.\s]+$/, '')}.`).join(' ');
  const description = clip([
    ...blocks.filter((b) => !statBlocks.has(b) && !isSkippable(b)).map((b) => {
      const label = b.tag === 'p' ? leadingLabel(b.html) : null;
      return label ? `${label.label}: ${label.value}` : blockText(b);
    }), metadata,
  ].filter(Boolean).join('\n\n'), 20_000);
  const name = clip(title, 120);
  return {
    kind: 'weapon', name, sourceUrl,
    summary: summaryFromDescription(description) || sanitizeSummary(name),
    data: {
      category, ...(!ranged ? { hands: /two-handed/i.test(f('category')) ? 'two' : 'one' } : {}),
      ability: ranged ? 'dex' : 'str', damage, crit: f('critical').replace(/×/g, 'x'),
      range: Number(/\d+/.exec(rangeText)?.[0] ?? 0),
      type: f('type').toLowerCase().replace(/\b[spb]\b/g, (letter) => ({ s: 'slashing', p: 'piercing', b: 'bludgeoning' })[letter] ?? letter),
      weight: pounds, cost: clip(f('cost'), 120), description,
    },
  };
}
