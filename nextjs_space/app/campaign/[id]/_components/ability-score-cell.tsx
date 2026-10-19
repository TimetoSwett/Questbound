'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AbilityName } from '@/lib/equipment';
import { formatMod } from '@/lib/pf1e-skills';

interface AbilityScoreCellProps {
  ability: AbilityName;
  score: number | string;
  modifier: number;
  gear: number;
  noScore: boolean;
  editable: boolean;
  onScoreChange: (value: string) => void;
  onNoScoreChange: (value: boolean) => void;
}

export function AbilityScoreCell({ ability, score, modifier, gear, noScore, editable, onScoreChange, onNoScoreChange }: AbilityScoreCellProps) {
  const id = `ability-score-${ability}`;
  return <>
    <Label htmlFor={id} className="text-xs font-mono text-primary uppercase">{ability}</Label>
    <Input id={id} type={noScore ? 'text' : 'number'} value={noScore ? 'N/A' : score}
      onChange={event => onScoreChange(event.target.value)} disabled={!editable || noScore}
      className="mt-0.5 h-10 text-center font-mono text-lg" />
    <div className={`text-sm font-mono mt-1 ${noScore ? 'text-muted-foreground' : modifier >= 0 ? 'text-success' : 'text-destructive'}`}>{noScore ? 'N/A' : formatMod(modifier)}</div>
    {!noScore && gear !== 0 && <div className="text-[10px] text-muted-foreground">{formatMod(gear)} included</div>}
    <Button type="button" variant="ghost" size="sm" className="h-6 px-1 text-[10px]" disabled={!editable}
      aria-label={`${ability.toUpperCase()} no score`} aria-pressed={noScore}
      title="No ability score; modifier is treated as +0" onClick={() => onNoScoreChange(!noScore)}>— {noScore ? 'Restore score' : 'No score'}</Button>
  </>;
}
