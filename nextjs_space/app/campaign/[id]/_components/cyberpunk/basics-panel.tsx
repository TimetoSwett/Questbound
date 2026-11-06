'use client';

import { useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  CYBERPUNK_DEFAULT_SKILLS,
  CYBERPUNK_DERIVED_LABELS,
  CYBERPUNK_LIMITS,
  CYBERPUNK_ROLES,
  CYBERPUNK_ROLE_SPECIAL_ABILITY,
  CYBERPUNK_SKILL_GROUPS,
  CYBERPUNK_SKILL_GROUP_LABELS,
  CYBERPUNK_STATS,
  CYBERPUNK_WOUND_BOXES,
  CYBERPUNK_WOUND_COLUMNS,
  CYBERPUNK_WOUND_COLUMN_INFO,
  type CyberpunkDerivedKey,
  type CyberpunkRole,
  type CyberpunkSheet,
  type CyberpunkSkill,
  type CyberpunkStat,
  type CyberpunkWoundColumn,
} from '@/lib/cyberpunk-sheet';
import { overlayCyberpunkSheet, patchCyberpunkSheet, type CyberpunkSheetUpdater } from '@/lib/cyberpunk-sheet-persistence';
import {
  CYBERPUNK_SKILL_STAT_OPTIONS,
  DERIVED_HINTS,
  DERIVED_KEY_LIST,
  appendCustomSkill,
  applyDerivedEdit,
  applyStatEdit,
  displayedDerived,
  inferDerivedManual,
  isSkillStatOption,
  isVariableSkillTemplate,
  presentCyberpunkSkills,
  removePresentedSkill,
  skillSpecialty,
  storedCyberpunkSkills,
  updatePresentedSkill,
  withSkillSpecialty,
  type DerivedManual,
  type PresentedSkill,
} from './basics-view';

const sectionClass = 'rounded-lg border border-border bg-card p-4';
const sectionStyle = { boxShadow: 'var(--shadow-sm)' };
const selectClass = 'flex h-10 w-full rounded-lg border border-input bg-background px-2 text-sm font-mono disabled:cursor-not-allowed disabled:opacity-50';

function isListedRole(role: string): role is CyberpunkRole {
  return (CYBERPUNK_ROLES as readonly string[]).includes(role);
}

function parseBounded(
  raw: string,
  integer: boolean,
  range: { min: number; max: number },
): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (trimmed === '-' || trimmed === '+' || trimmed === '.' || trimmed === '-.' || trimmed.endsWith('.')) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return undefined;
  const rounded = integer ? Math.trunc(parsed) : Math.round(parsed * 100) / 100;
  return Math.min(range.max, Math.max(range.min, rounded));
}

function NullableNumberInput({
  id,
  value,
  disabled,
  integer,
  range,
  className,
  onCommit,
}: {
  id: string;
  value: number | null;
  disabled?: boolean;
  integer: boolean;
  range: { min: number; max: number };
  className?: string;
  onCommit: (value: number | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === null ? '' : String(value));
  return (
    <Input
      id={id}
      type="text"
      inputMode={integer ? 'numeric' : 'decimal'}
      value={shown}
      disabled={disabled}
      className={cn('font-mono', className)}
      onFocus={() => setDraft(value === null ? '' : String(value))}
      onBlur={() => setDraft(null)}
      onChange={(event) => {
        const text = event.target.value;
        setDraft(text);
        const parsed = parseBounded(text, integer, range);
        if (parsed !== undefined) onCommit(parsed);
      }}
    />
  );
}

export function CyberpunkBasicsPanel({
  sheet,
  editable,
  onChange,
}: {
  sheet: CyberpunkSheet;
  editable: boolean;
  onChange: (updater: CyberpunkSheetUpdater) => void;
}) {
  const [manual, setManual] = useState<DerivedManual>(() => inferDerivedManual(sheet));
  const [skills, setSkills] = useState<PresentedSkill[]>(() => presentCyberpunkSkills(sheet.skills));
  const manualRef = useRef(manual);
  const skillsRef = useRef(skills);
  const derived = displayedDerived(sheet, manual);

  const rememberManual = (nextManual: DerivedManual) => {
    manualRef.current = nextManual;
    setManual(nextManual);
  };

  const commit = (updater: CyberpunkSheetUpdater) => {
    onChange(overlayCyberpunkSheet(updater, () => ({ skills: storedCyberpunkSkills(skillsRef.current) })));
  };

  const pushSkills = (updater: (current: PresentedSkill[]) => PresentedSkill[]) => {
    const nextSkills = updater(skillsRef.current);
    skillsRef.current = nextSkills;
    setSkills(nextSkills);
    onChange(patchCyberpunkSheet('skills', storedCyberpunkSkills(nextSkills)));
  };

  const setStat = (stat: CyberpunkStat, value: number | null) => {
    commit((current) => {
      const applied = applyStatEdit(current, manualRef.current, stat, value);
      rememberManual(applied.manual);
      return applied.sheet;
    });
  };

  const setDerived = (key: CyberpunkDerivedKey, value: number | null) => {
    commit((current) => {
      const applied = applyDerivedEdit(current, manualRef.current, key, value);
      rememberManual(applied.manual);
      return applied.sheet;
    });
  };

  const updateSkill = (key: string, patch: Partial<CyberpunkSkill>) => {
    pushSkills((current) => updatePresentedSkill(current, key, patch));
  };

  const hintedAbility = isListedRole(sheet.role) ? CYBERPUNK_ROLE_SPECIAL_ABILITY[sheet.role] : null;

  return (
    <div className="space-y-6">
      <section className={sectionClass} style={sectionStyle}>
        <h3 className="font-display text-lg font-semibold">Identity</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <Label htmlFor="cp-handle">Handle</Label>
            <Input
              id="cp-handle"
              value={sheet.handle}
              disabled={!editable}
              maxLength={CYBERPUNK_LIMITS.text.name}
              placeholder="Street name"
              className="mt-1"
              onChange={(event) => commit(patchCyberpunkSheet('handle', event.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="cp-points">Character points</Label>
            <NullableNumberInput
              id="cp-points"
              value={sheet.characterPoints}
              disabled={!editable}
              integer
              range={CYBERPUNK_LIMITS.counter}
              className="mt-1"
              onCommit={(characterPoints) => commit(patchCyberpunkSheet('characterPoints', characterPoints))}
            />
          </div>
          <div>
            <Label htmlFor="cp-age">Age</Label>
            <NullableNumberInput
              id="cp-age"
              value={sheet.age}
              disabled={!editable}
              integer
              range={CYBERPUNK_LIMITS.age}
              className="mt-1"
              onCommit={(age) => commit(patchCyberpunkSheet('age', age))}
            />
          </div>
        </div>
        <div className="mt-4">
          <p id="cp-role-label" className="text-sm font-medium">Role</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5" role="group" aria-labelledby="cp-role-label">
            {CYBERPUNK_ROLES.map((role) => {
              const selected = sheet.role === role;
              return (
                <Button
                  key={role}
                  type="button"
                  size="sm"
                  variant={selected ? 'default' : 'outline'}
                  aria-pressed={selected}
                  disabled={!editable}
                  onClick={() => commit(patchCyberpunkSheet('role', (current) => (current === role ? '' : role)))}
                >
                  {role}
                </Button>
              );
            })}
          </div>
          {!isListedRole(sheet.role) && sheet.role !== '' && (
            <div className="mt-3">
              <Label htmlFor="cp-role-custom">Saved role</Label>
              <Input
                id="cp-role-custom"
                value={sheet.role}
                disabled={!editable}
                maxLength={CYBERPUNK_LIMITS.text.name}
                className="mt-1"
                onChange={(event) => commit(patchCyberpunkSheet('role', event.target.value))}
              />
            </div>
          )}
        </div>
      </section>

      <section className={sectionClass} style={sectionStyle}>
        <h3 className="font-display text-lg font-semibold">Stats</h3>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-9">
          {CYBERPUNK_STATS.map((stat) => (
            <div key={stat}>
              <Label htmlFor={`cp-stat-${stat}`} className="font-mono text-xs">{stat}</Label>
              <NullableNumberInput
                id={`cp-stat-${stat}`}
                value={sheet.stats[stat]}
                disabled={!editable}
                integer
                range={CYBERPUNK_LIMITS.stat}
                className="mt-1 px-2 text-center"
                onCommit={(value) => setStat(stat, value)}
              />
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {DERIVED_KEY_LIST.map((key) => (
            <div key={key}>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor={`cp-derived-${key}`} className="font-mono text-xs">{CYBERPUNK_DERIVED_LABELS[key]}</Label>
                {editable && manual[key] && (
                  <button
                    type="button"
                    className="text-xs text-primary underline-offset-4 hover:underline"
                    onClick={() => setDerived(key, null)}
                  >
                    Auto
                  </button>
                )}
              </div>
              <NullableNumberInput
                id={`cp-derived-${key}`}
                value={derived[key]}
                disabled={!editable}
                integer={false}
                range={CYBERPUNK_LIMITS.resource}
                className="mt-1"
                onCommit={(value) => setDerived(key, value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">{manual[key] ? 'Manual' : DERIVED_HINTS[key]}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={sectionClass} style={sectionStyle}>
        <h3 className="font-display text-lg font-semibold">SAVE / BTM</h3>
        <div className="mt-3 grid max-w-sm grid-cols-2 gap-3">
          <div>
            <Label htmlFor="cp-save">SAVE</Label>
            <NullableNumberInput
              id="cp-save"
              value={sheet.save}
              disabled={!editable}
              integer
              range={CYBERPUNK_LIMITS.save}
              className="mt-1"
              onCommit={(save) => commit(patchCyberpunkSheet('save', save))}
            />
          </div>
          <div>
            <Label htmlFor="cp-btm">BTM</Label>
            <NullableNumberInput
              id="cp-btm"
              value={sheet.btm}
              disabled={!editable}
              integer
              range={CYBERPUNK_LIMITS.btm}
              className="mt-1"
              onCommit={(btm) => commit(patchCyberpunkSheet('btm', btm))}
            />
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <div className="grid min-w-[40rem] grid-cols-10 gap-2">
            {CYBERPUNK_WOUND_COLUMNS.map((column) => (
              <WoundColumn
                key={column}
                column={column}
                boxes={sheet.wounds[column]}
                editable={editable}
                onToggle={(index) => {
                  commit(patchCyberpunkSheet('wounds', (wounds) => {
                    const next = wounds[column].slice(0, CYBERPUNK_WOUND_BOXES);
                    while (next.length < CYBERPUNK_WOUND_BOXES) next.push(false);
                    next[index] = !next[index];
                    return { ...wounds, [column]: next };
                  }));
                }}
              />
            ))}
          </div>
        </div>
      </section>

      <section className={sectionClass} style={sectionStyle}>
        <h3 className="font-display text-lg font-semibold">Special abilities</h3>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {sheet.specialAbilities.map((ability) => {
            const hinted = ability.name === hintedAbility;
            return (
              <li
                key={ability.name}
                className={cn('grid grid-cols-[1fr_5rem] items-end gap-2 rounded-lg border border-transparent p-2', hinted && 'border-primary bg-accent/10')}
              >
                <div>
                  <Label htmlFor={`cp-ability-${ability.name}`}>{ability.name}</Label>
                  {hinted && <p className="text-xs text-muted-foreground">Role ability</p>}
                </div>
                <NullableNumberInput
                  id={`cp-ability-${ability.name}`}
                  value={ability.value}
                  disabled={!editable}
                  integer
                  range={CYBERPUNK_LIMITS.rank}
                  onCommit={(value) => commit(patchCyberpunkSheet('specialAbilities', (rows) =>
                    rows.map((row) => (row.name === ability.name ? { ...row, value } : row))))}
                />
              </li>
            );
          })}
        </ul>
      </section>

      <section className={sectionClass} style={sectionStyle}>
        <h3 className="font-display text-lg font-semibold">Skills</h3>
        <p className="mt-1 text-sm text-muted-foreground">Mark chipped skills. Custom rows use a skill group or Other.</p>
        <div className="mt-4 space-y-6">
          {CYBERPUNK_SKILL_GROUPS.map((group) => (
            <SkillGroup
              key={group}
              label={CYBERPUNK_SKILL_GROUP_LABELS[group]}
              editable={editable}
              rows={skills.filter((skill) => skill.source === 'official' && CYBERPUNK_DEFAULT_SKILLS[skill.catalogIndex ?? -1]?.stat === group)}
              custom={skills.filter((skill) => skill.source === 'custom' && skill.stat === group)}
              onAdd={() => pushSkills((current) => appendCustomSkill(current, { name: '', stat: group, value: null, chipped: false }))}
              onSkill={updateSkill}
              onRemove={(key) => pushSkills((current) => removePresentedSkill(current, key))}
            />
          ))}
          <SkillGroup
            label="Other"
            editable={editable}
            rows={[]}
            custom={skills.filter((skill) => skill.source === 'custom' && skill.stat === 'OTHER')}
            onAdd={() => pushSkills((current) => appendCustomSkill(current, { name: '', stat: 'OTHER', value: null, chipped: false }))}
            onSkill={updateSkill}
            onRemove={(key) => pushSkills((current) => removePresentedSkill(current, key))}
          />
        </div>
      </section>

      <section className={sectionClass} style={sectionStyle}>
        <h3 className="font-display text-lg font-semibold">Resources</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="cp-rep">REP</Label>
            <NullableNumberInput
              id="cp-rep"
              value={sheet.rep}
              disabled={!editable}
              integer
              range={CYBERPUNK_LIMITS.counter}
              className="mt-1"
              onCommit={(rep) => commit(patchCyberpunkSheet('rep', rep))}
            />
          </div>
          <div>
            <Label htmlFor="cp-ip">Current IP</Label>
            <NullableNumberInput
              id="cp-ip"
              value={sheet.currentIp}
              disabled={!editable}
              integer
              range={CYBERPUNK_LIMITS.counter}
              className="mt-1"
              onCommit={(currentIp) => commit(patchCyberpunkSheet('currentIp', currentIp))}
            />
          </div>
          <div>
            <Label htmlFor="cp-humanity">Humanity</Label>
            <NullableNumberInput
              id="cp-humanity"
              value={sheet.humanity}
              disabled={!editable}
              integer={false}
              range={CYBERPUNK_LIMITS.counter}
              className="mt-1"
              onCommit={(humanity) => commit(patchCyberpunkSheet('humanity', humanity))}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function WoundColumn({
  column,
  boxes,
  editable,
  onToggle,
}: {
  column: CyberpunkWoundColumn;
  boxes: boolean[];
  editable: boolean;
  onToggle: (index: number) => void;
}) {
  const info = CYBERPUNK_WOUND_COLUMN_INFO[column];
  return (
    <div>
      <p className="font-mono text-[10px] leading-tight">{info.label}</p>
      <p className="text-[10px] text-muted-foreground">Stun={info.stun}</p>
      <div className="mt-1 flex flex-col gap-1">
        {Array.from({ length: CYBERPUNK_WOUND_BOXES }, (_, index) => (
          <Checkbox
            key={index}
            checked={boxes[index] === true}
            disabled={!editable}
            aria-label={`${info.label} box ${index + 1}`}
            onCheckedChange={() => onToggle(index)}
          />
        ))}
      </div>
    </div>
  );
}

function SkillGroup({
  label,
  rows,
  custom,
  editable,
  onAdd,
  onSkill,
  onRemove,
}: {
  label: string;
  rows: PresentedSkill[];
  custom: PresentedSkill[];
  editable: boolean;
  onAdd: () => void;
  onSkill: (key: string, patch: Partial<CyberpunkSkill>) => void;
  onRemove: (key: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</h4>
        {editable && (
          <Button type="button" variant="secondary" size="sm" onClick={onAdd}>
            <Plus className="mr-1 h-4 w-4" /> Add skill
          </Button>
        )}
      </div>
      <ul className="mt-2 space-y-2">
        {rows.map((skill) => {
          const template = skill.catalogIndex === undefined ? undefined : CYBERPUNK_DEFAULT_SKILLS[skill.catalogIndex];
          const variable = template ? isVariableSkillTemplate(template.name) : false;
          return (
            <SkillValueRow
              key={skill.key}
              id={`cp-skill-${skill.key}`}
              label={template?.name ?? skill.name}
              specialty={variable && template ? skillSpecialty(skill.name, template.name) : undefined}
              specialtyPlaceholder={template?.name === 'Language' ? 'Language' : template?.name === 'Expert' ? 'Specialty' : 'Style'}
              value={skill.value}
              chipped={skill.chipped}
              editable={editable}
              onSpecialty={variable && template
                ? (specialty) => onSkill(skill.key, { name: withSkillSpecialty(template.name, specialty) })
                : undefined}
              onValue={(value) => onSkill(skill.key, { value })}
              onChipped={(chipped) => onSkill(skill.key, { chipped })}
            />
          );
        })}
        {custom.map((skill) => (
          <li key={skill.key} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_8rem_5rem_auto_auto]">
            <div>
              <Label htmlFor={`cp-skill-name-${skill.key}`} className="text-xs">Name</Label>
              <Input
                id={`cp-skill-name-${skill.key}`}
                value={skill.name}
                disabled={!editable}
                maxLength={CYBERPUNK_LIMITS.text.name}
                placeholder="Custom skill"
                className="mt-1"
                onChange={(event) => onSkill(skill.key, { name: event.target.value })}
              />
            </div>
            <div>
              <Label htmlFor={`cp-skill-stat-${skill.key}`} className="text-xs">Stat</Label>
              <select
                id={`cp-skill-stat-${skill.key}`}
                value={skill.stat}
                disabled={!editable}
                className={cn(selectClass, 'mt-1')}
                onChange={(event) => {
                  if (isSkillStatOption(event.target.value)) onSkill(skill.key, { stat: event.target.value });
                }}
              >
                {CYBERPUNK_SKILL_STAT_OPTIONS.map((stat) => (
                  <option key={stat} value={stat}>{stat === 'OTHER' ? 'Other' : stat}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor={`cp-skill-value-${skill.key}`} className="text-xs">Value</Label>
              <NullableNumberInput
                id={`cp-skill-value-${skill.key}`}
                value={skill.value}
                disabled={!editable}
                integer
                range={CYBERPUNK_LIMITS.rank}
                className="mt-1"
                onCommit={(value) => onSkill(skill.key, { value })}
              />
            </div>
            <ChippedMark
              id={`cp-skill-chip-${skill.key}`}
              checked={skill.chipped}
              disabled={!editable}
              onChange={(chipped) => onSkill(skill.key, { chipped })}
            />
            {editable && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="mb-1"
                aria-label={`Remove ${skill.name || 'skill'}`}
                onClick={() => onRemove(skill.key)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SkillValueRow({
  id,
  label,
  specialty,
  specialtyPlaceholder,
  value,
  chipped,
  editable,
  onSpecialty,
  onValue,
  onChipped,
}: {
  id: string;
  label: string;
  specialty?: string;
  specialtyPlaceholder?: string;
  value: number | null;
  chipped: boolean;
  editable: boolean;
  onSpecialty?: (specialty: string) => void;
  onValue: (value: number | null) => void;
  onChipped: (chipped: boolean) => void;
}) {
  return (
    <li className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_5rem_auto]">
      <div>
        {onSpecialty ? (
          <>
            <Label htmlFor={`${id}-name`} className="text-xs">{label}</Label>
            <Input
              id={`${id}-name`}
              value={specialty ?? ''}
              disabled={!editable}
              maxLength={CYBERPUNK_LIMITS.text.name}
              placeholder={specialtyPlaceholder}
              className="mt-1"
              onChange={(event) => onSpecialty(event.target.value)}
              onBlur={(event) => onSpecialty(event.target.value.trim())}
            />
          </>
        ) : (
          <p className="pb-2 text-sm">{label}</p>
        )}
      </div>
      <div>
        <Label htmlFor={`${id}-value`} className="text-xs">Value</Label>
        <NullableNumberInput
          id={`${id}-value`}
          value={value}
          disabled={!editable}
          integer
          range={CYBERPUNK_LIMITS.rank}
          className="mt-1"
          onCommit={onValue}
        />
      </div>
      <ChippedMark id={`${id}-chip`} checked={chipped} disabled={!editable} onChange={onChipped} />
    </li>
  );
}

function ChippedMark({
  id,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(next) => onChange(next === true)}
      />
      <Label htmlFor={id} className="text-xs">Chipped</Label>
    </div>
  );
}
