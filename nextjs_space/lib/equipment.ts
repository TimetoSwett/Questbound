// Shape of Character.equipped. Every slot item is either linked to an
// InventoryItem the character carries (inventoryItemId) or typed by hand.
export const BODY_SLOTS = [
  'head', 'headband', 'eyes', 'shoulders', 'neck', 'chest', 'body',
  'armor', 'belt', 'wrists', 'hands', 'ring1', 'ring2', 'feet',
] as const;
export type BodySlot = (typeof BODY_SLOTS)[number];
export const UNSLOTTED_SLOTS = ['unslotted1', 'unslotted2'] as const;
export type UnslottedSlot = (typeof UNSLOTTED_SLOTS)[number];

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type AbilityName = (typeof ABILITIES)[number];
export const AC_BONUSES = ['armor', 'shield', 'natural', 'deflection', 'dodge'] as const;
export type AcBonusName = (typeof AC_BONUSES)[number];
export const SAVE_BONUSES = ['fort', 'ref', 'will'] as const;
export type SaveBonusName = (typeof SAVE_BONUSES)[number];

export const STACKS = ['untyped', 'penalty', 'enhancement', 'size', 'morale', 'luck', 'circumstance', 'competence', 'insight', 'dodge', 'deflection', 'natural', 'racial', 'alchemical', 'sacred', 'profane', 'resistance', 'inherent'] as const;
export type StackKind = (typeof STACKS)[number];
export const STACK_LABELS: Record<StackKind, string> = {
  untyped: 'Untyped', penalty: 'Penalty', enhancement: 'Enhancement', size: 'Size', morale: 'Morale', luck: 'Luck',
  circumstance: 'Circumstance', competence: 'Competence', insight: 'Insight', dodge: 'Dodge', deflection: 'Deflection',
  natural: 'Natural', racial: 'Racial', alchemical: 'Alchemical', sacred: 'Sacred', profane: 'Profane', resistance: 'Resistance', inherent: 'Inherent',
};

export type ItemBonus = (
  | { kind: 'ability'; ability: AbilityName; amount: number }
  | { kind: 'ac'; bonus: AcBonusName; amount: number }
  | { kind: 'skill'; skill: string; amount: number }
  | { kind: 'save'; save: SaveBonusName; amount: number }
  | { kind: 'spell'; amount: number }
  | { kind: 'attack'; amount: number }
  | { kind: 'damage'; amount: number }
  | { kind: 'init'; amount: number }
) & { stack?: StackKind };

export function bonusStack(bonus: { stack?: StackKind }): StackKind {
  return bonus.stack ?? 'untyped';
}

/** Untyped, dodge, circumstance, and penalties add. Other types keep the best bonus and the worst penalty.
 * Note: circumstance bonuses from the same source would technically overlap, but we accept that
 * because it's rare — entries here don't carry source info to distinguish them. */
export function foldStacks(entries: { amount: number; stack: StackKind }[]): number {
  let total = 0;
  const bonus = new Map<string, number>();
  const penalized = new Map<string, number>();
  for (const entry of entries) {
    if (!entry.amount) continue;
    if (entry.stack === 'untyped' || entry.stack === 'penalty' || entry.stack === 'dodge' || entry.stack === 'circumstance') {
      total += entry.amount;
      continue;
    }
    const bucket = entry.amount > 0 ? bonus : penalized;
    const current = bucket.get(entry.stack);
    bucket.set(entry.stack, current === undefined ? entry.amount : entry.amount > 0 ? Math.max(current, entry.amount) : Math.min(current, entry.amount));
  }
  for (const amount of bonus.values()) total += amount;
  for (const amount of penalized.values()) total += amount;
  return total;
}

export function stackParts(entries: { amount: number; stack: StackKind }[]): { stack: StackKind; amount: number }[] {
  const groups = new Map<StackKind, { amount: number; stack: StackKind }[]>();
  for (const entry of entries) {
    if (!entry.amount) continue;
    groups.set(entry.stack, [...(groups.get(entry.stack) ?? []), entry]);
  }
  return [...groups.entries()].map(([stack, mods]) => ({ stack, amount: foldStacks(mods) })).filter(part => part.amount !== 0);
}

export interface SlotItem {
  name: string;
  inventoryItemId?: string | null;
  notes?: string;
  libraryEntryId?: string;
  sourceUrl?: string | null;
  bonuses?: ItemBonus[];
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
  extraAbilities?: AbilityName[];
  damage: string;           // dice, e.g. "1d8"
  damageBonus: number;
  crit: string;             // e.g. "19-20/x2"
  range: number;            // ft, 0 = melee
  category?: 'melee' | 'ranged' | 'thrown' | 'composite'; // missing = melee
  hands?: WeaponHands;      // missing = one-handed (Str x1)
  type: string;             // e.g. "S", "P", "B/P"
}

export interface CharacterBuff {
  name: string;
  on: boolean;
  bonuses?: ItemBonus[];
  libraryEntryId?: string;
  sourceUrl?: string | null;
}

export interface SheetOptions {
  backstory?: string;
  senses?: { darkvision?: number; lowLight?: boolean; scent?: boolean; blindsense?: number; blindsight?: number; tremorsense?: number; custom?: string[] };
  nonlethal?: number;
  noScore?: AbilityName[];
  dodge?: number;
  naturalEnhancement?: number;
  initAbilities?: AbilityName[];
  favoredClass?: string;
  favoredHp?: number;
  favoredRanks?: number;
  favoredNotes?: string;
  dr?: { amount: number; bypass: string }[];
  resist?: { energy: string; amount: number }[];
}

export interface Equipped {
  armor?: ArmorPiece | null;
  shield?: ArmorPiece | null;
  weapons?: Weapon[];
  slots?: Partial<Record<BodySlot | UnslottedSlot, SlotItem | null>>;
  conditions?: string[];
  buffs?: CharacterBuff[];
  sheet?: SheetOptions;
}

export interface Adjustment {
  ability: Record<AbilityName, number>;
  ac: Record<AcBonusName, number>;
  skills: Record<string, number>;
  saves: Record<SaveBonusName, number>;
  spellDc: number;
  attack: number;
  damage: number;
  init: number;
  skillAll: number;
  acPenalty: number;
  acSize: number;
  sizeCmb: number;
  naturalEnhancement: number;
  cmdAc: number;
  abilityParts: Record<AbilityName, { stack: StackKind; amount: number }[]>;
  cmb: number;
  loseDex: boolean;
}

export function adjustmentFromBonuses(bonuses: ItemBonus[]): Adjustment {
  const ability: Record<AbilityName, number> = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
  const ac: Record<AcBonusName, number> = { armor: 0, shield: 0, natural: 0, deflection: 0, dodge: 0 };
  const skills: Record<string, number> = {};
  const saves: Record<SaveBonusName, number> = { fort: 0, ref: 0, will: 0 };
  let spellDc = 0, attack = 0, damage = 0, init = 0;
  for (const bonus of bonuses) {
    if (bonus.kind === 'ability') ability[bonus.ability] += bonus.amount;
    else if (bonus.kind === 'ac') ac[bonus.bonus] += bonus.amount;
    else if (bonus.kind === 'skill') skills[bonus.skill] = (skills[bonus.skill] ?? 0) + bonus.amount;
    else if (bonus.kind === 'save') saves[bonus.save] += bonus.amount;
    else if (bonus.kind === 'spell') spellDc += bonus.amount;
    else if (bonus.kind === 'attack') attack += bonus.amount;
    else if (bonus.kind === 'damage') damage += bonus.amount;
    else init += bonus.amount;
  }
  return { ability, ac, skills, saves, spellDc, attack, damage, init, skillAll: 0, acPenalty: 0, acSize: 0, sizeCmb: 0, naturalEnhancement: 0, cmdAc: 0, abilityParts: { str: [], dex: [], con: [], int: [], wis: [], cha: [] }, cmb: 0, loseDex: false };
}

/** Blank names are placeholders, rather than equipped items. */
export function namedGear(equipped: Equipped = {}): SlotItem[] {
  return [
    equipped.armor, equipped.shield, ...(equipped.weapons ?? []), ...Object.values(equipped.slots ?? {}),
  ].filter((item): item is SlotItem => !!item?.name?.trim());
}

export function equippedItemBonuses(equipped: Equipped = {}) {
  return adjustmentFromBonuses(namedGear(equipped).flatMap(item => item.bonuses ?? []));
}

const ABILITY_LABELS: Record<AbilityName, string> = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
const AC_LABELS: Record<AcBonusName, string> = { armor: 'Armor', shield: 'Shield', natural: 'Natural armor', deflection: 'Deflection', dodge: 'Dodge' };
const SAVE_LABELS: Record<SaveBonusName, string> = { fort: 'Fortitude', ref: 'Reflex', will: 'Will' };

export function bonusLabel(bonus: ItemBonus): string {
  const amount = bonus.amount >= 0 ? `+${bonus.amount}` : `${bonus.amount}`;
  const typed = bonus.stack && bonus.stack !== 'untyped' ? ` ${STACK_LABELS[bonus.stack].toLowerCase()}` : '';
  if (bonus.kind === 'ability') return `${ABILITY_LABELS[bonus.ability]} ${amount}${typed}`;
  if (bonus.kind === 'ac') return `${AC_LABELS[bonus.bonus]} ${amount}${typed}`;
  if (bonus.kind === 'skill') return `${bonus.skill} ${amount}${typed}`;
  if (bonus.kind === 'save') return `${SAVE_LABELS[bonus.save]} ${amount}${typed}`;
  if (bonus.kind === 'attack') return `Attack ${amount}${typed}`;
  if (bonus.kind === 'damage') return `Damage ${amount}${typed}`;
  if (bonus.kind === 'init') return `Initiative ${amount}${typed}`;
  return `Spell DC ${amount}${typed}`;
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

export const WEAPON_HANDS = ['one', 'two', 'off'] as const;
export type WeaponHands = typeof WEAPON_HANDS[number];
export const CREATURE_SIZES = ['Fine', 'Diminutive', 'Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan', 'Colossal'] as const;

/** Strength to damage: ranged none; penalties always in full; melee/thrown x1 one-hand, x1.5 two-hand,
 *  x0.5 off-hand (rounded down). Composite bows add Str x1 regardless of hands. */
export function strengthDamage(strMod: number, category: Weapon['category'], hands: WeaponHands | undefined): number {
  if (category === 'ranged') return 0;
  if (strMod <= 0 || category === 'composite') return strMod;
  if (hands === 'two') return Math.floor(strMod * 1.5);
  if (hands === 'off') return Math.floor(strMod * 0.5);
  return strMod;
}

// Pathfinder weapon damage by size, from the Medium die: [Fine, Diminutive, Tiny, Small, Large, Huge, Gargantuan, Colossal].
const SIZE_DAMAGE: Record<string, string[]> = {
  '1d2': ['1', '1', '1', '1', '1d3', '1d4', '1d6', '1d8'],
  '1d3': ['1', '1', '1', '1d2', '1d4', '1d6', '1d8', '2d6'],
  '1d4': ['1', '1', '1d2', '1d3', '1d6', '1d8', '2d6', '3d6'],
  '1d6': ['1', '1d2', '1d3', '1d4', '1d8', '2d6', '3d6', '4d6'],
  '1d8': ['1d2', '1d3', '1d4', '1d6', '2d6', '3d6', '4d6', '6d6'],
  '1d10': ['1d3', '1d4', '1d6', '1d8', '2d8', '3d8', '4d8', '6d8'],
  '1d12': ['1d4', '1d6', '1d8', '1d10', '3d6', '4d6', '6d6', '8d6'],
  '2d4': ['1d2', '1d3', '1d4', '1d6', '2d6', '3d6', '4d6', '6d6'],
  '2d6': ['1d4', '1d6', '1d8', '1d10', '3d6', '4d6', '6d6', '8d6'],
  '2d8': ['1d6', '1d8', '1d10', '2d6', '3d8', '4d8', '6d8', '8d8'],
  '2d10': ['1d8', '1d10', '2d6', '2d8', '4d8', '6d8', '8d8', '12d8'],
};
// Larger dice step along these progressions (one step per size category).
const SIZE_CHAINS = [['1d6', '1d8', '2d6', '3d6', '4d6', '6d6', '8d6', '12d6'], ['1d8', '1d10', '2d8', '3d8', '4d8', '6d8', '8d8', '12d8']];

/** Medium damage die scaled to a creature size; unknown dice or sizes are returned unchanged. */
export function sizedDamage(damage: string, size: string | null | undefined): string {
  const index = CREATURE_SIZES.findIndex(item => item.toLowerCase() === (size ?? '').trim().toLowerCase());
  if (index < 0 || index === 4) return damage;
  const die = damage.trim().toLowerCase().replace(/\s+/g, '');
  const row = SIZE_DAMAGE[die];
  if (row) return row[index < 4 ? index : index - 1];
  for (const chain of SIZE_CHAINS) {
    const at = chain.indexOf(die);
    const next = chain[at + index - 4];
    if (at >= 2 && next) return next;
  }
  return damage;
}

/** Ranged weapons add no Strength; see strengthDamage. Damage die is scaled from Medium by creature size. */
export function weaponTotals(weapon: Weapon, bab: number, strMod: number, dexMod: number, sizeMod = 0, extraAttack = 0, extraDamage = 0, size?: string | null) {
  const damageBonus = strengthDamage(strMod, weapon.category, weapon.hands) + weapon.damageBonus + extraDamage;
  return {
    attack: bab + (weapon.ability === 'dex' ? dexMod : strMod) + weapon.attackBonus + sizeMod + extraAttack,
    damage: `${sizedDamage(weapon.damage, size)}${damageBonus === 0 ? '' : damageBonus > 0 ? `+${damageBonus}` : damageBonus}`,
  };
}

/** Damage cell text: the weaponTotals damage string, or an em dash when the weapon has no damage die. */
export function formatWeaponDamage(weapon: Weapon, bab: number, strMod: number, dexMod: number, sizeMod = 0, extraAttack = 0, extraDamage = 0, size?: string | null): string {
  if (!weapon.damage?.trim()) return '\u2014';
  return weaponTotals({ ...weapon, damage: weapon.damage.trim() }, bab, strMod, dexMod, sizeMod, extraAttack, extraDamage, size).damage;
}

/** Typographic crit text ("19-20/x2" -> "19\u201320/\u00d72"); empty string when no crit is stored. */
export function formatCrit(crit: string | null | undefined): string {
  const text = crit?.trim();
  if (!text) return '';
  return text.replace(/(\d)\s*-\s*(\d)/g, '$1\u2013$2').replace(/[x\u00d7]\s*(\d)/gi, '\u00d7$1');
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
