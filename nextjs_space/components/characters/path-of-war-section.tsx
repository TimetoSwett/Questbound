'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatMod } from '@/lib/pf1e-skills';
import {
  INITIATION_ABILITIES, MANEUVER_TYPES, MAX_DISCIPLINES, MAX_MANEUVERS, MAX_STANCES, normalizePathOfWar, overLimits, recoverAll,
  saveDC, setActiveStance, toggleExpended, toggleReadied,
  type InitiationAbility, type Maneuver, type ManeuverType, type PathOfWarData, type Stance,
} from '@/lib/path-of-war';

type Props = {
  value: unknown;
  editable: boolean;
  /** Effective ability modifiers from the sheet (includes gear/item bonuses). */
  abilityMods: Record<InitiationAbility, number>;
  onChange: (next: PathOfWarData) => void;
};

const numberOr0 = (raw: string) => Math.max(0, parseInt(raw, 10) || 0);
const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `pw${Date.now()}${Math.random().toString(36).slice(2)}`);

function newManeuver(): Maneuver {
  return { id: newId(), name: '', discipline: '', level: 1, type: 'strike', action: '1 standard action', range: '', target: '', duration: '', save: '', description: '', readied: false, expended: false };
}
function newStance(): Stance {
  return { id: newId(), name: '', discipline: '', level: 1, description: '' };
}

export function PathOfWarSection({ value, editable, abilityMods, onChange }: Props) {
  const data = useMemo(() => normalizePathOfWar(value), [value]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newDiscipline, setNewDiscipline] = useState('');
  const mod = abilityMods[data.initiationAbility] ?? 0;
  const warnings = overLimits(data);

  const patch = (partial: Partial<PathOfWarData>) => onChange({ ...data, ...partial });
  const updateManeuver = (id: string, partial: Partial<Maneuver>) =>
    patch({ maneuvers: data.maneuvers.map(m => (m.id === id ? { ...m, ...partial } : m)) });
  const updateStance = (id: string, partial: Partial<Stance>) =>
    patch({ stances: data.stances.map(s => (s.id === id ? { ...s, ...partial } : s)) });
  const setLimit = (key: keyof PathOfWarData['limits'], v: number) => patch({ limits: { ...data.limits, [key]: v } });

  const textField = (label: string, value: string, onValue: (v: string) => void, className = '') => (
    <div className={className}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input value={value} className="mt-0.5 h-8 text-sm" onChange={e => onValue(e.target.value)} />
    </div>
  );
  const levelField = (level: number, onValue: (v: number) => void) => (
    <div><Label className="text-xs text-muted-foreground">Level (1-9)</Label>
      <Input type="number" min={1} max={9} value={level} className="mt-0.5 h-8 text-center font-mono"
        onChange={e => onValue(Math.max(1, Math.min(9, numberOr0(e.target.value))))} /></div>
  );

  const addDiscipline = () => {
    const name = newDiscipline.trim();
    if (!name || data.disciplines.length >= MAX_DISCIPLINES || data.disciplines.includes(name)) return;
    patch({ disciplines: [...data.disciplines, name] }); setNewDiscipline('');
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card/50 p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-24"><Label className="text-xs text-muted-foreground">Initiator level</Label>
            <Input type="number" min={0} aria-label="Initiator level" value={data.initiatorLevel} disabled={!editable} className="mt-0.5 h-8 text-center font-mono"
              onChange={e => patch({ initiatorLevel: numberOr0(e.target.value) })} /></div>
          <div><Label className="text-xs text-muted-foreground">Initiation ability</Label>
            <select aria-label="Initiation ability" value={data.initiationAbility} disabled={!editable} className="mt-0.5 h-8 rounded-md border bg-card px-2 text-sm block"
              onChange={e => patch({ initiationAbility: e.target.value as InitiationAbility })}>
              {INITIATION_ABILITIES.map(a => <option key={a} value={a}>{a.toUpperCase()} ({formatMod(abilityMods[a] ?? 0)})</option>)}
            </select></div>
          {([['maneuversKnown', 'Maneuvers known'], ['maneuversReadied', 'Maneuvers readied'], ['stancesKnown', 'Stances known']] as const).map(([key, label]) => (
            <div key={key} className="w-28"><Label className="text-xs text-muted-foreground">{label} (max)</Label>
              <Input type="number" min={0} aria-label={`${label} limit`} value={data.limits[key]} disabled={!editable} className="mt-0.5 h-8 text-center font-mono"
                onChange={e => setLimit(key, numberOr0(e.target.value))} /></div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Disciplines:</span>
          {data.disciplines.length === 0 && <span className="text-xs text-muted-foreground">none</span>}
          {data.disciplines.map(d => (
            <span key={d} className="text-xs rounded bg-muted px-1.5 py-0.5">{d}
              {editable && <button type="button" aria-label={`Remove discipline ${d}`} className="ml-1" onClick={() => patch({ disciplines: data.disciplines.filter(x => x !== d) })}>×</button>}
            </span>
          ))}
          {editable && <>
            <Input aria-label="New discipline" value={newDiscipline} placeholder="Add discipline" className="h-8 w-40 text-sm"
              onChange={e => setNewDiscipline(e.target.value.slice(0, 40))} onKeyDown={e => { if (e.key === 'Enter') addDiscipline(); }} />
            <Button size="sm" variant="ghost" disabled={data.disciplines.length >= MAX_DISCIPLINES} onClick={addDiscipline}>Add</Button>
          </>}
        </div>
        {warnings.length > 0 && (
          <div role="alert" className="rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-xs text-warning">
            Over limit: {warnings.join(' · ')}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Maneuvers known ({data.maneuvers.length}/{MAX_MANEUVERS})</h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={!editable} onClick={() => onChange(recoverAll(data))}>Recover</Button>
          {editable && <Button size="sm" variant="ghost" disabled={data.maneuvers.length >= MAX_MANEUVERS}
            onClick={() => { const m = newManeuver(); patch({ maneuvers: [...data.maneuvers, m] }); setEditingId(m.id); }}>+ Add maneuver</Button>}
        </div>
      </div>
      {data.maneuvers.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">No maneuvers</p>}
      {data.maneuvers.map((m, index) => ({ m, index })).sort((a, b) => a.m.level - b.m.level || a.index - b.index).map(({ m }) => (
        <div key={m.id} className={`rounded-lg border bg-card/50 p-3 space-y-2 ${m.expended ? 'opacity-60' : ''}`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{m.name || 'Unnamed maneuver'}</span>
            <span className="text-xs text-muted-foreground">{m.discipline} · Level {m.level} · {m.type}</span>
            <span className="text-xs font-mono rounded bg-muted px-1.5 py-0.5" title={`10 + ${m.level} + ${formatMod(mod)}`}>DC {saveDC(m.level, mod)}</span>
            <div className="ml-auto flex items-center gap-3">
              <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={m.readied} disabled={!editable} onChange={() => onChange(toggleReadied(data, m.id))} /> Readied</label>
              <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={m.expended} disabled={!editable} onChange={() => onChange(toggleExpended(data, m.id))} /> Expended</label>
              {editable && <Button size="sm" variant="ghost" onClick={() => setEditingId(editingId === m.id ? null : m.id)}>{editingId === m.id ? 'Done' : 'Edit'}</Button>}
              {editable && <Button size="sm" variant="ghost" onClick={() => patch({ maneuvers: data.maneuvers.filter(x => x.id !== m.id) })}>Remove</Button>}
            </div>
          </div>
          {editingId === m.id && editable ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {textField('Name', m.name, v => updateManeuver(m.id, { name: v }), 'col-span-2')}
              {textField('Discipline', m.discipline, v => updateManeuver(m.id, { discipline: v }))}
              {levelField(m.level, v => updateManeuver(m.id, { level: v }))}
              <div><Label className="text-xs text-muted-foreground">Type</Label>
                <select aria-label="Maneuver type" value={m.type} className="mt-0.5 h-8 w-full rounded-md border bg-card px-2 text-sm"
                  onChange={e => updateManeuver(m.id, { type: e.target.value as ManeuverType })}>
                  {MANEUVER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select></div>
              {textField('Action', m.action, v => updateManeuver(m.id, { action: v }))}
              {textField('Range', m.range, v => updateManeuver(m.id, { range: v }))}
              {textField('Target', m.target, v => updateManeuver(m.id, { target: v }))}
              {textField('Duration', m.duration, v => updateManeuver(m.id, { duration: v }))}
              {textField('Saving throw', m.save, v => updateManeuver(m.id, { save: v }))}
              <div className="col-span-2 md:col-span-4"><Label className="text-xs text-muted-foreground">Description</Label>
                <textarea value={m.description} rows={4} className="mt-0.5 w-full rounded-md border bg-card px-2 py-1 text-sm"
                  onChange={e => updateManeuver(m.id, { description: e.target.value })} /></div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground space-y-0.5">
              {[['Action', m.action], ['Range', m.range], ['Target', m.target], ['Duration', m.duration], ['Save', m.save]]
                .filter(([, v]) => v).map(([k, v]) => <div key={k}><span className="font-medium">{k}:</span> {v}</div>)}
              {m.description && <p className="whitespace-pre-wrap pt-1">{m.description}</p>}
            </div>
          )}
        </div>
      ))}

      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Stances known ({data.stances.length}/{MAX_STANCES})</h3>
        {editable && <Button size="sm" variant="ghost" disabled={data.stances.length >= MAX_STANCES}
          onClick={() => { const s = newStance(); patch({ stances: [...data.stances, s] }); setEditingId(s.id); }}>+ Add stance</Button>}
      </div>
      {data.stances.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">No stances</p>}
      {data.stances.map(s => (
        <div key={s.id} className="rounded-lg border bg-card/50 p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-xs">
              <input type="radio" name="active-stance" aria-label={`Active stance: ${s.name || 'Unnamed stance'}`} checked={data.activeStanceId === s.id} disabled={!editable}
                onChange={() => onChange(setActiveStance(data, s.id))} /> Active
            </label>
            <span className="font-medium">{s.name || 'Unnamed stance'}</span>
            <span className="text-xs text-muted-foreground">{s.discipline} · Level {s.level}</span>
            <div className="ml-auto flex items-center gap-2">
              {editable && data.activeStanceId === s.id && <Button size="sm" variant="ghost" onClick={() => onChange(setActiveStance(data, null))}>Clear</Button>}
              {editable && <Button size="sm" variant="ghost" onClick={() => setEditingId(editingId === s.id ? null : s.id)}>{editingId === s.id ? 'Done' : 'Edit'}</Button>}
              {editable && <Button size="sm" variant="ghost" onClick={() => { const rest = { ...data, stances: data.stances.filter(x => x.id !== s.id) }; onChange(setActiveStance(rest, rest.activeStanceId)); }}>Remove</Button>}
            </div>
          </div>
          {editingId === s.id && editable ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {textField('Name', s.name, v => updateStance(s.id, { name: v }), 'col-span-2')}
              {textField('Discipline', s.discipline, v => updateStance(s.id, { discipline: v }))}
              {levelField(s.level, v => updateStance(s.id, { level: v }))}
              <div className="col-span-2 md:col-span-4"><Label className="text-xs text-muted-foreground">Description</Label>
                <textarea value={s.description} rows={4} className="mt-0.5 w-full rounded-md border bg-card px-2 py-1 text-sm"
                  onChange={e => updateStance(s.id, { description: e.target.value })} /></div>
            </div>
          ) : (
            s.description && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{s.description}</p>
          )}
        </div>
      ))}
    </div>
  );
}
