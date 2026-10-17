// Map a library entry onto the character sheet. The sheet keeps its own copy.
import type { ArmorPiece, SlotItem, Weapon } from './equipment';
import type { ArmorData, FeatData, GearData, WeaponData } from './library';

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

export function gearFromLibrary(name: string, data: GearData, link: Linked) {
  return {
    name, weight: data.weight || 0, quantity: 1, value: data.cost || '', notes: sheetNotes(data.description || ''),
    ...(data.slot !== undefined ? { slot: data.slot } : {}),
    ...(data.aura !== undefined ? { aura: data.aura } : {}),
    ...(data.cl !== undefined ? { cl: data.cl } : {}),
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

export function featFromLibrary(name: string, data: FeatData & { description?: string }, link: Linked) {
  const featType = data.featType?.trim();
  const prerequisites = data.prerequisites?.trim();
  const benefit = data.benefit?.trim();
  const body = data.description || '';
  const description = !prerequisites && !benefit ? body : [
    prerequisites ? `Prerequisites: ${prerequisites}` : '',
    benefit ? `Benefit: ${benefit}` : '',
    // Skip the full text when it already contains the benefit (AoN imports carry both).
    body.trim() && !(benefit && body.includes(benefit)) ? body : '',
  ].filter(Boolean).join('\n\n');
  return {
    name, description,
    ...(featType ? { featType } : {}),
    ...(prerequisites ? { prerequisites } : {}),
    ...(benefit ? { benefit } : {}),
    tag: abilityTag(name, description), libraryEntryId: link.libraryEntryId, sourceUrl: link.sourceUrl ?? null,
  };
}
