import { z } from 'zod';
import { parseDice, MAX_CP } from './loot';

export const lootId = z.string().min(1).max(200);
const quantity = z.string().max(30).superRefine((value, ctx) => {
  try { parseDice(value); } catch (error) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: error instanceof Error ? error.message : 'Invalid quantity' });
  }
});
const fields = {
  kind: z.enum(['item', 'coins']),
  name: z.string().trim().max(200).default(''),
  quantity,
  valueGp: z.number().finite().min(0).max(1_000_000),
  weight: z.number().finite().min(0).max(1_000_000),
  notes: z.string().max(10_000).default(''),
};
const validName = (entry: { kind: string; name: string }) => entry.kind !== 'item' || entry.name.length > 0;
export const lootEntrySchema = z.object(fields).strict().refine(validName, 'Items need a name');
export const weightedEntrySchema = z.object({ ...fields, chance: z.number().int().min(0).max(1_000_000) }).strict().refine(validName, 'Items need a name');
export const lootListSchema = z.array(lootEntrySchema).max(200);
export const lootTableSchema = z.object({
  name: z.string().trim().min(1).max(200),
  rolls: z.number().int().min(0).max(100),
  entries: z.array(weightedEntrySchema).max(200),
}).strict().refine(table => table.rolls === 0 || table.entries.some(e => e.chance > 0), 'A rolling table needs a positive weight');

// Reject configurations whose maximum possible coin reward overflows the DB Int.
export function maxLootCp(entries: readonly { kind: string; quantity: string; valueGp: number }[]): number {
  return entries.reduce((sum, e) => sum + (e.kind === 'coins' ? Math.round(parseDice(e.quantity).max * e.valueGp * 100) : 0), 0);
}
export function validCoinBudget(table: z.infer<typeof lootTableSchema> | null, list: z.infer<typeof lootListSchema>): boolean {
  const tableMax = table ? Math.max(0, ...table.entries.filter(e => e.chance > 0).map(e => maxLootCp([e]))) * table.rolls : 0;
  return tableMax + maxLootCp(list) <= MAX_CP;
}
