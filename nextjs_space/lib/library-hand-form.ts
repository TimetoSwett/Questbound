import { armorDataSchema, weaponDataSchema } from './library';

export type HandForm = Record<string, string>;

/** Convert editable strings to API stats without silently rounding invalid numbers. */
export function buildHandData(kind: string, slot: string | undefined, form: HandForm):
  { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
  if (kind !== 'armor' && kind !== 'weapon') return { ok: true, data: {} };
  const data: Record<string, unknown> = {};
  const numbers: [string, string, number, number, boolean][] = kind === 'armor'
    ? [['acBonus', 'AC bonus', -100, 100, true], ['maxDex', 'Max Dex', -100, 100, true],
      ['checkPenalty', 'Check penalty', -100, 0, true], ['spellFailure', 'Spell failure %', 0, 100, true]]
    : [['range', 'Range ft', 0, 100000, true]];
  numbers.push(['weight', 'Weight lb', 0, 100000, false]);
  for (const [key, label, min, max, integer] of numbers) {
    const raw = (form[key] ?? '').trim();
    if (key === 'maxDex' && !raw) { data[key] = null; continue; }
    const value = raw ? Number(raw) : 0;
    if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
      return { ok: false, error: `${label} must be ${integer ? 'an integer' : 'a number'} between ${min} and ${max}.` };
    }
    data[key] = value;
  }
  data.cost = form.cost ?? '';
  if (kind === 'armor') data.slot = form.slot || slot || 'armor';
  else {
    data.category = form.category || 'melee';
    data.ability = form.ability || (data.category === 'ranged' ? 'dex' : 'str');
    data.damage = (form.damage ?? '').trim().toLowerCase();
    if (data.damage && !/^\d+d\d+$|^\d+$/i.test(String(data.damage))) {
      return { ok: false, error: 'Damage die must be dice such as 1d8 or a whole number.' };
    }
    data.crit = form.crit ?? '';
    data.type = form.type ?? '';
    if (form.hands) data.hands = form.hands;
  }
  const parsed = (kind === 'armor' ? armorDataSchema : weaponDataSchema).safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${issue.path.join('.')}: ${issue.message}` };
  }
  return { ok: true, data: parsed.data };
}
