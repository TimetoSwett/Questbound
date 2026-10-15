import { z } from 'zod';
import { ABILITIES, AC_BONUSES, BODY_SLOTS, SAVE_BONUSES, STACKS, UNSLOTTED_SLOTS } from './equipment';

const number = z.number().int().min(-1000).max(1000);
const bonusAmount = z.number().int().min(-30).max(30);
const stack = z.enum(STACKS).optional();
const itemBonus = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ability'), ability: z.enum(ABILITIES), amount: bonusAmount, stack }).strict(),
  z.object({ kind: z.literal('ac'), bonus: z.enum(AC_BONUSES), amount: bonusAmount, stack }).strict(),
  z.object({ kind: z.literal('skill'), skill: z.string().trim().min(1).max(80), amount: bonusAmount, stack }).strict(),
  z.object({ kind: z.literal('save'), save: z.enum(SAVE_BONUSES), amount: bonusAmount, stack }).strict(),
  z.object({ kind: z.literal('spell'), amount: bonusAmount, stack }).strict(),
  z.object({ kind: z.literal('attack'), amount: bonusAmount, stack }).strict(),
  z.object({ kind: z.literal('damage'), amount: bonusAmount, stack }).strict(),
  z.object({ kind: z.literal('init'), amount: bonusAmount, stack }).strict(),
]);
const slot = z.object({
  name: z.string().max(200),
  inventoryItemId: z.string().min(1).max(200).nullable().optional(),
  notes: z.string().max(5000).optional(),
  libraryEntryId: z.string().min(1).max(80).optional(),
  sourceUrl: z.string().url().max(500).nullable().optional(),
  bonuses: z.array(itemBonus).max(8).optional(),
}).strict();
const armor = slot.extend({
  acBonus: number,
  maxDex: number.nullable().optional(),
  checkPenalty: z.number().int().min(-1000).max(0),
  spellFailure: z.number().int().min(0).max(100),
});
const weapon = slot.extend({
  attackBonus: number,
  ability: z.enum(['str', 'dex']),
  extraAbilities: z.array(z.enum(ABILITIES)).max(5).optional(),
  damage: z.string().max(100),
  damageBonus: number,
  crit: z.string().max(100),
  range: z.number().int().min(0).max(100000),
  category: z.enum(['melee', 'ranged', 'thrown', 'composite']).optional(),
  type: z.string().max(100),
});
const buff = z.object({
  name: z.string().max(200),
  on: z.boolean(),
  bonuses: z.array(itemBonus).max(8).optional(),
  libraryEntryId: z.string().min(1).max(80).optional(),
  sourceUrl: z.string().url().max(500).nullable().optional(),
}).strict();
const sheet = z.object({
  nonlethal: z.number().int().min(0).max(10000).optional(),
  noScore: z.array(z.enum(ABILITIES)).max(6).optional(),
  dodge: z.number().int().min(-100).max(100).optional(),
  naturalEnhancement: z.number().int().min(-100).max(100).optional(),
  initAbilities: z.array(z.enum(ABILITIES)).max(6).optional(),
  favoredClass: z.string().max(80).optional(),
  favoredHp: z.number().int().min(0).max(1000).optional(),
  favoredRanks: z.number().int().min(0).max(1000).optional(),
  favoredNotes: z.string().max(500).optional(),
  dr: z.array(z.object({ amount: z.number().int().min(0).max(1000), bypass: z.string().max(80) }).strict()).max(20).optional(),
  resist: z.array(z.object({ energy: z.string().max(40), amount: z.number().int().min(0).max(1000) }).strict()).max(20).optional(),
}).strict();
export const equippedSchema = z.object({
  armor: armor.nullable().optional(),
  shield: armor.nullable().optional(),
  weapons: z.array(weapon).max(50).optional(),
  slots: z.object(Object.fromEntries([...BODY_SLOTS, ...UNSLOTTED_SLOTS].map(key => [key, slot.nullable().optional()]))).strict().optional(),
  conditions: z.array(z.string().trim().min(1).max(40)).max(40).optional(),
  buffs: z.array(buff).max(30).optional(),
  sheet: sheet.optional(),
}).strict();
