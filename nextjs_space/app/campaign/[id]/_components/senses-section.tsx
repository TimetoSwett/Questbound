'use client';

import { useId } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import type { SheetOptions } from '@/lib/equipment';

type Senses = NonNullable<SheetOptions['senses']>;
const ranges = [
  ['darkvision', 'Darkvision'],
  ['blindsense', 'Blindsense'],
  ['blindsight', 'Blindsight'],
  ['tremorsense', 'Tremorsense'],
] as const;

export function SensesSection({ value = {}, disabled, onChange }: {
  value?: Senses;
  disabled?: boolean;
  onChange: (senses: Senses) => void;
}) {
  const id = useId();
  const summary = [
    value.darkvision ? `Darkvision ${value.darkvision} ft.` : '',
    value.lowLight ? 'low-light vision' : '',
    value.scent ? 'scent' : '',
    ...ranges.slice(1).map(([key, label]) => value[key] ? `${label} ${value[key]} ft.` : ''),
    ...(value.custom ?? []).map(sense => sense.trim()).filter(Boolean),
  ].filter(Boolean).join(', ');
  const custom = value.custom ?? [];

  return (
    <section className="bg-card rounded-lg p-4 border border-border space-y-3" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <h3 className="font-display font-semibold text-sm">Senses</h3>
      <p className="text-sm text-muted-foreground" aria-live="polite">{summary || 'No senses specified'}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {ranges.map(([key, label]) => (
          <div key={key}>
            <Label htmlFor={`${id}-${key}`} className="text-xs text-muted-foreground">{label} (ft.)</Label>
            <Input id={`${id}-${key}`} type="number" min={0} max={1000} step={1} value={value[key] ?? 0} disabled={disabled}
              className="mt-0.5 h-8 font-mono text-sm"
              onChange={event => onChange({ ...value, [key]: Math.max(0, Math.min(1000, Math.trunc(Number(event.target.value) || 0))) })} />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-4">
        {([['lowLight', 'Low-light vision'], ['scent', 'Scent']] as const).map(([key, label]) => (
          <div key={key} className="flex items-center gap-2">
            <Input id={`${id}-${key}`} type="checkbox" checked={value[key] ?? false} disabled={disabled} className="h-4 w-4 accent-primary"
              onChange={event => onChange({ ...value, [key]: event.target.checked })} />
            <Label htmlFor={`${id}-${key}`} className="text-sm">{label}</Label>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {custom.map((sense, index) => (
          <div key={index} className="flex gap-2">
            <Input aria-label={`Custom sense ${index + 1}`} value={sense} maxLength={80} disabled={disabled} className="h-8 flex-1"
              onChange={event => onChange({ ...value, custom: custom.map((item, i) => i === index ? event.target.value : item) })} />
            {!disabled && <Button type="button" variant="ghost" size="sm" aria-label={`Remove custom sense ${index + 1}`} onClick={() => onChange({ ...value, custom: custom.filter((_, i) => i !== index) })}>Remove</Button>}
          </div>
        ))}
        {!disabled && <Button type="button" variant="ghost" size="sm" disabled={custom.length >= 20} onClick={() => onChange({ ...value, custom: [...custom, ''] })}>+ Add sense</Button>}
      </div>
    </section>
  );
}
