// Common conditions and buffs. Same-type bonuses do not stack (the highest
// counts). Penalties stack. A group keeps only the first listed toggle, so
// exhausted replaces fatigued when both were saved.
import { adjustmentFromBonuses, namedGear, type AbilityName, type Adjustment, type Equipped, type ItemBonus, type SaveBonusName } from './equipment';

export type StackKind = 'untyped' | 'penalty' | 'dodge' | 'morale' | 'enhancement' | 'size' | 'luck' | 'circumstance';
type Mod = { amount: number; stack: StackKind };
type SaveKey = SaveBonusName | 'all';

export interface Toggle {
  id: string;
  label: string;
  section: 'condition' | 'buff';
  group?: string;
  detail: string;
  ability?: Partial<Record<AbilityName, Mod>>;
  attack?: Mod[];
  damage?: Mod[];
  saves?: Partial<Record<SaveKey, Mod>>;
  skills?: Mod[];
  dodge?: number;
  acPenalty?: number;
  init?: Mod[];
  cmb?: number;
  loseDex?: boolean;
}

const penalty = (amount: number): Mod => ({ amount, stack: 'penalty' });
const morale = (amount: number): Mod => ({ amount, stack: 'morale' });
const untyped = (amount: number): Mod => ({ amount, stack: 'untyped' });

export const TOGGLES: Toggle[] = [
  { id: 'exhausted', label: 'Exhausted', section: 'condition', group: 'fatigue', detail: 'Replaces fatigued. −6 Strength and Dexterity. Cannot run or charge.', ability: { str: penalty(-6), dex: penalty(-6) } },
  { id: 'fatigued', label: 'Fatigued', section: 'condition', group: 'fatigue', detail: '−2 Strength and Dexterity. Cannot run or charge.', ability: { str: penalty(-2), dex: penalty(-2) } },
  { id: 'sickened', label: 'Sickened', section: 'condition', detail: '−2 on attacks, weapon damage, saves, and skills.', attack: [penalty(-2)], damage: [penalty(-2)], saves: { all: penalty(-2) }, skills: [penalty(-2)] },
  { id: 'frightened', label: 'Frightened', section: 'condition', group: 'fear', detail: 'Same −2 as shaken, and you have to flee.', attack: [penalty(-2)], saves: { all: penalty(-2) }, skills: [penalty(-2)] },
  { id: 'shaken', label: 'Shaken', section: 'condition', group: 'fear', detail: '−2 on attacks, saves, and skills.', attack: [penalty(-2)], saves: { all: penalty(-2) }, skills: [penalty(-2)] },
  { id: 'dazzled', label: 'Dazzled', section: 'condition', detail: '−1 on attacks.', attack: [penalty(-1)] },
  { id: 'entangled', label: 'Entangled', section: 'condition', detail: '−4 Dexterity and −2 on attacks.', ability: { dex: penalty(-4) }, attack: [penalty(-2)] },
  { id: 'pinned', label: 'Pinned', section: 'condition', group: 'grapple', detail: 'Grappled, plus another −4 AC.', ability: { dex: penalty(-4) }, attack: [penalty(-2)], cmb: -2, acPenalty: -4 },
  { id: 'grappled', label: 'Grappled', section: 'condition', group: 'grapple', detail: '−4 Dexterity. −2 on attacks and combat maneuvers.', ability: { dex: penalty(-4) }, attack: [penalty(-2)], cmb: -2 },
  { id: 'prone', label: 'Prone', section: 'condition', detail: '−4 AC against melee. A ranged attack against you takes −4 instead of you losing AC.', acPenalty: -4 },
  { id: 'flat-footed', label: 'Flat-footed', section: 'condition', detail: 'You lose your Dexterity bonus to AC. A penalty still applies.', loseDex: true },
  { id: 'stunned', label: 'Stunned', section: 'condition', detail: 'Lose your Dexterity bonus to AC, and −2 AC.', loseDex: true, acPenalty: -2 },
  { id: 'blinded', label: 'Blinded', section: 'condition', detail: 'Lose your Dexterity bonus to AC, −2 AC, and a 50% miss chance.', loseDex: true, acPenalty: -2 },
  { id: 'cowering', label: 'Cowering', section: 'condition', detail: 'Lose your Dexterity bonus to AC, and −2 AC.', loseDex: true, acPenalty: -2 },
  { id: 'deafened', label: 'Deafened', section: 'condition', detail: '−4 initiative. Spells can fail 20% of the time; that chance is not added here.', init: [penalty(-4)] },
  { id: 'heroism-greater', label: 'Greater heroism', section: 'buff', group: 'heroism', detail: 'Replaces heroism. +4 morale on attacks, saves, and skills.', attack: [morale(4)], saves: { all: morale(4) }, skills: [morale(4)] },
  { id: 'heroism', label: 'Heroism', section: 'buff', group: 'heroism', detail: '+2 morale on attacks, saves, and skills.', attack: [morale(2)], saves: { all: morale(2) }, skills: [morale(2)] },
  { id: 'bless', label: 'Bless', section: 'buff', detail: '+1 morale on attacks. The save bonus is only against fear; this adds +1 to every save.', attack: [morale(1)], saves: { all: morale(1) } },
  { id: 'bane', label: 'Bane', section: 'buff', detail: '−1 on attacks. The save penalty is only against fear; this subtracts 1 from every save.', attack: [penalty(-1)], saves: { all: penalty(-1) } },
  { id: 'inspire', label: 'Inspire courage +1', section: 'buff', detail: '+1 morale on attacks and saves. It does not stack with bless or heroism.', attack: [morale(1)], saves: { all: morale(1) } },
  { id: 'haste', label: 'Haste', section: 'buff', detail: '+1 attack, +1 dodge AC, and +1 Reflex.', attack: [untyped(1)], dodge: 1, saves: { ref: untyped(1) } },
  { id: 'rage', label: 'Rage', section: 'buff', detail: '+4 Strength and Constitution, +2 Will, and −2 AC.', ability: { str: morale(4), con: morale(4) }, saves: { will: morale(2) }, acPenalty: -2 },
  { id: 'enlarge', label: 'Enlarge person', section: 'buff', group: 'size', detail: '+2 Strength, −2 Dexterity, −1 attack, and −1 AC.', ability: { str: { amount: 2, stack: 'size' }, dex: { amount: -2, stack: 'size' } }, attack: [{ amount: -1, stack: 'size' }], acPenalty: -1 },
  { id: 'reduce', label: 'Reduce person', section: 'buff', group: 'size', detail: '−2 Strength, +2 Dexterity, +1 attack, and +1 AC.', ability: { str: { amount: -2, stack: 'size' }, dex: { amount: 2, stack: 'size' } }, attack: [{ amount: 1, stack: 'size' }], acPenalty: 1 },
  { id: 'prayer', label: 'Prayer', section: 'buff', detail: '+1 luck on attacks, damage, saves, and skills.', attack: [{ amount: 1, stack: 'luck' }], damage: [{ amount: 1, stack: 'luck' }], saves: { all: { amount: 1, stack: 'luck' } }, skills: [{ amount: 1, stack: 'luck' }] },
  { id: 'flanking', label: 'Flanking', section: 'buff', detail: '+2 circumstance on attacks against the flanked creature.', attack: [{ amount: 2, stack: 'circumstance' }] },
];

export function foldStacks(entries: Mod[]): number {
  let total = 0;
  const bonus = new Map<string, number>();
  const penalized = new Map<string, number>();
  for (const entry of entries) {
    if (!entry.amount) continue;
    if (entry.stack === 'untyped' || entry.stack === 'penalty' || entry.stack === 'dodge') {
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

export function activeToggles(ids: string[]): Toggle[] {
  const wanted = new Set(ids);
  const grouped = new Map<string, Toggle>();
  const picked: Toggle[] = [];
  for (const toggle of TOGGLES) {
    if (!wanted.has(toggle.id)) continue;
    if (!toggle.group) picked.push(toggle);
    else if (!grouped.has(toggle.group)) grouped.set(toggle.group, toggle);
  }
  return [...picked, ...grouped.values()];
}

export function resolveToggles(ids: string[]) {
  const active = activeToggles(ids);
  const ability: Record<AbilityName, Mod[]> = { str: [], dex: [], con: [], int: [], wis: [], cha: [] };
  const attack: Mod[] = [];
  const damage: Mod[] = [];
  const skills: Mod[] = [];
  const init: Mod[] = [];
  const saves: Record<SaveBonusName, Mod[]> = { fort: [], ref: [], will: [] };
  let dodge = 0, acPenalty = 0, cmb = 0, loseDex = false;
  for (const toggle of active) {
    for (const key of Object.keys(ability) as AbilityName[]) {
      const mod = toggle.ability?.[key];
      if (mod) ability[key].push(mod);
    }
    attack.push(...(toggle.attack ?? []));
    damage.push(...(toggle.damage ?? []));
    skills.push(...(toggle.skills ?? []));
    init.push(...(toggle.init ?? []));
    for (const key of ['fort', 'ref', 'will'] as const) {
      const own = toggle.saves?.[key];
      const all = toggle.saves?.all;
      if (own) saves[key].push(own);
      if (all) saves[key].push(all);
    }
    dodge += toggle.dodge ?? 0;
    acPenalty += toggle.acPenalty ?? 0;
    cmb += toggle.cmb ?? 0;
    loseDex = loseDex || !!toggle.loseDex;
  }
  return {
    active,
    ability: { str: foldStacks(ability.str), dex: foldStacks(ability.dex), con: foldStacks(ability.con), int: foldStacks(ability.int), wis: foldStacks(ability.wis), cha: foldStacks(ability.cha) },
    attack: foldStacks(attack),
    damage: foldStacks(damage),
    skillAll: foldStacks(skills),
    init: foldStacks(init),
    saves: { fort: foldStacks(saves.fort), ref: foldStacks(saves.ref), will: foldStacks(saves.will) },
    dodge, acPenalty, cmb, loseDex,
  };
}

export function sheetAdjustment(input: { equipped?: Equipped; feats?: { name?: string; bonuses?: ItemBonus[] }[] } = {}): Adjustment {
  const equipped = input.equipped ?? {};
  const bonuses = [
    ...namedGear(equipped).flatMap(item => item.bonuses ?? []),
    ...(input.feats ?? []).filter(feat => feat?.name?.trim()).flatMap(feat => feat.bonuses ?? []),
    ...(equipped.buffs ?? []).filter(buff => buff.on && buff.name?.trim()).flatMap(buff => buff.bonuses ?? []),
  ];
  const totals = adjustmentFromBonuses(bonuses);
  const toggles = resolveToggles(equipped.conditions ?? []);
  (Object.keys(totals.ability) as AbilityName[]).forEach(key => { totals.ability[key] += toggles.ability[key]; });
  (Object.keys(totals.saves) as SaveBonusName[]).forEach(key => { totals.saves[key] += toggles.saves[key]; });
  totals.ac.dodge += toggles.dodge;
  totals.attack += toggles.attack;
  totals.damage += toggles.damage;
  totals.init += toggles.init;
  totals.skillAll += toggles.skillAll;
  totals.acPenalty += toggles.acPenalty;
  totals.cmb += toggles.cmb;
  totals.loseDex = toggles.loseDex;
  return totals;
}
