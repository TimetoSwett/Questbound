'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ABILITY_TAG_KEYS } from '@/lib/library';
import { ABILITY_TAG_LABELS, USES_SUGGESTIONS, type AbilityFormState } from '@/lib/library-ability-form';

export function AbilityEntryFields({ form, onChange, idPrefix = 'ability' }: {
  form: AbilityFormState;
  onChange: (next: AbilityFormState) => void;
  idPrefix?: string;
}) {
  const update = (key: keyof AbilityFormState, value: string) => onChange({ ...form, [key]: value });
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    <div>
      <Label htmlFor={`${idPrefix}-tag`}>Tag</Label>
      <select id={`${idPrefix}-tag`} value={form.tag} onChange={(event) => update('tag', event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground">
        <option value="">Not set</option>
        {ABILITY_TAG_KEYS.map((tag) => <option key={tag} value={tag}>{ABILITY_TAG_LABELS[tag]}</option>)}
      </select>
    </div>
    <div>
      <Label htmlFor={`${idPrefix}-uses`}>Uses</Label>
      <Input id={`${idPrefix}-uses`} list={`${idPrefix}-uses-suggestions`} maxLength={60} value={form.uses} onChange={(event) => update('uses', event.target.value)} />
      <datalist id={`${idPrefix}-uses-suggestions`}>
        {USES_SUGGESTIONS.map((uses) => <option key={uses} value={uses} />)}
      </datalist>
    </div>
  </div>;
}
