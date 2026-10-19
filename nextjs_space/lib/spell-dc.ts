import { resolveSpellClass } from '@/components/library/spell-picker';
import { SPELL_CLASSES } from '@/components/library/types';

type CastingAbility = 'int' | 'wis' | 'cha';
export const CASTING_ABILITY: Readonly<Record<string, CastingAbility>> = {
  wizard: 'int', arcanist: 'int', magus: 'int', alchemist: 'int', investigator: 'int', witch: 'int', psychic: 'int', occultist: 'int',
  cleric: 'wis', druid: 'wis', ranger: 'wis', inquisitor: 'wis', hunter: 'wis', shaman: 'wis', warpriest: 'wis', adept: 'wis', spiritualist: 'wis',
  sorcerer: 'cha', bard: 'cha', oracle: 'cha', paladin: 'cha', antipaladin: 'cha', bloodrager: 'cha', skald: 'cha', summoner: 'cha', 'summoner (unchained)': 'cha', mesmerist: 'cha', medium: 'cha',
};

export function castingAbilityFor(classNames: string[]): CastingAbility | null {
  const abilities = new Set(classNames.map(name => {
    const cls = resolveSpellClass(name, SPELL_CLASSES);
    return Object.prototype.hasOwnProperty.call(CASTING_ABILITY, cls) ? CASTING_ABILITY[cls] : undefined;
  }).filter((ability): ability is CastingAbility => ability !== undefined));
  return abilities.size === 1 ? [...abilities][0] : null;
}

export function spellDc(level: number, mod: number): number {
  return 10 + level + mod;
}
