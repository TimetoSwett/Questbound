'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GEAR_SLOTS, spellItemCost } from '@/lib/library';
import { GEAR_SLOT_LABELS, type GearFormState } from '@/lib/library-gear-form';

export function GearEntryFields({ form, onChange, idPrefix = 'gear' }: {
  form: GearFormState;
  onChange: (next: GearFormState) => void;
  idPrefix?: string;
}) {
  const update = (key: keyof GearFormState, value: string) => onChange({ ...form, [key]: value });
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    {form.spellItem && <div>
      <Label htmlFor={`${idPrefix}-charges`}>Charges remaining</Label>
      <Input id={`${idPrefix}-charges`} type="number" min={0} max={form.spellItem.type === 'wand' ? 50 : 1} step={1} value={form.charges ?? ''} onChange={(event) => update('charges', event.target.value)} />
      <p className="text-xs text-muted-foreground">Spell level {form.spellItem.spellLevel}; value scales with remaining charges.</p>
    </div>}
    <div>
      <Label htmlFor={`${idPrefix}-slot`}>Slot</Label>
      <select id={`${idPrefix}-slot`} value={form.slot} onChange={(event) => update('slot', event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground">
        <option value="">Not set</option>
        {GEAR_SLOTS.map((slot) => <option key={slot} value={slot}>{GEAR_SLOT_LABELS[slot]}</option>)}
      </select>
    </div>
    <div>
      <Label htmlFor={`${idPrefix}-aura`}>Aura</Label>
      <Input id={`${idPrefix}-aura`} value={form.aura} placeholder="moderate transmutation" onChange={(event) => update('aura', event.target.value)} />
    </div>
    <div>
      <Label htmlFor={`${idPrefix}-cl`}>CL</Label>
      <Input id={`${idPrefix}-cl`} type="number" min={0} max={30} step={1} value={form.cl} onChange={(event) => update('cl', event.target.value)} />
    </div>
    <div>
      <Label htmlFor={`${idPrefix}-cost`}>Cost</Label>
      <Input id={`${idPrefix}-cost`} maxLength={120} readOnly={Boolean(form.spellItem)} value={form.spellItem ? spellItemCost({ ...form.spellItem, charges: Number(form.charges) || 0 }, Number(form.cl) || 0) : form.cost} onChange={(event) => update('cost', event.target.value)} />
    </div>
    <div>
      <Label htmlFor={`${idPrefix}-weight`}>Weight lb</Label>
      <Input id={`${idPrefix}-weight`} type="number" min={0} step="any" value={form.weight} onChange={(event) => update('weight', event.target.value)} />
    </div>
  </div>;
}
