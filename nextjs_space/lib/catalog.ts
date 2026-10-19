// Map a library entry onto the character sheet. The sheet keeps its own copy.
import type { ArmorPiece, SlotItem, Weapon } from './equipment';
import type { AbilityData, ArmorData, FeatData, GearData, WeaponData } from './library';

type Linked = { libraryEntryId?: string; sourceUrl?: string | null };

function sheetNotes(text: string): string {
  return text.slice(0, 5000);
}

export function weaponFromLibrary(name: string, data: WeaponData, link: Linked): Weapon & Linked {
  return {
    name, attackBonus: 0, ability: data.ability === 'dex' ? 'dex' : 'str',
    damage: data.damage || '1d6', damageBonus: 0, crit: data.crit || '20/x2',
    range: data.range || 0, category: data.category || 'melee', type: data.type || '', baseDie: 'medium',
    ...(data.hands ? { hands: data.hands } : {}),
    notes: sheetNotes(data.description || ''), libraryEntryId: link.libraryEntryId, sourceUrl: link.sourceUrl ?? null,
  };
}

export function armorFromLibrary(name: string, data: ArmorData, link: Linked): ArmorPiece & Linked {
  return {
    name, acBonus: data.acBonus ?? 0, maxDex: data.maxDex ?? null,
    checkPenalty: Math.min(0, data.checkPenalty ?? 0), spellFailure: data.spellFailure ?? 0,
    notes: sheetNotes(data.description || ''), libraryEntryId: link.libraryEntryId, sourceUrl: link.sourceUrl ?? null,
  };
}

export function slotFromLibrary(name: string, data: { description?: string }, link: Linked): SlotItem {
  return {
    name, notes: sheetNotes(data.description || ''), inventoryItemId: null,
    libraryEntryId: link.libraryEntryId, sourceUrl: link.sourceUrl ?? null,
  };
}

export function gearItemFields(data: GearData) {
  return {
    weight: data.weight || 0, value: data.cost || '', notes: data.spellItem ? (data.description || '').slice(0, 20_000) : sheetNotes(data.description || ''),
    ...(data.spellItem ? { spellItem: { ...data.spellItem } } : {}),
    ...(data.slot !== undefined ? { slot: data.slot } : {}),
    ...(data.aura !== undefined ? { aura: data.aura } : {}),
    ...(data.cl !== undefined ? { cl: data.cl } : {}),
  };
}

export function gearFromLibrary(name: string, data: GearData, link: Linked) {
  return {
    name, ...gearItemFields(data), quantity: 1,
    libraryEntryId: link.libraryEntryId, sourceUrl: link.sourceUrl ?? null,
  };
}

export const ABILITY_TAGS = {
  ex: { label: 'Extraordinary (Ex)', text: 'Non-magical, though not something just anyone can do. Antimagic and dispel have no effect.' },
  sp: { label: 'Spell-like (Sp)', text: 'Magical and like a spell. Spell resistance and dispel magic work, and it fails in antimagic. It can be dispelled, but not counterspelled.' },
  su: { label: 'Supernatural (Su)', text: 'Magical, but not spell-like. Spell resistance and dispel do not work. It fails in antimagic, and it cannot be counterspelled.' },
} as const;
export type AbilityTag = keyof typeof ABILITY_TAGS;

export function abilityTag(name: string, body = ''): AbilityTag | undefined {
  const match = `${name}\n${body.slice(0, 240)}`.match(/\((Ex|Su|Sp)\)/i);
  const tag = match?.[1].toLowerCase();
  return tag === 'ex' || tag === 'su' || tag === 'sp' ? tag : undefined;
}

export function featBodyRemainder(body: string, benefit?: string | null): string | null {
  if (!benefit?.trim()) return body;
  const normalise = (text: string) => text.toLowerCase()
    .replace(/^\s*benefit:\s*/, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ').trim();
  const escapedBenefit = benefit.trim().split(/\s+/)
    .map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
  const labelledBenefit = new RegExp(`\\bBenefit\\b\\s*:?\\s+${escapedBenefit}`, 'i');
  const removed = labelledBenefit.test(body);
  const rest = body.replace(labelledBenefit, '').trim().replace(/\n{3,}/g, '\n\n');
  const normalisedRest = normalise(rest);
  if (normalise(body) === normalise(benefit)) return null;
  // Only a leftover from a stripped labelled benefit is dropped for being short.
  if (removed && normalisedRest.length < 20) return null;
  if (!normalisedRest) return null;
  return removed ? rest : body;
}

export function featDescription(data: Partial<Pick<FeatData, 'prerequisites' | 'benefit' | 'description'>>) {
  const prerequisites = data.prerequisites?.trim();
  const benefit = data.benefit?.trim();
  const body = data.description || '';
  return !prerequisites && !benefit ? body : [
    prerequisites ? `Prerequisites: ${prerequisites}` : '',
    benefit ? `Benefit: ${benefit}` : '',
    featBodyRemainder(body, benefit) ?? '',
  ].filter(Boolean).join('\n\n');
}

export function featFromLibrary(name: string, data: Partial<FeatData & AbilityData>, link: Linked) {
  const featType = data.featType?.trim();
  const prerequisites = data.prerequisites?.trim();
  const benefit = data.benefit?.trim();
  const uses = data.uses?.trim();
  const tag = data.tag === 'ex' || data.tag === 'su' || data.tag === 'sp' ? data.tag : undefined;
  const description = featDescription(data);
  return {
    name, description,
    ...(featType ? { featType } : {}),
    ...(prerequisites ? { prerequisites } : {}),
    ...(benefit ? { benefit } : {}),
    ...(uses ? { uses } : {}),
    tag: tag ?? abilityTag(name, description), libraryEntryId: link.libraryEntryId, sourceUrl: link.sourceUrl ?? null,
  };
}
