'use client';

import { Fragment, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CustomSkillForm } from './custom-skill-form';
import { PF1E_SKILLS, type SkillDef } from '@/lib/pf1e-skills';
import { normalizeSkillName, type SkillEntry } from '@/lib/skills-validation';
import { SkillRow } from './skill-row';

const newId = () => globalThis.crypto?.randomUUID?.() ?? `skill-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const blank = (name: string): SkillEntry => ({ name, ranks: 0, classSkill: false, misc: 0 });

interface Props {
  skills: SkillEntry[];
  editable: boolean;
  abilityModForSkill: (ability: string) => number;
  skillBonuses: Record<string, number>;
  skillAll: number;
  checkPenalty: number;
  onChange: (skills: SkillEntry[]) => void;
}

export function SkillRows({ skills, onChange, skillBonuses, skillAll, ...props }: Props) {
  const [nameWarnings, setNameWarnings] = useState<Set<string>>(new Set());
  const warn = (key: string, duplicate: boolean) => {
    setNameWarnings(previous => {
      const next = new Set(previous);
      if (duplicate) next.add(key);
      else next.delete(key);
      return next;
    });
  };
  return <>{PF1E_SKILLS.map(skill => {
    const base = skill.name === 'Craft' || skill.name === 'Profession' ? skill.name : undefined;
    const matches = base
      ? skills.filter(entry => !entry.custom && (entry.base === base || (!entry.base && entry.name === base)))
      : skills.filter(entry => !entry.custom && entry.name === skill.name).slice(0, 1);
    const entries = matches.length ? matches : [blank(skill.name)];
    return <Fragment key={skill.name}>
      {entries.map((entry, index) => {
        const warningKey = entry.id ?? `standard-${skill.name}-${index}`;
        const findEntry = (candidate: SkillEntry) => !candidate.custom && (entry.id ? candidate.id === entry.id : entry.base ? candidate === entry : !candidate.base && candidate.name === entry.name);
        const change = (field: keyof SkillEntry, value: string | number | boolean) => {
          const next = { ...entry, [field]: value };
          if (base) {
            next.id ||= newId();
            next.base = base;
            next.specialty = (field === 'specialty' ? String(value) : entry.specialty ?? '').slice(0, 60);
            next.name = next.specialty ? `${base} (${next.specialty})` : base;
          }
          const position = skills.findIndex(findEntry);
          if (field === 'specialty') {
            const duplicate = skills.some((candidate, candidateIndex) => candidateIndex !== position &&
              normalizeSkillName(candidate.name) === normalizeSkillName(next.name));
            warn(warningKey, duplicate);
            if (duplicate) return;
          }
          const updated = [...skills];
          if (position >= 0) updated[position] = next;
          else updated.push(next);
          onChange(updated);
        };
        return <SkillRow key={`${skill.name}-${index}`} {...props} label={skill.name} skill={skill} entry={entry}
          gearSkill={(skillBonuses[skill.name] ?? 0) + skillAll} onChange={change}
          onDelete={base ? () => onChange(skills.filter(candidate => !findEntry(candidate))) : undefined}
          specialtyInput={base ? <><Input aria-invalid={nameWarnings.has(warningKey)} aria-label={`${base} specialty`} placeholder={base === 'Craft' ? 'Alchemy' : 'Sailor'}
            value={entry.specialty ?? ''} maxLength={60} disabled={!props.editable}
            className="inline-block ml-2 h-6 w-32 text-xs" onChange={event => change('specialty', event.target.value)} />
            {nameWarnings.has(warningKey) && <span className="ml-2 text-xs text-destructive">Name already used</span>}</> : undefined} />;
      })}
      {base && props.editable && <tr><td colSpan={6} className="py-1"><Button type="button" variant="ghost" size="sm"
        disabled={skills.some(entry => !entry.custom && (entry.base === base || (!entry.base && entry.name === base)) && !entry.specialty)}
        onClick={() => onChange([...skills, { ...blank(base), id: newId(), base, specialty: '' }])}>+ Add {base}</Button></td></tr>}
    </Fragment>;
  })}
    {skills.filter(entry => entry.custom).map((entry, index) => {
      const warningKey = entry.id ?? `custom-${index}`;
      const matchesEntry = (candidate: SkillEntry) => candidate.custom && (entry.id ? candidate.id === entry.id : candidate === entry);
      const change = (field: keyof SkillEntry, value: string | number | boolean) => {
        if (field === 'name') {
          const normalizedName = normalizeSkillName(String(value));
          const duplicate = !!normalizedName && (
            PF1E_SKILLS.some(skill => normalizeSkillName(skill.name) === normalizedName) ||
            skills.some(candidate => candidate !== entry && normalizeSkillName(candidate.name) === normalizedName));
          warn(warningKey, duplicate);
          if (duplicate) return;
        }
        onChange(skills.map(candidate => matchesEntry(candidate) ? { ...candidate, [field]: value } : candidate));
      };
      return <SkillRow key={entry.id ?? `custom-${index}`} {...props} skill={{ name: entry.name, ability: (entry.ability || 'INT') as SkillDef['ability'] }} entry={entry}
        label={<><Input aria-invalid={nameWarnings.has(warningKey)} aria-label="Custom skill name" value={entry.name} maxLength={80} disabled={!props.editable}
          className="inline-block h-6 w-40 text-xs" onChange={event => change('name', event.target.value)} />
          {nameWarnings.has(warningKey) && <span className="ml-2 text-xs text-destructive">Name already used</span>}</>}
        gearSkill={skillAll + (skillBonuses[entry.name] ?? 0)} onChange={change}
        onDelete={() => onChange(skills.filter(candidate => !matchesEntry(candidate)))} />;
    })}
    {props.editable && <tr><td colSpan={6} className="py-3"><CustomSkillForm
      existingNames={[...PF1E_SKILLS.map(skill => skill.name), ...skills.map(entry => entry.name)]}
      onAdd={entry => onChange([...skills, { ...entry, id: newId() }])} /></td></tr>}
  </>;
}
