// Shape of Character.cyberpunk, the Cyberpunk 2020 sheet data.
// Stored as a Prisma Json value; null for pf1e characters and for
// cyberpunk characters that have not saved a sheet yet.

export const CYBERPUNK_STATS = ['INT', 'REF', 'TECH', 'COOL', 'ATTR', 'LUCK', 'MA', 'BODY', 'EMP'] as const;

export type CyberpunkStat = (typeof CYBERPUNK_STATS)[number];

export type CyberpunkSkill = { name: string; stat: string; value: number };

export type CyberpunkSheet = {
  stats: Record<CyberpunkStat, number>;
  role: string;
  skills: CyberpunkSkill[];
};

// Fresh sheets start at 5 in every stat, with no role and no skills
// (Crok's original defaults).
export function defaultCyberpunkSheet(): CyberpunkSheet {
  return {
    stats: { INT: 5, REF: 5, TECH: 5, COOL: 5, ATTR: 5, LUCK: 5, MA: 5, BODY: 5, EMP: 5 },
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

/** Read a stored cyberpunk blob. Null, missing, or malformed data becomes defaultCyberpunkSheet(). Saved numbers are kept as stored. */
export function readCyberpunkSheet(value: unknown): CyberpunkSheet {
  const empty = defaultCyberpunkSheet();
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

function clampStat(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(10, Math.trunc(value)));
}

// Clean an untrusted payload into a sheet, dropping unknown keys and
// clamping out-of-range numbers. Returns null when the payload is not
// a plain object (null is handled by the caller, not here).
export function sanitizeCyberpunkSheet(value: unknown): CyberpunkSheet | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const rawStats = (raw.stats && typeof raw.stats === 'object' && !Array.isArray(raw.stats))
    ? (raw.stats as Record<string, unknown>)
    : {};
  const stats = Object.fromEntries(
    CYBERPUNK_STATS.map((stat) => [stat, clampStat(rawStats[stat])]),
  ) as Record<CyberpunkStat, number>;
  const skills = Array.isArray(raw.skills)
    ? raw.skills
      .filter((skill): skill is Record<string, unknown> =>
        !!skill && typeof skill === 'object' && !Array.isArray(skill))
      .map((skill) => ({
        name: typeof skill.name === 'string' ? skill.name.trim().slice(0, 100) : '',
        stat: typeof skill.stat === 'string' ? skill.stat.trim().slice(0, 10) : '',
        value: clampStat(skill.value),
      }))
      .filter((skill) => skill.name.length > 0)
      .slice(0, 200)
    : [];
  return {
    stats,
    role: typeof raw.role === 'string' ? raw.role.trim().slice(0, 100) : '',
    skills,
  };
}
