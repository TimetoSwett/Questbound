'use client';

import { useId } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function NonlethalField({ value = 0, currentHp, disabled, onChange }: {
  value?: number;
  currentHp: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const status = value > 0 && value > currentHp ? 'Unconscious' : value > 0 && value === currentHp ? 'Staggered' : null;

  return (
    <div>
      <Label htmlFor={id} className="text-xs text-muted-foreground">Nonlethal</Label>
      <Input
        id={id}
        type="number"
        min={0}
        max={10000}
        step={1}
        value={value}
        disabled={disabled}
        onChange={event => onChange(Math.max(0, Math.min(10000, Math.trunc(Number(event.target.value) || 0))))}
        className="mt-0.5 h-8 text-center font-mono text-sm"
      />
      {status && <span role="status" className="mt-1 inline-block rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground">{status}</span>}
    </div>
  );
}
