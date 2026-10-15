export const ABILITY_SOURCES = ['class', 'item', 'sla', 'other'] as const;
export const ABILITY_RESETS = ['day', 'encounter', 'week', 'none'] as const;

export function newAbilityId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || Object.getPrototypeOf(prototype) === null;
}

function boundedInt(value: unknown, fallback: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(0, Math.trunc(value))) : fallback;
}

const EXTRA_SANITIZERS: Record<string, (value: unknown) => unknown | undefined> = {
  coins(value) {
    if (!isPlainObject(value)) return undefined;
    const coins: Record<string, number> = {};
    for (const key of ['pp', 'gp', 'sp', 'cp']) {
      const amount = value[key] === undefined ? 0 : value[key];
      if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 0 || amount > 1e9) return undefined;
      coins[key] = amount;
    }
    return coins;
  },
  abilities(value) {
    if (!Array.isArray(value)) return undefined;
    const ids = new Set<string>();
    return value.filter(isPlainObject).slice(0, 100).map(ability => {
      let id = typeof ability.id === 'string' ? ability.id : '';
      if (typeof id !== 'string' || id.length < 1 || id.length > 100 || ids.has(id)) {
        do { id = newAbilityId(); } while (ids.has(id));
      }
      ids.add(id);
      const max = boundedInt(ability.max, 1, 1000);
      return {
        id,
        name: typeof ability.name === 'string' ? ability.name.trim().slice(0, 120) : '',
        notes: typeof ability.notes === 'string' ? ability.notes.slice(0, 2000) : '',
        source: ABILITY_SOURCES.find(source => source === ability.source) ?? 'class',
        reset: ABILITY_RESETS.find(reset => reset === ability.reset) ?? 'day',
        max,
        used: boundedInt(ability.used, 0, max),
      };
    });
  },
};

export function sanitizeSpellsExtras(spells: Record<string, unknown>): void {
  for (const [key, sanitize] of Object.entries(EXTRA_SANITIZERS)) {
    if (!Object.prototype.hasOwnProperty.call(spells, key)) continue;
    const value = sanitize(spells[key]);
    if (value === undefined) delete spells[key];
    else spells[key] = value;
  }
}
