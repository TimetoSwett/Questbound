'use client';

import { useId } from 'react';
import { inputVariants } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface BackstoryTabProps {
  backstory: string;
  editable: boolean;
  onChange: (backstory: string) => void;
}

export function BackstoryTab({ backstory, editable, onChange }: BackstoryTabProps) {
  const id = useId();

  return (
    <div className="space-y-2">
      <Label htmlFor={editable ? id : undefined}>Backstory</Label>
      {editable ? (
        <textarea
          id={id}
          rows={16}
          maxLength={20000}
          value={backstory}
          onChange={event => onChange(event.target.value)}
          placeholder="Your character's history, motivations, allies and rivals…"
          aria-describedby={`${id}-count`}
          className={inputVariants({ className: 'h-auto resize-y' })}
        />
      ) : (
        <p className="whitespace-pre-wrap">{backstory}</p>
      )}
      <p id={`${id}-count`} className="text-xs text-muted-foreground">
        {backstory.length} / 20000 characters
      </p>
    </div>
  );
}
