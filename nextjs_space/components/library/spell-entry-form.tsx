'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { buildSpellBody, emptySpellForm, spellSaveError, type SpellFormState } from '@/lib/library-spell-form';

export function SpellEntryForm({ prefill, onCancel, onCreated, submitLabel = 'Save to library' }: {
  prefill?: Parameters<typeof emptySpellForm>[0];
  onCancel?: () => void;
  onCreated: (entry: { id: string; name: string }) => void;
  submitLabel?: string;
}) {
  const [form, setForm] = useState<SpellFormState>(() => emptySpellForm(prefill));
  const { levels } = form;
  const update = (key: Exclude<keyof SpellFormState, 'levels'>, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const setLevels = (change: (rows: SpellFormState['levels']) => SpellFormState['levels']) => setForm((current) => ({ ...current, levels: change(current.levels) }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addLevelRow = () => setLevels((rows) => [...rows, { cls: '', level: '' }]);
  const removeLevelRow = (i: number) => setLevels((rows) => rows.filter((_, j) => j !== i));

  const save = async () => {
    const result = buildSpellBody(form);
    if (!result.ok) { setError(result.error); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result.body),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 201) {
        toast.success(`Added "${data?.name ?? form.name.trim()}" to the library`);
        onCreated({ id: data.id, name: data?.name ?? form.name.trim() });
      } else {
        setError(spellSaveError(res.status, data));
      }
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const field = (label: string, value: string, onChange: (v: string) => void, placeholder = '') => (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-8 text-sm" />
    </label>
  );

  return (
    <>
      <div className="grid gap-3">
        {field('Name *', form.name, (value) => update('name', value), 'Fireball')}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {field('School', form.school, (value) => update('school', value), 'Evocation')}
          {field('Subschool', form.subschool, (value) => update('subschool', value), 'Fire')}
        </div>
        {field('Descriptors (comma-separated)', form.descriptors, (value) => update('descriptors', value), 'fire, force')}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {field('Casting time', form.castingTime, (value) => update('castingTime', value), '1 standard action')}
          {field('Components', form.components, (value) => update('components', value), 'V, S, M')}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {field('Range', form.range, (value) => update('range', value), 'Long (400 ft. + 40 ft./level)')}
          {field('Area / Target / Effect', form.areaTargetEffect, (value) => update('areaTargetEffect', value), '20-ft.-radius spread')}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {field('Duration', form.duration, (value) => update('duration', value), 'Instantaneous')}
          {field('Saving throw', form.savingThrow, (value) => update('savingThrow', value), 'Reflex half')}
          {field('Spell resistance', form.spellResistance, (value) => update('spellResistance', value), 'Yes')}
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Description</span>
          <textarea
            value={form.description}
            onChange={(e) => update('description', e.target.value)}
            placeholder="Full spell description..."
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[100px] resize-y outline-none"
          />
        </label>
        <div className="flex flex-col gap-2">
          <span className="text-xs text-muted-foreground">Class / Level</span>
          {levels.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                aria-label="Class"
                value={row.cls}
                onChange={(e) => setLevels((rows) => rows.map((r, j) => j === i ? { ...r, cls: e.target.value } : r))}
                placeholder="wizard"
                className="h-8 text-sm flex-1"
              />
              <Input
                aria-label="Spell level"
                type="number" min="0" max="9"
                value={row.level}
                onChange={(e) => setLevels((rows) => rows.map((r, j) => j === i ? { ...r, level: e.target.value } : r))}
                placeholder="3"
                className="h-8 text-sm w-20 text-center font-mono"
              />
              {levels.length > 1 && (
                <Button variant="ghost" size="icon-sm" onClick={() => removeLevelRow(i)} title="Remove row">
                  ×
                </Button>
              )}
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={addLevelRow} className="self-start">+ Add class</Button>
        </div>
        {error && (
          <p role="alert" className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">{error}</p>
        )}
      </div>
      <div className="flex justify-end gap-2 mt-5">
        {onCancel && <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>}
        <Button size="sm" disabled={busy} onClick={save}>{busy ? 'Saving…' : submitLabel}</Button>
      </div>
    </>
  );
}
