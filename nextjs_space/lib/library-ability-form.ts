import { abilityDataSchema, type AbilityData } from './library';

export type AbilityFormState = { tag: string; uses: string; description: string };

export const ABILITY_TAG_LABELS = {
  ex: 'Extraordinary (Ex)', su: 'Supernatural (Su)', sp: 'Spell-like (Sp)',
};
export const USES_SUGGESTIONS = ['at will', '1/day', '3/day', '1/round', 'constant'];

export function emptyAbilityForm(prefill?: Partial<AbilityFormState>): AbilityFormState {
  return { tag: prefill?.tag ?? '', uses: prefill?.uses ?? '', description: prefill?.description ?? '' };
}

export function buildAbilityData(form: AbilityFormState):
  { ok: true; data: AbilityData } | { ok: false; error: string } {
  const tag = form.tag.trim();
  const uses = form.uses.trim();
  if (uses.length > 60) return { ok: false, error: 'Uses must be at most 60 characters.' };
  const parsed = abilityDataSchema.safeParse({
    description: form.description.trim(), ...(tag ? { tag } : {}), ...(uses ? { uses } : {}),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${issue.path.join('.')}: ${issue.message}` };
  }
  return { ok: true, data: parsed.data };
}
