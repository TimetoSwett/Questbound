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
  type: string;             // e.g. "S", "P", "B/P"
}

export interface Equipped {
  armor?: ArmorPiece | null;
  shield?: ArmorPiece | null;
  weapons?: Weapon[];
  slots?: Partial<Record<BodySlot | UnslottedSlot, SlotItem | null>>;
}
