import { spellDataSchema, spellLevelsSchema, type SpellData } from './library';

export type SpellFormState = {
  name: string;
  school: string;
  subschool: string;
  descriptors: string;
  castingTime: string;
  components: string;
  range: string;
  areaTargetEffect: string;
  duration: string;
  savingThrow: string;
  spellResistance: string;
  description: string;
  levels: { cls: string; level: string }[];
};

export function emptySpellForm(prefill?: { name?: string; school?: string; description?: string; level?: number }): SpellFormState {
  return {
    name: prefill?.name ?? '',
    school: prefill?.school ?? '',
    subschool: '',
    descriptors: '',
    castingTime: '',
    components: '',
    range: '',
    areaTargetEffect: '',
    duration: '',
    savingThrow: '',
    spellResistance: '',
    description: prefill?.description ?? '',
    levels: [{ cls: '', level: prefill?.level !== undefined ? String(prefill.level) : '' }],
  };
}

export function buildSpellBody(form: SpellFormState):
  { ok: true; body: { kind: 'spell'; name: string; data: SpellData; spellLevels: { cls: string; level: number }[] } } |
  { ok: false; error: string } {
  if (!form.name.trim()) return { ok: false, error: 'Name is required.' };
  const rows = form.levels.filter((row) => row.cls.trim() || row.level.trim());
  const classes = new Set<string>();
  for (const row of rows) {
    const cls = row.cls.trim();
    if (!cls) return { ok: false, error: 'Each spell level needs a class name.' };
    if (!/^[+-]?\d+$/.test(row.level.trim()) || Number(row.level) < 0 || Number(row.level) > 9) {
      return { ok: false, error: 'Spell level must be an integer between 0 and 9.' };
    }
    if (classes.has(cls.toLowerCase())) return { ok: false, error: `Duplicate class: ${cls}.` };
    classes.add(cls.toLowerCase());
  }
  const data = spellDataSchema.safeParse({
    school: form.school.trim(),
    subschool: form.subschool.trim(),
    descriptors: form.descriptors.split(',').map((d) => d.trim()).filter(Boolean),
    castingTime: form.castingTime.trim(),
    components: form.components.trim(),
    range: form.range.trim(),
    areaTargetEffect: form.areaTargetEffect.trim(),
    duration: form.duration.trim(),
    savingThrow: form.savingThrow.trim(),
    spellResistance: form.spellResistance.trim(),
    description: form.description.trim(),
  });
  if (!data.success) {
    const issue = data.error.issues[0];
    return { ok: false, error: `${issue.path.join('.')}: ${issue.message}` };
  }
  const spellLevels = spellLevelsSchema.safeParse(rows.map((row) => ({ cls: row.cls.trim(), level: parseInt(row.level, 10) })));
  if (!spellLevels.success) {
    const issue = spellLevels.error.issues[0];
    return { ok: false, error: `${issue.path.join('.')}: ${issue.message}` };
  }
  return { ok: true, body: { kind: 'spell', name: form.name.trim(), data: data.data, spellLevels: spellLevels.data } };
}

export function spellSaveError(status: number, payload: { error?: string; issues?: { message?: string; path?: (string | number)[] }[] } | null): string {
  if (status === 409) return payload?.error ?? 'A spell with that name is already in the library.';
  if (status === 413) return 'That spell is too large for the library (64KB limit). Shorten the description and try again.';
  if (status === 400) {
    const issues = (payload?.issues ?? []).map((i) => i.path?.length ? `${i.path.join('.')}: ${i.message}` : i.message).filter(Boolean);
    return issues.length ? `Invalid spell: ${issues.slice(0, 3).join('; ')}` : (payload?.error ?? 'That spell is not valid. Check the fields and try again.');
  }
  return payload?.error ?? 'Could not save to the library. Try again.';
}
