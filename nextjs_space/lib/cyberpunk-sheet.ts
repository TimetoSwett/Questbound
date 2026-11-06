// Shape of Character.cyberpunk (Prisma Json). Null for Pathfinder characters.
//
// v2 keeps the original top-level `stats`, `role`, and `skills` and adds the
// rest of the official sheet (issue #28). UIs should use the exported key
// constants below rather than retyping labels.
//
// Deviations from the issue #28 sketch, on purpose:
// - Armor is a fixed object keyed by CYBERPUNK_ARMOR_LOCATIONS, not an array.
//   Unique sheet labels and an array of {location|key, sp} are input aliases
//   only; stored JSON is always the keyed object. "Hand" and "Foot" are not
//   aliases because the sheet prints both sides with the same word.
// - Wounds are four booleans per column, keyed LIGHT, SERIOUS, CRITICAL,
//   MORTAL_0..MORTAL_6. The printed "MORTAL 0" form is an input alias.
// - Weapon magazine size is `rndCap` (printed column "#", meaning RND CAP).
//   The damage column is `dammage` (sheet spelling).
// - New sheets keep `skills: []` so existing create flows stay unchanged.
//   CYBERPUNK_DEFAULT_SKILLS plus addOfficialCyberpunkSkills() are the opt-in
//   official list. The five blank "Other" lines are not pre-named rows.
// - Stats default to 5. Every other number defaults to null. Explicit null
//   stays null and is never stored as 0. A missing stat key still resolves
//   to 5; a present 0 stays 0.
// - Special abilities are the closed list of ten, always in sheet order.
//   Unknown ability rows are dropped. Values overlay by name.
// - `derived` and `cyberneticsTotals` are stored as entered. Nothing here
//   recomputes Run/Leap/Carry/Lift from MA/BODY or totals from row sums.
// - Skill stat is one of CYBERPUNK_SKILL_GROUPS or OTHER. EMP (the character
//   stat spelling) and WILL (the "COOL / WILL" header) alias to EMPATHY and
//   COOL. Any other string, including LUCK and MA, becomes OTHER so both UIs
//   share one key set instead of preserving arbitrary stat labels.
// - Unknown top-level and row keys are omitted. There is no passthrough.
// - readCyberpunkSheet keeps numeric values as stored (no clamp) and fills
//   missing sections. sanitizeCyberpunkSheet clamps. Sanitize returns null
//   only when the payload is not a plain record. Read turns null, arrays,
//   and invalid JSON strings into defaultCyberpunkSheet().
//
// Sheet spellings stored verbatim: "Persuation & Fast Talk", "Pharmacuticals",
// "Operate Hvy. Machinery", lifepath "affections", "valuedPosession".

export const CYBERPUNK_STATS = ['INT', 'REF', 'TECH', 'COOL', 'ATTR', 'LUCK', 'MA', 'BODY', 'EMP'] as const;
export type CyberpunkStat = (typeof CYBERPUNK_STATS)[number];

export const CYBERPUNK_SKILL_GROUPS = ['ATTR', 'BODY', 'COOL', 'EMPATHY', 'INT', 'REF', 'TECH'] as const;
export type CyberpunkSkillGroup = (typeof CYBERPUNK_SKILL_GROUPS)[number];

/** Seven skill groups, plus OTHER for a custom or ungrouped skill. */
export type CyberpunkSkillStat = CyberpunkSkillGroup | 'OTHER';

export const CYBERPUNK_SKILL_GROUP_LABELS = {
  ATTR: 'ATTR',
  BODY: 'BODY',
  COOL: 'COOL / WILL',
  EMPATHY: 'EMPATHY',
  INT: 'INT',
  REF: 'REF',
  TECH: 'TECH',
} as const satisfies Record<CyberpunkSkillGroup, string>;

export const CYBERPUNK_ROLES = Object.freeze([
  'Solo', 'Rocker', 'Netrunner', 'Media', 'Nomad', 'Fixer', 'Cop', 'Corp', 'Techie', 'Medtechie',
] as const);
export type CyberpunkRole = (typeof CYBERPUNK_ROLES)[number];

export const CYBERPUNK_SPECIAL_ABILITIES = Object.freeze([
  'Authority',
  'Charismatic Leadership',
  'Combat Sense',
  'Credibility',
  'Family',
  'Interface',
  'Jury Rig',
  'Medical Tech',
  'Resources',
  'Streetdeal',
] as const);
export type CyberpunkSpecialAbilityName = (typeof CYBERPUNK_SPECIAL_ABILITIES)[number];

/** Display hint only. Sanitize does not auto-fill the ability for a role. */
export const CYBERPUNK_ROLE_SPECIAL_ABILITY = {
  Solo: 'Combat Sense',
  Rocker: 'Charismatic Leadership',
  Netrunner: 'Interface',
  Media: 'Credibility',
  Nomad: 'Family',
  Fixer: 'Streetdeal',
  Cop: 'Authority',
  Corp: 'Resources',
  Techie: 'Jury Rig',
  Medtechie: 'Medical Tech',
} as const satisfies Record<CyberpunkRole, CyberpunkSpecialAbilityName>;

export const CYBERPUNK_SKILLS_BY_GROUP = {
  ATTR: ['Personal Grooming', 'Wardrobe & Style'],
  BODY: ['Endurance', 'Strength Feat', 'Swimming'],
  COOL: ['Interrogation', 'Intimidate', 'Oratory', 'Resist Torture/Drugs', 'Streetwise'],
  EMPATHY: [
    'Human Perception', 'Interview', 'Leadership', 'Seduction', 'Social',
    'Persuation & Fast Talk', 'Perform',
  ],
  INT: [
    'Accounting', 'Anthropology', 'Awareness/Notice', 'Biology', 'Botany', 'Chemistry',
    'Composition', 'Diagnose Illness', 'Education & Gen Know', 'Expert', 'Gamble',
    'Geology', 'Hide/Evade', 'History', 'Language', 'Language', 'Language',
    'Library Search', 'Mathematics', 'Physics', 'Programming', 'Shadow/Track',
    'Stock Market', 'System Knowledge', 'Teaching', 'Wilderness Survival', 'Zoology',
  ],
  REF: [
    'Archery', 'Athletics', 'Brawling', 'Dance', 'Dodge & Escape', 'Driving', 'Fencing',
    'Handgun', 'Heavy Weapons', 'Martial Art 1', 'Martial Art 2', 'Martial Art 3',
    'Melee', 'Motorcycle', 'Operate Hvy. Machinery', 'Pilot (Gyro)', 'Pilot (Fixed Wing)',
    'Pilot (Dirigible)', 'Pilot (Vect.Thrust Vehicle)', 'Rifle', 'Stealth', 'Submachinegun',
  ],
  TECH: [
    'Aero Tech', 'AV Tech', 'Basic Tech', 'Cryotank Operation', 'Cyberdeck Design',
    'Cyber Tech', 'Demolitions', 'Disguise', 'Electronics', 'Elect. Security',
    'First Aid', 'Forgery', 'Gyro Tech', 'Paint or Draw', 'Photo & Film',
    'Pharmacuticals', 'Pick Lock', 'Pick Pocket', 'Play Instrument', 'Weaponsmith',
    'Weapons Tech',
  ],
} as const satisfies Record<CyberpunkSkillGroup, readonly string[]>;

export const CYBERPUNK_DERIVED_KEYS = ['run', 'leap', 'carry', 'lift'] as const;
export type CyberpunkDerivedKey = (typeof CYBERPUNK_DERIVED_KEYS)[number];
export const CYBERPUNK_DERIVED_LABELS = {
  run: 'Run', leap: 'Leap', carry: 'Carry', lift: 'Lift',
} as const satisfies Record<CyberpunkDerivedKey, string>;

export const CYBERPUNK_WOUND_COLUMNS = Object.freeze([
  'LIGHT', 'SERIOUS', 'CRITICAL',
  'MORTAL_0', 'MORTAL_1', 'MORTAL_2', 'MORTAL_3', 'MORTAL_4', 'MORTAL_5', 'MORTAL_6',
] as const);
export type CyberpunkWoundColumn = (typeof CYBERPUNK_WOUND_COLUMNS)[number];

export const CYBERPUNK_WOUND_COLUMN_INFO = {
  LIGHT: { label: 'LIGHT', stun: 0 },
  SERIOUS: { label: 'SERIOUS', stun: -1 },
  CRITICAL: { label: 'CRITICAL', stun: -2 },
  MORTAL_0: { label: 'MORTAL 0', stun: -3 },
  MORTAL_1: { label: 'MORTAL 1', stun: -4 },
  MORTAL_2: { label: 'MORTAL 2', stun: -5 },
  MORTAL_3: { label: 'MORTAL 3', stun: -6 },
  MORTAL_4: { label: 'MORTAL 4', stun: -7 },
  MORTAL_5: { label: 'MORTAL 5', stun: -8 },
  MORTAL_6: { label: 'MORTAL 6', stun: -9 },
} as const satisfies Record<CyberpunkWoundColumn, { label: string; stun: number }>;

export const CYBERPUNK_WOUND_BOXES = 4;

export const CYBERPUNK_ARMOR_LOCATIONS = Object.freeze([
  'skull', 'face', 'neck', 'torso', 'abdomen',
  'rArm', 'rHand', 'lArm', 'lHand',
  'rLeg', 'rFoot', 'lLeg', 'lFoot',
] as const);
export type CyberpunkArmorLocation = (typeof CYBERPUNK_ARMOR_LOCATIONS)[number];

/** Sheet label, plus side where the printed word ("Hand", "Foot") is shared. */
export const CYBERPUNK_ARMOR_LOCATION_INFO = {
  skull: { label: 'Skull' },
  face: { label: 'Face' },
  neck: { label: 'Neck' },
  torso: { label: 'Torso' },
  abdomen: { label: 'Abdomen' },
  rArm: { label: 'R. Arm' },
  rHand: { label: 'Hand', side: 'right' },
  lArm: { label: 'L.Arm' },
  lHand: { label: 'Hand', side: 'left' },
  rLeg: { label: 'R.Leg' },
  rFoot: { label: 'Foot', side: 'right' },
  lLeg: { label: 'L.Leg' },
  lFoot: { label: 'Foot', side: 'left' },
} as const satisfies Record<CyberpunkArmorLocation, { label: string; side?: 'right' | 'left' }>;

export const CYBERPUNK_LIFEPATH_FIELDS = [
  'style', 'clothes', 'hair', 'affections', 'ethnicity', 'language',
  'familyBackground', 'siblings', 'motivations', 'traits',
  'valuedPerson', 'valueMost', 'feelAboutPeople', 'valuedPosession',
] as const;
export type CyberpunkLifepathField = (typeof CYBERPUNK_LIFEPATH_FIELDS)[number];

export const CYBERPUNK_LIFEPATH_LABELS = {
  style: 'Style',
  clothes: 'Clothes',
  hair: 'Hair',
  affections: 'Affections',
  ethnicity: 'Ethnicity',
  language: 'Language',
  familyBackground: 'Family Background',
  siblings: '# Siblings',
  motivations: 'Motivations',
  traits: 'Traits',
  valuedPerson: 'Valued Person',
  valueMost: 'Value Most',
  feelAboutPeople: 'Feel About People',
  valuedPosession: 'Valued Posession',
} as const satisfies Record<CyberpunkLifepathField, string>;

export const CYBERPUNK_GEAR_COLUMNS = [
  { key: 'type', label: 'Type', kind: 'text' },
  { key: 'cost', label: 'Cost', kind: 'number' },
  { key: 'wt', label: 'Wt', kind: 'number' },
] as const;

export const CYBERPUNK_CYBERNETICS_COLUMNS = [
  { key: 'type', label: 'Type', kind: 'text' },
  { key: 'hl', label: 'HL', kind: 'number' },
  { key: 'cost', label: 'Cost', kind: 'number' },
] as const;

export const CYBERPUNK_WEAPON_COLUMNS = [
  { key: 'name', label: 'Name', kind: 'text' },
  { key: 'type', label: 'Type', kind: 'text' },
  { key: 'wa', label: 'WA', kind: 'number' },
  { key: 'con', label: 'Con', kind: 'text' },
  { key: 'avail', label: 'Avail', kind: 'text' },
  { key: 'dammage', label: 'Dammage', kind: 'text' },
  { key: 'ammo', label: 'Ammo', kind: 'text' },
  { key: 'rndCap', label: '#', title: 'RND CAP', kind: 'number' },
  { key: 'rof', label: 'ROF', kind: 'number' },
  { key: 'rel', label: 'Rel', kind: 'text' },
] as const;

export const CYBERPUNK_LIMITS = {
  skills: 200,
  cybernetics: 100,
  gear: 100,
  weapons: 100,
  lifeEvents: 100,
  text: {
    name: 100,
    line: 120,
    short: 40,
    lifepath: 400,
    lifepathLong: 2000,
    event: 500,
    drawingUrl: 2000,
  },
  stat: { min: 0, max: 10 },
  rank: { min: 0, max: 100 },
  btm: { min: -100, max: 100 },
  wa: { min: -20, max: 50 },
  age: { min: 0, max: 999 },
  year: { min: 0, max: 9999 },
  armor: { min: 0, max: 1000 },
  humanityLoss: { min: 0, max: 10000 },
  save: { min: 0, max: 1000 },
  counter: { min: 0, max: 1_000_000 },
  resource: { min: 0, max: 1_000_000_000_000 },
} as const;

/**
 * Request cap for one Character.cyberpunk JSON value.
 * Raised from 64 KiB: a sheet at the row caps (200 skills, 100 gear,
 * cybernetics, weapons, and life events) plus the text caps above is larger
 * than 64 KiB, so the old check would reject a full sheet before those caps
 * applied. 256 KiB still bounds the column. A fresh sheet and one seeded with
 * the official skill catalog stay under 64 KiB.
 */
export const CYBERPUNK_SHEET_MAX_BYTES = 256 * 1024;

export type CyberpunkSkill = {
  name: string;
  stat: CyberpunkSkillStat;
  value: number | null;
  chipped: boolean;
};

export type CyberpunkSpecialAbility = {
  name: CyberpunkSpecialAbilityName;
  value: number | null;
};

export type CyberpunkDerived = Record<CyberpunkDerivedKey, number | null>;
export type CyberpunkWounds = Record<CyberpunkWoundColumn, boolean[]>;
export type CyberpunkArmor = Record<CyberpunkArmorLocation, number | null>;

export type CyberpunkCybernetic = { type: string; hl: number | null; cost: number | null };
export type CyberpunkGearItem = { type: string; cost: number | null; wt: number | null };
export type CyberpunkWeapon = {
  name: string;
  type: string;
  wa: number | null;
  con: string;
  avail: string;
  dammage: string;
  ammo: string;
  rndCap: number | null;
  rof: number | null;
  rel: string;
};
export type CyberpunkLifeEvent = { year: number | null; event: string };
export type CyberpunkLifepath = Record<CyberpunkLifepathField, string> & {
  lifeEvents: CyberpunkLifeEvent[];
};

export type CyberpunkSheet = {
  handle: string;
  role: string;
  characterPoints: number | null;
  age: number | null;
  rep: number | null;
  currentIp: number | null;
  humanity: number | null;
  money: number | null;
  stats: Record<CyberpunkStat, number | null>;
  derived: CyberpunkDerived;
  specialAbilities: CyberpunkSpecialAbility[];
  skills: CyberpunkSkill[];
  save: number | null;
  btm: number | null;
  wounds: CyberpunkWounds;
  armor: CyberpunkArmor;
  cybernetics: CyberpunkCybernetic[];
  cyberneticsTotals: { hl: number | null; euro: number | null };
  gear: CyberpunkGearItem[];
  weapons: CyberpunkWeapon[];
  lifepath: CyberpunkLifepath;
  drawingUrl: string | null;
};

const SKILL_STAT_ALIASES: Record<string, CyberpunkSkillStat> = {
  ATTR: 'ATTR',
  BODY: 'BODY',
  COOL: 'COOL',
  WILL: 'COOL',
  EMPATHY: 'EMPATHY',
  EMP: 'EMPATHY',
  INT: 'INT',
  REF: 'REF',
  TECH: 'TECH',
  OTHER: 'OTHER',
};

const SPECIAL_ABILITY_BY_LOWER = new Map<string, CyberpunkSpecialAbilityName>(
  CYBERPUNK_SPECIAL_ABILITIES.map((name) => [name.toLowerCase(), name]),
);

const WOUND_KEYS = new Set<string>(CYBERPUNK_WOUND_COLUMNS);

function buildDefaultSkills(): readonly CyberpunkSkill[] {
  const skills: CyberpunkSkill[] = [];
  for (const stat of CYBERPUNK_SKILL_GROUPS) {
    for (const name of CYBERPUNK_SKILLS_BY_GROUP[stat]) {
      skills.push(Object.freeze({ name, stat, value: null, chipped: false }));
    }
  }
  return Object.freeze(skills);
}

/** Every named official skill, in sheet order. Three INT "Language" rows and Martial Art 1..3. */
export const CYBERPUNK_DEFAULT_SKILLS: readonly CyberpunkSkill[] = buildDefaultSkills();

function defaultStats(): Record<CyberpunkStat, number | null> {
  return { INT: 5, REF: 5, TECH: 5, COOL: 5, ATTR: 5, LUCK: 5, MA: 5, BODY: 5, EMP: 5 };
}

function defaultDerived(): CyberpunkDerived {
  return { run: null, leap: null, carry: null, lift: null };
}

function defaultSpecialAbilities(): CyberpunkSpecialAbility[] {
  return CYBERPUNK_SPECIAL_ABILITIES.map((name) => ({ name, value: null }));
}

function defaultWounds(): CyberpunkWounds {
  const wounds = {} as CyberpunkWounds;
  for (const column of CYBERPUNK_WOUND_COLUMNS) wounds[column] = [false, false, false, false];
  return wounds;
}

function defaultArmor(): CyberpunkArmor {
  const armor = {} as CyberpunkArmor;
  for (const location of CYBERPUNK_ARMOR_LOCATIONS) armor[location] = null;
  return armor;
}

function defaultLifepath(): CyberpunkLifepath {
  return {
    style: '', clothes: '', hair: '', affections: '', ethnicity: '', language: '',
    familyBackground: '', siblings: '', motivations: '', traits: '',
    valuedPerson: '', valueMost: '', feelAboutPeople: '', valuedPosession: '',
    lifeEvents: [],
  };
}

/** Fresh sheet: stats at 5, skills empty, every other number null. */
export function defaultCyberpunkSheet(): CyberpunkSheet {
  return {
    handle: '',
    role: '',
    characterPoints: null,
    age: null,
    rep: null,
    currentIp: null,
    humanity: null,
    money: null,
    stats: defaultStats(),
    derived: defaultDerived(),
    specialAbilities: defaultSpecialAbilities(),
    skills: [],
    save: null,
    btm: null,
    wounds: defaultWounds(),
    armor: defaultArmor(),
    cybernetics: [],
    cyberneticsTotals: { hl: null, euro: null },
    gear: [],
    weapons: [],
    lifepath: defaultLifepath(),
    drawingUrl: null,
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Map a skill stat onto the canonical group. Unknown strings become OTHER. */
export function normalizeCyberpunkSkillStat(value: unknown): CyberpunkSkillStat {
  if (typeof value !== 'string') return 'OTHER';
  const key = value.trim().toUpperCase();
  return SKILL_STAT_ALIASES[key] ?? 'OTHER';
}

/**
 * Place official skills in sheet order, keeping a matching row's value and
 * chipped flag (name + stat, so three Language rows stay three rows). Custom
 * skills follow the catalog. Does not drop a custom row and does not mutate
 * the input. sanitizeCyberpunkSheet still caps the saved list at 200.
 */
export function addOfficialCyberpunkSkills(skills: readonly {
  name: string;
  stat: string;
  value?: number | null;
  chipped?: boolean;
}[]): CyberpunkSkill[] {
  const remaining = skills.map((skill) => ({
    name: skill.name,
    stat: normalizeCyberpunkSkillStat(skill.stat),
    value: skill.value ?? null,
    chipped: skill.chipped === true,
  }));
  const used = new Set<number>();
  const official = CYBERPUNK_DEFAULT_SKILLS.map((template) => {
    const index = remaining.findIndex((skill, i) =>
      !used.has(i) && skill.name === template.name && skill.stat === template.stat);
    if (index === -1) return { name: template.name, stat: template.stat, value: null, chipped: false };
    used.add(index);
    return remaining[index];
  });
  const custom = remaining.filter((_, index) => !used.has(index));
  return [...official, ...custom];
}

type Mode = 'read' | 'sanitize';
type Range = { min: number; max: number };

function looseNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function pickNumber(value: unknown, mode: Mode, range: Range, integer: boolean): number | null {
  const parsed = looseNumber(value);
  if (parsed === null) return null;
  if (mode === 'read') return Object.is(parsed, -0) ? 0 : parsed;
  const rounded = integer ? Math.trunc(parsed) : parsed;
  const clamped = Math.min(range.max, Math.max(range.min, rounded));
  return Object.is(clamped, -0) ? 0 : clamped;
}

function cleanText(value: unknown, max: number, multiline: boolean): string {
  if (typeof value !== 'string') {
    if (!multiline && typeof value === 'number' && Number.isFinite(value)) {
      const text = Object.is(value, -0) ? '0' : String(value);
      return text.slice(0, max);
    }
    return '';
  }
  let text = '';
  for (const char of value) {
    if (char === '\n' || char === '\r' || char === '\t') text += multiline ? char : ' ';
    else if (char >= ' ') text += char;
  }
  return text.trim().slice(0, max);
}

function resolveWoundColumn(value: unknown): CyberpunkWoundColumn | null {
  if (typeof value !== 'string') return null;
  const compact = value.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (WOUND_KEYS.has(compact)) return compact as CyberpunkWoundColumn;
  const mortal = /^MORTAL_?([0-6])$/.exec(compact);
  if (!mortal) return null;
  const key = `MORTAL_${mortal[1]}`;
  return WOUND_KEYS.has(key) ? key as CyberpunkWoundColumn : null;
}

const ARMOR_ALIASES = new Map<string, CyberpunkArmorLocation>();
for (const location of CYBERPUNK_ARMOR_LOCATIONS) {
  const info = CYBERPUNK_ARMOR_LOCATION_INFO[location];
  ARMOR_ALIASES.set(location.toLowerCase(), location);
  // "Hand" and "Foot" are printed twice; only unique labels alias to a key.
  if (!('side' in info)) ARMOR_ALIASES.set(info.label.toLowerCase(), location);
}
ARMOR_ALIASES.set('r. hand', 'rHand');
ARMOR_ALIASES.set('l. hand', 'lHand');
ARMOR_ALIASES.set('right hand', 'rHand');
ARMOR_ALIASES.set('left hand', 'lHand');
ARMOR_ALIASES.set('r. foot', 'rFoot');
ARMOR_ALIASES.set('l. foot', 'lFoot');
ARMOR_ALIASES.set('right foot', 'rFoot');
ARMOR_ALIASES.set('left foot', 'lFoot');

function resolveArmorLocation(value: unknown): CyberpunkArmorLocation | null {
  if (typeof value !== 'string') return null;
  return ARMOR_ALIASES.get(value.trim().toLowerCase()) ?? null;
}

function readStats(value: unknown, mode: Mode): Record<CyberpunkStat, number | null> {
  const stats = defaultStats();
  if (!isPlainRecord(value)) return stats;
  for (const stat of CYBERPUNK_STATS) {
    if (!Object.prototype.hasOwnProperty.call(value, stat)) continue;
    stats[stat] = pickNumber(value[stat], mode, CYBERPUNK_LIMITS.stat, true);
  }
  return stats;
}

function readSkills(value: unknown, mode: Mode): CyberpunkSkill[] {
  if (!Array.isArray(value)) return [];
  const skills: CyberpunkSkill[] = [];
  for (const entry of value) {
    if (skills.length >= CYBERPUNK_LIMITS.skills) break;
    if (!isPlainRecord(entry)) continue;
    const name = cleanText(entry.name, CYBERPUNK_LIMITS.text.name, false);
    if (!name) continue;
    skills.push({
      name,
      stat: normalizeCyberpunkSkillStat(entry.stat),
      value: pickNumber(entry.value, mode, CYBERPUNK_LIMITS.rank, true),
      chipped: entry.chipped === true,
    });
  }
  return skills;
}

function readSpecialAbilities(value: unknown, mode: Mode): CyberpunkSpecialAbility[] {
  const values = new Map<CyberpunkSpecialAbilityName, number | null>();
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (!isPlainRecord(entry)) continue;
      const name = cleanText(entry.name, CYBERPUNK_LIMITS.text.line, false);
      const canonical = SPECIAL_ABILITY_BY_LOWER.get(name.toLowerCase());
      if (!canonical) continue;
      values.set(canonical, pickNumber(entry.value, mode, CYBERPUNK_LIMITS.rank, true));
    }
  }
  return CYBERPUNK_SPECIAL_ABILITIES.map((name) => ({
    name,
    value: values.has(name) ? values.get(name) ?? null : null,
  }));
}

function readWoundBoxes(value: unknown): boolean[] {
  const boxes = [false, false, false, false];
  if (!Array.isArray(value)) return boxes;
  for (let i = 0; i < CYBERPUNK_WOUND_BOXES && i < value.length; i += 1) boxes[i] = value[i] === true;
  return boxes;
}

function readWounds(value: unknown): CyberpunkWounds {
  const wounds = defaultWounds();
  if (!isPlainRecord(value)) return wounds;
  for (const [rawKey, rawBoxes] of Object.entries(value)) {
    const column = resolveWoundColumn(rawKey);
    if (column) wounds[column] = readWoundBoxes(rawBoxes);
  }
  return wounds;
}

function assignArmor(armor: CyberpunkArmor, rawKey: unknown, rawSp: unknown, mode: Mode) {
  const location = resolveArmorLocation(rawKey);
  if (!location) return;
  armor[location] = pickNumber(rawSp, mode, CYBERPUNK_LIMITS.armor, true);
}

function readArmor(value: unknown, mode: Mode): CyberpunkArmor {
  const armor = defaultArmor();
  if (isPlainRecord(value)) {
    for (const [rawKey, rawSp] of Object.entries(value)) assignArmor(armor, rawKey, rawSp, mode);
    return armor;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (!isPlainRecord(entry)) continue;
      const rawSp = Object.prototype.hasOwnProperty.call(entry, 'sp') ? entry.sp : entry.value;
      assignArmor(armor, entry.location ?? entry.key, rawSp, mode);
    }
  }
  return armor;
}

function readCybernetics(value: unknown, mode: Mode): CyberpunkCybernetic[] {
  if (!Array.isArray(value)) return [];
  const rows: CyberpunkCybernetic[] = [];
  for (const entry of value) {
    if (rows.length >= CYBERPUNK_LIMITS.cybernetics) break;
    if (!isPlainRecord(entry)) continue;
    const row: CyberpunkCybernetic = {
      type: cleanText(entry.type, CYBERPUNK_LIMITS.text.line, false),
      hl: pickNumber(entry.hl, mode, CYBERPUNK_LIMITS.humanityLoss, false),
      cost: pickNumber(entry.cost, mode, CYBERPUNK_LIMITS.resource, false),
    };
    if (!row.type && row.hl === null && row.cost === null) continue;
    rows.push(row);
  }
  return rows;
}

function readGear(value: unknown, mode: Mode): CyberpunkGearItem[] {
  if (!Array.isArray(value)) return [];
  const rows: CyberpunkGearItem[] = [];
  for (const entry of value) {
    if (rows.length >= CYBERPUNK_LIMITS.gear) break;
    if (!isPlainRecord(entry)) continue;
    const row: CyberpunkGearItem = {
      type: cleanText(entry.type, CYBERPUNK_LIMITS.text.line, false),
      cost: pickNumber(entry.cost, mode, CYBERPUNK_LIMITS.resource, false),
      wt: pickNumber(entry.wt, mode, CYBERPUNK_LIMITS.resource, false),
    };
    if (!row.type && row.cost === null && row.wt === null) continue;
    rows.push(row);
  }
  return rows;
}

function readWeapons(value: unknown, mode: Mode): CyberpunkWeapon[] {
  if (!Array.isArray(value)) return [];
  const rows: CyberpunkWeapon[] = [];
  for (const entry of value) {
    if (rows.length >= CYBERPUNK_LIMITS.weapons) break;
    if (!isPlainRecord(entry)) continue;
    const row: CyberpunkWeapon = {
      name: cleanText(entry.name, CYBERPUNK_LIMITS.text.name, false),
      type: cleanText(entry.type, CYBERPUNK_LIMITS.text.short, false),
      wa: pickNumber(entry.wa, mode, CYBERPUNK_LIMITS.wa, true),
      con: cleanText(entry.con, CYBERPUNK_LIMITS.text.short, false),
      avail: cleanText(entry.avail, CYBERPUNK_LIMITS.text.short, false),
      dammage: cleanText(entry.dammage, CYBERPUNK_LIMITS.text.short, false),
      ammo: cleanText(entry.ammo, CYBERPUNK_LIMITS.text.short, false),
      rndCap: pickNumber(entry.rndCap, mode, CYBERPUNK_LIMITS.counter, true),
      rof: pickNumber(entry.rof, mode, CYBERPUNK_LIMITS.counter, true),
      rel: cleanText(entry.rel, CYBERPUNK_LIMITS.text.short, false),
    };
    const empty = !row.name && !row.type && row.wa === null && !row.con && !row.avail
      && !row.dammage && !row.ammo && row.rndCap === null && row.rof === null && !row.rel;
    if (!empty) rows.push(row);
  }
  return rows;
}

function lifepathMax(field: CyberpunkLifepathField): number {
  if (field === 'familyBackground' || field === 'motivations') return CYBERPUNK_LIMITS.text.lifepathLong;
  if (field === 'siblings') return CYBERPUNK_LIMITS.text.short;
  return CYBERPUNK_LIMITS.text.lifepath;
}

function readLifepath(value: unknown, mode: Mode): CyberpunkLifepath {
  const lifepath = defaultLifepath();
  const source = isPlainRecord(value) ? value : {};
  for (const field of CYBERPUNK_LIFEPATH_FIELDS) {
    const multiline = field === 'familyBackground' || field === 'motivations' || field === 'traits';
    lifepath[field] = cleanText(source[field], lifepathMax(field), multiline);
  }
  const events: CyberpunkLifeEvent[] = [];
  if (Array.isArray(source.lifeEvents)) {
    for (const entry of source.lifeEvents) {
      if (events.length >= CYBERPUNK_LIMITS.lifeEvents) break;
      if (!isPlainRecord(entry)) continue;
      const event: CyberpunkLifeEvent = {
        year: pickNumber(entry.year, mode, CYBERPUNK_LIMITS.year, true),
        event: cleanText(entry.event, CYBERPUNK_LIMITS.text.event, true),
      };
      if (event.year === null && !event.event) continue;
      events.push(event);
    }
  }
  lifepath.lifeEvents = events;
  return lifepath;
}

function readDerived(value: unknown, mode: Mode): CyberpunkDerived {
  const derived = defaultDerived();
  if (!isPlainRecord(value)) return derived;
  for (const key of CYBERPUNK_DERIVED_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    derived[key] = pickNumber(value[key], mode, CYBERPUNK_LIMITS.resource, false);
  }
  return derived;
}

function readDrawingUrl(value: unknown): string | null {
  const text = cleanText(value, CYBERPUNK_LIMITS.text.drawingUrl, false);
  return text ? text : null;
}

function normalizeSheet(record: Record<string, unknown>, mode: Mode): CyberpunkSheet {
  const totals = isPlainRecord(record.cyberneticsTotals) ? record.cyberneticsTotals : {};
  return {
    handle: cleanText(record.handle, CYBERPUNK_LIMITS.text.name, false),
    role: cleanText(record.role, CYBERPUNK_LIMITS.text.name, false),
    characterPoints: pickNumber(record.characterPoints, mode, CYBERPUNK_LIMITS.counter, true),
    age: pickNumber(record.age, mode, CYBERPUNK_LIMITS.age, true),
    rep: pickNumber(record.rep, mode, CYBERPUNK_LIMITS.counter, true),
    currentIp: pickNumber(record.currentIp, mode, CYBERPUNK_LIMITS.counter, true),
    humanity: pickNumber(record.humanity, mode, CYBERPUNK_LIMITS.counter, false),
    money: pickNumber(record.money, mode, CYBERPUNK_LIMITS.resource, false),
    stats: readStats(record.stats, mode),
    derived: readDerived(record.derived, mode),
    specialAbilities: readSpecialAbilities(record.specialAbilities, mode),
    skills: readSkills(record.skills, mode),
    save: pickNumber(record.save, mode, CYBERPUNK_LIMITS.save, true),
    btm: pickNumber(record.btm, mode, CYBERPUNK_LIMITS.btm, true),
    wounds: readWounds(record.wounds),
    armor: readArmor(record.armor, mode),
    cybernetics: readCybernetics(record.cybernetics, mode),
    cyberneticsTotals: {
      hl: pickNumber(totals.hl, mode, CYBERPUNK_LIMITS.humanityLoss, false),
      euro: pickNumber(totals.euro, mode, CYBERPUNK_LIMITS.resource, false),
    },
    gear: readGear(record.gear, mode),
    weapons: readWeapons(record.weapons, mode),
    lifepath: readLifepath(record.lifepath, mode),
    drawingUrl: readDrawingUrl(record.drawingUrl),
  };
}

/**
 * Read a stored blob. Invalid JSON strings, null, and arrays become a default
 * sheet. Numbers already stored are kept, including values sanitize would clamp.
 * Legacy `{ stats, role, skills: { name, stat, value } }` gains chipped:false
 * and the empty v2 sections without resetting stats, role, or skill values.
 */
export function readCyberpunkSheet(value: unknown): CyberpunkSheet {
  let raw: unknown = value;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { return defaultCyberpunkSheet(); }
  }
  if (!isPlainRecord(raw)) return defaultCyberpunkSheet();
  return normalizeSheet(raw, 'read');
}

/**
 * Clean an untrusted payload. Returns null only when the payload is not a
 * plain record (null, arrays, and class instances). Nested junk is skipped.
 * Known numeric blanks stay null. Stats clamp to 0..10, ranks and resources
 * to the ranges in CYBERPUNK_LIMITS. Negative BTM and WA are allowed.
 */
export function sanitizeCyberpunkSheet(value: unknown): CyberpunkSheet | null {
  if (!isPlainRecord(value)) return null;
  return normalizeSheet(value, 'sanitize');
}
