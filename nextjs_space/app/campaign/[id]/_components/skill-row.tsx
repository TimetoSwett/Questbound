'use client';

import type { ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatMod, type SkillDef } from '@/lib/pf1e-skills';
import { equipmentSkillPenalty } from '@/lib/equipment';
import type { SkillEntry } from '@/lib/skills-validation';

interface SkillRowProps {
  label: ReactNode;
  skill: SkillDef;
  entry: SkillEntry;
  abilityModForSkill: (ability: string) => number;
  gearSkill: number;
  checkPenalty: number;
  editable: boolean;
  onChange: (field: keyof SkillEntry, value: string | number | boolean) => void;
  onDelete?: () => void;
  specialtyInput?: ReactNode;
}

export function SkillRow({ label, skill, entry, abilityModForSkill, gearSkill, checkPenalty, editable, onChange, onDelete, specialtyInput }: SkillRowProps) {
  const primary = entry.ability || skill.ability;
  const extra = entry.extraAbility && entry.extraAbility !== primary ? entry.extraAbility : '';
  const abMod = abilityModForSkill(primary) + (extra ? abilityModForSkill(extra) : 0);
  const ranks = entry.ranks ?? 0;
  const csBonus = entry.classSkill && ranks >= 1 ? 3 : 0;
  const total = ranks + csBonus + abMod + (entry.misc ?? 0) + equipmentSkillPenalty(skill.ability, checkPenalty) + gearSkill;
  return (
    <tr className="border-b border-border/50 hover:bg-muted/30">
      <td className="py-1 px-1">
        <span className="text-xs">{label}</span>{specialtyInput}
        <span className="ml-1 inline-flex gap-1">
          <select aria-label={`${skill.name} ability`} value={entry.ability || skill.ability} disabled={!editable} onChange={e => onChange('ability', e.target.value)} className="bg-transparent text-[10px] text-muted-foreground">
            {(['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const).map(ability => <option key={ability} value={ability}>{ability}</option>)}
          </select>
          <select aria-label={`${skill.name} extra ability`} value={entry.extraAbility ?? ''} disabled={!editable} onChange={e => onChange('extraAbility', e.target.value)} className="bg-transparent text-[10px] text-muted-foreground">
            <option value="">+ none</option>
            {(['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const).map(ability => <option key={ability} value={ability}>+{ability}</option>)}
          </select>
        </span>
        {onDelete && <Button type="button" variant="ghost" size="sm" disabled={!editable} aria-label={`Delete ${entry.name}`} onClick={onDelete}><Trash2 className="h-3 w-3" /></Button>}
      </td>
      <td className="text-center font-mono font-bold" title={gearSkill ? `${formatMod(gearSkill)} included` : undefined}>{formatMod(total)}</td>
      <td className="text-center">
        <input type="number" value={ranks} onChange={(e) => onChange('ranks', parseInt(e.target.value) || 0)} disabled={!editable}
          className="w-10 h-6 text-center bg-transparent border border-border rounded text-xs font-mono" />
      </td>
      <td className="text-center">
        <input type="checkbox" checked={entry?.classSkill ?? false} onChange={(e) => onChange('classSkill', e.target.checked)} disabled={!editable}
          className="w-3.5 h-3.5 accent-primary" />
      </td>
      <td className="text-center text-xs font-mono text-muted-foreground">{formatMod(abMod)}</td>
      <td className="text-center">
        <input type="number" value={entry?.misc ?? 0} onChange={(e) => onChange('misc', parseInt(e.target.value) || 0)} disabled={!editable}
          className="w-10 h-6 text-center bg-transparent border border-border rounded text-xs font-mono" />
      </td>
    </tr>
  );
}
