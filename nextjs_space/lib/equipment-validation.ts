import { z } from 'zod';
import { BODY_SLOTS, UNSLOTTED_SLOTS } from './equipment';

const number = z.number().int().min(-1000).max(1000);
const slot = z.object({
  name: z.string().max(200),
  inventoryItemId: z.string().min(1).max(200).nullable().optional(),
  notes: z.string().max(5000).optional(),
  libraryEntryId: z.string().min(1).max(80).optional(),
  sourceUrl: z.string().url().max(500).nullable().optional(),
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
  damage: z.string().max(100),
  damageBonus: number,
  crit: z.string().max(100),
  range: z.number().int().min(0).max(100000),
  category: z.enum(['melee', 'ranged', 'thrown', 'composite']).optional(),
  type: z.string().max(100),
});
export const equippedSchema = z.object({
  armor: armor.nullable().optional(),
  shield: armor.nullable().optional(),
  weapons: z.array(weapon).max(50).optional(),
  slots: z.object(Object.fromEntries([...BODY_SLOTS, ...UNSLOTTED_SLOTS].map(key => [key, slot.nullable().optional()]))).strict().optional(),
}).strict();
