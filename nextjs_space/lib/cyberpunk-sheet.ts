// Shape of Character.cyberpunk, the Cyberpunk 2020 sheet data.

export const CYBERPUNK_STATS = ['INT', 'REF', 'TECH', 'COOL', 'ATTR', 'LUCK', 'MA', 'BODY', 'EMP'] as const;

export type CyberpunkStat = (typeof CYBERPUNK_STATS)[number];

export type CyberpunkSkill = { name: string; stat: string; value: number };

export type CyberpunkSheet = {
  stats: {
    INT: number;
    REF: number;
    TECH: number;
    COOL: number;
    ATTR: number;
    LUCK: number;
    MA: number;
    BODY: number;
    EMP: number;
  };
  role: string;
  skills: CyberpunkSkill[];
};

export function defaultCyberpunkSheet(): CyberpunkSheet {
  return {
    stats: { INT: 5, REF: 5, TECH: 5, COOL: 5, ATTR: 5, LUCK: 5, MA: 5, BODY: 5, EMP: 5 },
    role: '',
    skills: [],
  };
}

/** Unsaved / missing sheet. Stats stay at 0 so the UI does not invent the 5s in defaultCyberpunkSheet. */
export function emptyCyberpunkSheet(): CyberpunkSheet {
  return {
    stats: { INT: 0, REF: 0, TECH: 0, COOL: 0, ATTR: 0, LUCK: 0, MA: 0, BODY: 0, EMP: 0 },
    role: '',
    skills: [],
  };
}

function finiteNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

/** Read a stored cyberpunk blob. Null, missing, or malformed data becomes the empty sheet (stats 0). Saved numbers are kept as stored. */
export function readCyberpunkSheet(value: unknown): CyberpunkSheet {
  const empty = emptyCyberpunkSheet();
  let raw: unknown = value;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { return empty; }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty;

  const record = raw as Record<string, unknown>;
  const statsRecord = record.stats && typeof record.stats === 'object' && !Array.isArray(record.stats)
    ? record.stats as Record<string, unknown>
    : null;
  const stats = { ...empty.stats };
  if (statsRecord) {
    for (const stat of CYBERPUNK_STATS) {
      if (Object.prototype.hasOwnProperty.call(statsRecord, stat)) stats[stat] = finiteNumber(statsRecord[stat], 0);
    }
  }

  const skills = Array.isArray(record.skills)
    ? record.skills.flatMap((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
      const row = entry as Record<string, unknown>;
      const stat = typeof row.stat === 'string' && row.stat.trim() ? row.stat : 'REF';
      return [{
        name: typeof row.name === 'string' ? row.name : '',
        stat,
        value: finiteNumber(row.value, 0),
      }];
    })
    : [];

  return {
    stats,
    role: typeof record.role === 'string' ? record.role : '',
    skills,
  };
}
