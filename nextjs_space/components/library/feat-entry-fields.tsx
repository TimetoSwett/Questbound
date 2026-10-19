'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FEAT_TYPES, type FeatFormState } from '@/lib/library-feat-form';

export function FeatEntryFields({ form, onChange, idPrefix = 'feat' }: {
  form: FeatFormState;
  onChange: (next: FeatFormState) => void;
  idPrefix?: string;
}) {
  const update = (key: keyof FeatFormState, value: string) => onChange({ ...form, [key]: value });
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    <div>
      <Label htmlFor={`${idPrefix}-type`}>Feat type</Label>
      <Input id={`${idPrefix}-type`} list={`${idPrefix}-types`} value={form.featType} onChange={(event) => update('featType', event.target.value)} />
      <datalist id={`${idPrefix}-types`}>{FEAT_TYPES.map((type) => <option key={type} value={type} />)}</datalist>
    </div>
    <div>
      <Label htmlFor={`${idPrefix}-prerequisites`}>Prerequisites</Label>
      <Input id={`${idPrefix}-prerequisites`} value={form.prerequisites} onChange={(event) => update('prerequisites', event.target.value)} />
    </div>
    <div className="sm:col-span-2">
      <Label htmlFor={`${idPrefix}-benefit`}>Benefit</Label>
      <textarea id={`${idPrefix}-benefit`} value={form.benefit} onChange={(event) => update('benefit', event.target.value)} className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground" />
    </div>
  </div>;
}
