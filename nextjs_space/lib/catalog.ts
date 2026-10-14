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
    range: data.range || 0, category: data.category || 'melee', type: data.type || '',
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
    libraryEntryId: link.libraryEntryId, sourceUrl: link.sourceUrl ?? null,
  };
}

export function featFromLibrary(name: string, data: FeatData & { description?: string }, link: Linked) {
  const parts = [data.prerequisites ? `Prerequisites: ${data.prerequisites}` : '', data.benefit || data.description || ''].filter(Boolean);
  return { name, description: parts.join('\n\n'), libraryEntryId: link.libraryEntryId, sourceUrl: link.sourceUrl ?? null };
}
