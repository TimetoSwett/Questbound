// Standard scrolls/wands refer to spells, not standalone item display pages.
// The source supplies spell levels; the user supplies caster level and charges.
// Additional material-component costs are explicit instead of guessed from prose.
import { z } from 'zod';
import { parseSpellPage } from './aon-spell-parser';
import { d20pfsrdKindForUrl, parseD20pfsrdPage } from './d20pfsrd-parser';
import { summaryFromDescription, spellItemDataSchema, spellItemCost } from './library';
import type { CatalogDraft } from './aon-catalog-parser';

export const spellItemOptionsSchema = z.object({
  itemType: z.enum(['scroll', 'wand']),
  cl: z.number().int().min(1).max(30),
  charges: z.number().int().min(0).max(50).optional(),
  componentCostGp: z.number().min(0).max(1_000_000).default(0),
}).superRefine((options, ctx) => {
  if (options.itemType === 'wand' && options.charges === undefined) ctx.addIssue({ code: 'custom', path: ['charges'], message: 'Enter wand charges from 0 to 50' });
  if (options.itemType === 'scroll' && options.charges !== undefined && options.charges !== 1) ctx.addIssue({ code: 'custom', path: ['charges'], message: 'A new scroll has one charge' });
});
export type SpellItemOptions = z.infer<typeof spellItemOptionsSchema>;

export function isSpellItemSource(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return false;
    if (['aonprd.com', 'www.aonprd.com'].includes(url.hostname)) {
      return url.pathname.toLowerCase() === '/spelldisplay.aspx' && Boolean(url.searchParams.get('ItemName')?.trim());
    }
    return d20pfsrdKindForUrl(raw) === 'spell';
  } catch { return false; }
}

export function parseSpellItemImport(html: string, sourceUrl: string, options: SpellItemOptions): CatalogDraft {
  const { itemType, cl, charges, componentCostGp } = spellItemOptionsSchema.parse(options);
  if (!isSpellItemSource(sourceUrl)) throw new Error('For a scroll or wand, use a single Archives of Nethys or d20pfsrd spell link.');
  const url = new URL(sourceUrl);
  const spell = url.hostname.endsWith('aonprd.com')
    ? parseSpellPage(html, url.searchParams.get('ItemName')!.trim())
    : parseD20pfsrdPage(html, sourceUrl);
  if (!spell.spellLevels?.length) throw new Error('That page has no spell levels.');
  if (itemType === 'wand' && !spell.spellLevels.some(({ level }) => level <= 4)) {
    throw new Error('Wands can only contain spells of 4th level or lower.');
  }
  const spellLevel = Math.min(...spell.spellLevels.map(({ level }) => level));
  const spellItem = spellItemDataSchema.parse({ type: itemType, spellLevel, charges: itemType === 'scroll' ? 1 : charges, componentCostGp });
  const cost = spellItemCost(spellItem, cl);
  const label = itemType === 'scroll' ? 'Scroll' : 'Wand';
  // Include CL to distinguish otherwise identical imports at different strengths.
  const name = `${label} of ${spell.name} (CL ${cl})`.slice(0, 120);
  const fields = [
    ['school', 'School'], ['subschool', 'Subschool'], ['descriptors', 'Descriptors'],
    ['castingTime', 'Casting time'], ['components', 'Components'], ['range', 'Range'],
    ['areaTargetEffect', 'Area / Target / Effect'], ['duration', 'Duration'],
    ['savingThrow', 'Saving throw'], ['spellResistance', 'Spell resistance'],
  ];
  const stats = fields.flatMap(([key, title]) => {
    const raw = spell.data[key as keyof typeof spell.data];
    const value = Array.isArray(raw) ? raw.join(', ') : raw;
    return value ? [`${title}: ${String(value)}`] : [];
  });
  const prose = String(spell.data.description ?? '');
  const description = [
    `${label} of ${spell.name}. ${itemType === 'wand' ? '50 charges when fully charged.' : 'Single use.'}`,
    `Spell levels: ${spell.spellLevels.map(({ cls, level }) => `${cls} ${level}`).join(', ')}`,
    stats.join('\n'), prose,
  ].join('\n\n').slice(0, 20_000);
  return { kind: 'gear', name, sourceUrl, summary: summaryFromDescription(prose), data: { slot: 'slotless', cl, cost, weight: 0, description, spellItem } };
}
