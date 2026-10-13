import type { SpellData } from '@/lib/library';

export interface LibrarySpell {
  id: string;
  name: string;
  summary: string;
  sourceUrl: string | null;
  spellLevels: { cls: string; level: number }[];
  data: SpellData;
}
export const SPELL_CLASSES = ['adept', 'alchemist', 'antipaladin', 'arcanist', 'bard', 'bloodrager', 'cleric', 'druid', 'hunter', 'inquisitor', 'investigator', 'magus', 'medium', 'mesmerist', 'occultist', 'oracle', 'paladin', 'psychic', 'ranger', 'shaman', 'skald', 'sorcerer', 'spiritualist', 'summoner', 'summoner (unchained)', 'warpriest', 'witch', 'wizard'];
export const classLabel = (cls: string) => cls.replace(/\b\w/g, (c) => c.toUpperCase());
export const spellLevelLabel = (spell: Pick<LibrarySpell, 'spellLevels'>) => spell.spellLevels.map(({ cls, level }) => `${classLabel(cls)} ${level}`).join(' / ');
export function rulesUrl(url: string | null | undefined) {
  if (!url) return undefined;
  try { const parsed = new URL(url); return ['https:', 'http:'].includes(parsed.protocol) ? url : undefined; } catch { return undefined; }
}
