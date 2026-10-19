'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatMod } from '@/lib/pf1e-skills';
import {
  KEY_ABILITIES, MAX_POWERS, clampPool, manifestCost, normalizePsionics, restPool, restorePP, saveDC, spendPP,
  type KeyAbility, type PsionicPower, type PsionicsData,
} from '@/lib/psionics';

type Props = {
  value: unknown;
  editable: boolean;
  /** Effective ability modifiers from the sheet (includes gear/item bonuses). */
  abilityMods: Record<KeyAbility, number>;
  onChange: (next: PsionicsData) => void;
};

const numberOr0 = (raw: string) => Math.max(0, parseInt(raw, 10) || 0);

function newPower(): PsionicPower {
  return {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `p${Date.now()}${Math.random().toString(36).slice(2)}`,
    name: '', discipline: '', level: 1, ppCost: 1, display: '', manifestingTime: '1 standard action', range: '', duration: '',
    save: '', powerResistance: '', augment: '', description: '',
  };
}

export function PsionicsSection({ value, editable, abilityMods, onChange }: Props) {
  const data = useMemo(() => normalizePsionics(value), [value]);
  const [amount, setAmount] = useState('1');
  const [augments, setAugments] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const keyMod = abilityMods[data.keyAbility] ?? 0;

  const patch = (partial: Partial<PsionicsData>) => onChange({ ...data, ...partial });
  const setPool = (partial: Partial<PsionicsData['pp']>) => patch({ pp: clampPool({ ...data.pp, ...partial }) });
  const updatePower = (id: string, partial: Partial<PsionicPower>) =>
    patch({ powers: data.powers.map(p => (p.id === id ? { ...p, ...partial } : p)) });

  const spend = () => {
    const result = spendPP(data.pp, numberOr0(amount));
    if (!result.ok) { setError(result.error ?? 'Cannot spend'); return; }
    setError(''); patch({ pp: result.pool });
  };
  const manifest = (power: PsionicPower) => {
    const cost = manifestCost(power, numberOr0(augments[power.id] ?? '0'), data.manifesterLevel);
    if (!cost.ok) { setError(`${power.name || 'Power'}: ${cost.error}`); return; }
    const result = spendPP(data.pp, cost.cost);
    if (!result.ok) { setError(`${power.name || 'Power'}: ${result.error}`); return; }
    setError(''); patch({ pp: result.pool });
  };

  const field = (label: string, key: keyof PsionicPower, power: PsionicPower, className = '') => (
    <div className={className}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input value={String(power[key] ?? '')} disabled={!editable} className="mt-0.5 h-8 text-sm"
        onChange={e => updatePower(power.id, { [key]: e.target.value } as Partial<PsionicPower>)} />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card/50 p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-24"><Label className="text-xs text-muted-foreground">Max PP</Label>
            <Input type="number" min={0} aria-label="Max power points" value={data.pp.max} disabled={!editable} className="mt-0.5 h-8 text-center font-mono"
              onChange={e => setPool({ max: numberOr0(e.target.value) })} /></div>
          <div className="w-24"><Label className="text-xs text-muted-foreground">Current PP</Label>
            <Input type="number" min={0} aria-label="Current power points" max={data.pp.max} value={data.pp.current} disabled={!editable} className="mt-0.5 h-8 text-center font-mono"
              onChange={e => setPool({ current: numberOr0(e.target.value) })} /></div>
          <div className="w-24"><Label className="text-xs text-muted-foreground">Temp PP</Label>
            <Input type="number" min={0} aria-label="Temporary power points" value={data.pp.temp} disabled={!editable} className="mt-0.5 h-8 text-center font-mono"
              onChange={e => setPool({ temp: numberOr0(e.target.value) })} /></div>
          <div className="w-24"><Label className="text-xs text-muted-foreground">Manifester level</Label>
            <Input type="number" min={0} aria-label="Manifester level" value={data.manifesterLevel} disabled={!editable} className="mt-0.5 h-8 text-center font-mono"
              onChange={e => patch({ manifesterLevel: numberOr0(e.target.value) })} /></div>
          <div><Label className="text-xs text-muted-foreground">Key ability</Label>
            <select aria-label="Key ability" value={data.keyAbility} disabled={!editable} className="mt-0.5 h-8 rounded-md border bg-card px-2 text-sm block"
              onChange={e => patch({ keyAbility: e.target.value as KeyAbility })}>
              {KEY_ABILITIES.map(a => <option key={a} value={a}>{a.toUpperCase()} ({formatMod(abilityMods[a] ?? 0)})</option>)}
            </select></div>
          <label className="text-sm flex items-center gap-1 h-8">
            <input type="checkbox" checked={data.psionicFocus} disabled={!editable} onChange={e => patch({ psionicFocus: e.target.checked })} /> Psionic focus
          </label>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-20"><Label className="text-xs text-muted-foreground">Amount</Label>
            <Input type="number" min={0} aria-label="PP amount" value={amount} disabled={!editable} className="mt-0.5 h-8 text-center font-mono" onChange={e => setAmount(e.target.value)} /></div>
          <Button size="sm" variant="outline" disabled={!editable} onClick={spend}>Spend</Button>
          <Button size="sm" variant="outline" disabled={!editable} onClick={() => { setError(''); patch({ pp: restorePP(data.pp, numberOr0(amount)) }); }}>Restore</Button>
          <Button size="sm" variant="outline" disabled={!editable} onClick={() => { setError(''); patch({ pp: restPool(data.pp) }); }}>Rest</Button>
          <span className="text-sm font-mono ml-auto">{data.pp.current}{data.pp.temp ? ` (+${data.pp.temp} temp)` : ''} / {data.pp.max} PP</span>
        </div>
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      </div>

      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Powers known ({data.powers.length}/{MAX_POWERS})</h3>
        {editable && <Button size="sm" variant="ghost" disabled={data.powers.length >= MAX_POWERS}
          onClick={() => { const power = newPower(); patch({ powers: [...data.powers, power] }); setEditingId(power.id); }}>+ Add power</Button>}
      </div>
      {data.powers.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">No powers</p>}
      {[...data.powers].map((power, index) => ({ power, index })).sort((a, b) => a.power.level - b.power.level || a.index - b.index).map(({ power }) => (
        <div key={power.id} className="rounded-lg border bg-card/50 p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{power.name || 'Unnamed power'}</span>
            <span className="text-xs text-muted-foreground">{power.discipline} · Level {power.level} · {power.ppCost} PP</span>
            <span className="text-xs font-mono rounded bg-muted px-1.5 py-0.5" title={`10 + ${power.level} + ${formatMod(keyMod)}`}>DC {saveDC(power.level, keyMod)}</span>
            <div className="ml-auto flex items-center gap-2">
              <Label className="text-xs text-muted-foreground" htmlFor={`aug-${power.id}`}>Augment PP</Label>
              <Input id={`aug-${power.id}`} type="number" min={0} value={augments[power.id] ?? '0'} disabled={!editable} className="h-8 w-16 text-center font-mono"
                onChange={e => setAugments(prev => ({ ...prev, [power.id]: e.target.value }))} />
              <Button size="sm" disabled={!editable} onClick={() => manifest(power)}>Manifest</Button>
              {editable && <Button size="sm" variant="ghost" onClick={() => setEditingId(editingId === power.id ? null : power.id)}>{editingId === power.id ? 'Done' : 'Edit'}</Button>}
              {editable && <Button size="sm" variant="ghost" onClick={() => patch({ powers: data.powers.filter(p => p.id !== power.id) })}>Remove</Button>}
            </div>
          </div>
          {editingId === power.id && editable ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {field('Name', 'name', power, 'col-span-2')}
              {field('Discipline', 'discipline', power)}
              <div><Label className="text-xs text-muted-foreground">Level (0-9)</Label>
                <Input type="number" min={0} max={9} value={power.level} className="mt-0.5 h-8 text-center font-mono"
                  onChange={e => updatePower(power.id, { level: Math.min(9, numberOr0(e.target.value)) })} /></div>
              <div><Label className="text-xs text-muted-foreground">PP cost</Label>
                <Input type="number" min={0} value={power.ppCost} className="mt-0.5 h-8 text-center font-mono"
                  onChange={e => updatePower(power.id, { ppCost: numberOr0(e.target.value) })} /></div>
              {field('Display', 'display', power)}
              {field('Manifesting time', 'manifestingTime', power)}
              {field('Range', 'range', power)}
              {field('Duration', 'duration', power)}
              {field('Saving throw', 'save', power)}
              {field('Power resistance', 'powerResistance', power)}
              {field('Augment', 'augment', power, 'col-span-2 md:col-span-4')}
              <div className="col-span-2 md:col-span-4"><Label className="text-xs text-muted-foreground">Description</Label>
                <textarea value={power.description} rows={4} className="mt-0.5 w-full rounded-md border bg-card px-2 py-1 text-sm"
                  onChange={e => updatePower(power.id, { description: e.target.value })} /></div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground space-y-0.5">
              {[['Display', power.display], ['Time', power.manifestingTime], ['Range', power.range], ['Duration', power.duration], ['Save', power.save], ['PR', power.powerResistance], ['Augment', power.augment]]
                .filter(([, v]) => v).map(([k, v]) => <div key={k}><span className="font-medium">{k}:</span> {v}</div>)}
              {power.description && <p className="whitespace-pre-wrap pt-1">{power.description}</p>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
