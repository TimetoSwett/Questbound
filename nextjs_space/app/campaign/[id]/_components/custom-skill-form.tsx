'use client';

import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { normalizeSkillName, type SkillEntry } from '@/lib/skills-validation';
import { PF1E_SKILLS, type SkillDef } from '@/lib/pf1e-skills';

interface Props {
  existingNames: string[];
  onAdd: (entry: SkillEntry) => void;
}

export function CustomSkillForm({ existingNames, onAdd }: Props) {
  const id = useId();
  const [name, setName] = useState('');
  const [ability, setAbility] = useState<SkillDef['ability']>('INT');
  const [classSkill, setClassSkill] = useState(false);
  const trimmedName = name.trim();
  const duplicate = [...PF1E_SKILLS.map(skill => skill.name), ...existingNames].some(existing => normalizeSkillName(existing) === normalizeSkillName(name));
  const add = () => {
    if (!trimmedName || duplicate) return;
    onAdd({ name: trimmedName, ability, classSkill, ranks: 0, misc: 0, custom: true });
    setName('');
  };
  return <div className="flex flex-wrap items-end gap-3">
    <div className="space-y-1">
      <Label htmlFor={`${id}-name`}>Custom skill name</Label>
      <Input id={`${id}-name`} value={name} maxLength={80} onChange={event => setName(event.target.value)}
        placeholder="Custom skill" className="h-8 w-48" />
    </div>
    <div className="space-y-1">
      <Label htmlFor={`${id}-ability`}>Ability</Label>
      <select id={`${id}-ability`} value={ability} onChange={event => setAbility(event.target.value as SkillDef['ability'])}
        className="block h-8 rounded-md border border-input bg-background px-2 text-sm">
        {(['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const).map(value => <option key={value} value={value}>{value}</option>)}
      </select>
    </div>
    <Label className="flex h-8 items-center gap-2" htmlFor={`${id}-class`}>
      <input id={`${id}-class`} type="checkbox" checked={classSkill} onChange={event => setClassSkill(event.target.checked)} className="accent-primary" />
      Class skill
    </Label>
    <Button type="button" size="sm" disabled={!trimmedName || duplicate} onClick={add}>Add custom skill</Button>
    {duplicate && trimmedName && <span className="text-xs text-muted-foreground">A skill with this name already exists.</span>}
  </div>;
}
