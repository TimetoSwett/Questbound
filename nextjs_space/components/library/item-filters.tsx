'use client';

import { useId } from 'react';
import { Label } from '@/components/ui/label';
import { GEAR_SLOT_LABELS } from '@/lib/library-gear-form';

export function ItemFilters({ itemType, slot, onTypeChange, onSlotChange }: {
  itemType: string; slot: string; onTypeChange: (value: string) => void; onSlotChange: (value: string) => void;
}) {
  const id = useId();
  const style = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';
  return <>
    <div><Label htmlFor={`${id}-type`}>Item type</Label><select id={`${id}-type`} value={itemType} onChange={(event) => onTypeChange(event.target.value)} className={style}>
      <option value="">All types</option><option value="mundane">Mundane</option><option value="wondrous">Wondrous</option>
    </select></div>
    <div><Label htmlFor={`${id}-slot`}>Slot</Label><select id={`${id}-slot`} value={slot} onChange={(event) => onSlotChange(event.target.value)} className={style}>
      <option value="">All slots</option>{Object.entries(GEAR_SLOT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select></div>
  </>;
}
