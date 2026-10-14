// Shape of Character.equipped. Every slot item is either linked to an
// InventoryItem the character carries (inventoryItemId) or typed by hand.
export const BODY_SLOTS = [
  'head', 'headband', 'eyes', 'shoulders', 'neck', 'chest', 'body',
  'armor', 'belt', 'wrists', 'hands', 'ring1', 'ring2', 'feet',
] as const;
export type BodySlot = (typeof BODY_SLOTS)[number];
export const UNSLOTTED_SLOTS = ['unslotted1', 'unslotted2'] as const;
export type UnslottedSlot = (typeof UNSLOTTED_SLOTS)[number];

export interface SlotItem {
  name: string;
  inventoryItemId?: string | null;
  notes?: string;
  libraryEntryId?: string;
  sourceUrl?: string | null;
}

export interface ArmorPiece extends SlotItem {
  acBonus: number;          // armor or shield bonus to AC
  maxDex?: number | null;   // null = no limit
  checkPenalty: number;     // armor check penalty, stored <= 0
  spellFailure: number;     // arcane spell failure, percent
}

export interface Weapon extends SlotItem {
  attackBonus: number;      // misc/enhancement on top of BAB + ability
  ability: 'str' | 'dex';
  damage: string;           // dice, e.g. "1d8"
  damageBonus: number;
  crit: string;             // e.g. "19-20/x2"
  range: number;            // ft, 0 = melee
  category?: 'melee' | 'ranged' | 'thrown' | 'composite'; // missing = melee
  type: string;             // e.g. "S", "P", "B/P"
}

export interface Equipped {
  armor?: ArmorPiece | null;
  shield?: ArmorPiece | null;
  weapons?: Weapon[];
  slots?: Partial<Record<BodySlot | UnslottedSlot, SlotItem | null>>;
}

/** Blank names are placeholders, rather than equipped items. */
export function equipmentEffects(equipped: Equipped = {}, armorBonus = 0, shieldBonus = 0, dexMod = 0) {
  const armor = equipped.armor?.name.trim() ? equipped.armor : null;
  const shield = equipped.shield?.name.trim() ? equipped.shield : null;
  const pieces = [armor, shield].filter((piece): piece is ArmorPiece => !!piece);
  const limits = pieces.flatMap(piece => piece.maxDex == null ? [] : [piece.maxDex]);
  const maxDex = limits.length ? Math.min(...limits) : null;
  return {
    armorBonus: armor?.acBonus ?? armorBonus,
    shieldBonus: shield?.acBonus ?? shieldBonus,
    dexToAC: maxDex == null ? dexMod : Math.min(dexMod, maxDex),
    checkPenalty: pieces.reduce((sum, piece) => sum + piece.checkPenalty, 0),
    spellFailure: pieces.reduce((sum, piece) => sum + piece.spellFailure, 0),
    maxDex,
  };
}

export function equipmentSkillPenalty(ability: string, checkPenalty: number) {
  return ['STR', 'DEX'].includes(ability.toUpperCase()) ? checkPenalty : 0;
}

/** Only melee, thrown and composite weapons add Strength to damage. */
export function weaponTotals(weapon: Weapon, bab: number, strMod: number, dexMod: number, sizeMod = 0) {
  const damageBonus = (weapon.category === 'ranged' ? 0 : strMod) + weapon.damageBonus;
  return {
    attack: bab + (weapon.ability === 'dex' ? dexMod : strMod) + weapon.attackBonus + sizeMod,
    damage: `${weapon.damage}${damageBonus === 0 ? '' : damageBonus > 0 ? `+${damageBonus}` : damageBonus}`,
  };
}

/** True when a named armor/shield piece is equipped (blank names are placeholders). */
export function hasPiece(equipped: Equipped | null | undefined, key: 'armor' | 'shield'): boolean {
  return !!equipped?.[key]?.name?.trim();
}

/** Manual armor/shield bonus to keep after an equipment change: unequipping a piece resets it to 0
 *  (the stored bonus was the piece's own AC bonus, so keeping it would leave the AC applied). */
export function manualBonusAfterChange(previous: Equipped | null | undefined, next: Equipped | null | undefined, key: 'armor' | 'shield', current: number): number {
  return hasPiece(previous, key) && !hasPiece(next, key) ? 0 : current;
}
