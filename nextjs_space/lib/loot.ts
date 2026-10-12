// Pure loot rules. Quantities are nonnegative; at most 100 dice with 1,000 sides.
export const MAX_QUANTITY = 100_000;
export const MAX_CP = 2_147_483_647;
export type Rng = () => number;
export type LootEntry = {
  kind: 'item' | 'coins'; name: string; quantity: string;
  valueGp: number; weight: number; notes: string;
};
export type WeightedLootEntry = LootEntry & { chance: number };
export type LootTable = { rolls: number; entries: WeightedLootEntry[] };
export type LootItem = Omit<LootEntry, 'kind' | 'quantity'> & { quantity: number };

export function parseDice(expression: string): { count: number; sides: number; bonus: number; max: number } {
  if (typeof expression !== 'string' || expression.length > 30) throw new Error('Invalid quantity');
  if (/^(0|[1-9]\d*)$/.test(expression)) {
    const bonus = Number(expression);
    if (bonus > MAX_QUANTITY) throw new Error('Quantity exceeds 100,000');
    return { count: 0, sides: 0, bonus, max: bonus };
  }
  const match = /^([1-9]\d*)d([1-9]\d*)(?:\+(0|[1-9]\d*))?$/.exec(expression);
  if (!match) throw new Error('Use a number, NdN, or NdN+N');
  const count = Number(match[1]), sides = Number(match[2]), bonus = Number(match[3] ?? 0);
  const max = count * sides + bonus;
  if (count > 100 || sides > 1_000 || max > MAX_QUANTITY) throw new Error('Dice exceed quantity limits');
  return { count, sides, bonus, max };
}

function random(rng: Rng): number {
  const value = rng();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('RNG must return a number in [0, 1)');
  return value;
}

export function rollDice(expression: string, rng: Rng = Math.random): number {
  const { count, sides, bonus } = parseDice(expression);
  let total = bonus;
  for (let i = 0; i < count; i++) total += 1 + Math.floor(random(rng) * sides);
  return total;
}

export function weightedPick<T extends { chance: number }>(entries: readonly T[], rng: Rng = Math.random): T | null {
  if (entries.some(e => !Number.isSafeInteger(e.chance) || e.chance < 0 || e.chance > 1_000_000)) throw new Error('Invalid chance weight');
  const total = entries.reduce((sum, e) => sum + e.chance, 0);
  if (!total) return null;
  if (!Number.isSafeInteger(total)) throw new Error('Invalid total weight');
  let draw = random(rng) * total;
  for (const entry of entries) {
    draw -= entry.chance;
    if (draw < 0) return entry;
  }
  throw new Error('Invalid weighted draw');
}

export function rollLoot(table: LootTable | null, lootList: readonly LootEntry[], rng: Rng = Math.random): { items: LootItem[]; cp: number } {
  if (lootList.length > 200 || (table && (table.entries.length > 200 || !Number.isInteger(table.rolls) || table.rolls < 0 || table.rolls > 100))) throw new Error('Loot exceeds limits');
  const items: LootItem[] = [];
  let cp = 0;
  const add = (entry: LootEntry) => {
    if (!['item', 'coins'].includes(entry.kind) || !Number.isFinite(entry.valueGp) || entry.valueGp < 0 || entry.valueGp > 1_000_000 || !Number.isFinite(entry.weight) || entry.weight < 0 || entry.weight > 1_000_000 || typeof entry.name !== 'string' || (entry.kind === 'item' && !entry.name.trim()) || typeof entry.notes !== 'string') throw new Error('Invalid loot entry');
    const quantity = rollDice(entry.quantity, rng);
    if (entry.kind === 'coins') {
      // Round the total to the nearest copper, avoiding fractional party balances.
      cp += Math.round(quantity * entry.valueGp * 100);
      if (!Number.isSafeInteger(cp) || cp > MAX_CP) throw new Error('Coin total exceeds copper limit');
    } else if (quantity > 0) {
      items.push({ name: entry.name, quantity, valueGp: entry.valueGp, weight: entry.weight, notes: entry.notes });
    }
  };
  for (const entry of lootList) add(entry);
  if (table) for (let i = 0; i < table.rolls; i++) {
    const entry = weightedPick(table.entries, rng);
    if (entry) add(entry);
  }
  return { items, cp };
}
