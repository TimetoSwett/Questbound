import { featDataSchema, type FeatData } from './library';

export type FeatFormState = {
  featType: string;
  prerequisites: string;
  benefit: string;
  description: string;
};

export const FEAT_TYPES = ['General', 'Combat', 'Critical', 'Item Creation', 'Metamagic', 'Teamwork', 'Style', 'Grit', 'Panache', 'Story', 'Mythic', 'Achievement'] as const;

export function emptyFeatForm(prefill?: Partial<FeatFormState>): FeatFormState {
  return {
    featType: prefill?.featType ?? '',
    prerequisites: prefill?.prerequisites ?? '',
    benefit: prefill?.benefit ?? '',
    description: prefill?.description ?? '',
  };
}

export function buildFeatData(form: FeatFormState):
  { ok: true; data: FeatData } | { ok: false; error: string } {
  const data = {
    featType: form.featType.trim(),
    prerequisites: form.prerequisites.trim(),
    benefit: form.benefit.trim(),
    description: form.description.trim(),
  };
  const limits: [keyof FeatFormState, string, number][] = [
    ['featType', 'Feat type', 80], ['prerequisites', 'Prerequisites', 500],
    ['benefit', 'Benefit', 4000], ['description', 'Description', 20000],
  ];
  for (const [key, label, max] of limits) {
    if (data[key].length > max) return { ok: false, error: `${label} must be at most ${max} characters.` };
  }
  const parsed = featDataSchema.safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${issue.path.join('.')}: ${issue.message}` };
  }
  return { ok: true, data: parsed.data };
}
