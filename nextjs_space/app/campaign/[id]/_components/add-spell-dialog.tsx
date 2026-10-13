'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export interface SpellLibraryPrefill {
  name?: string;
  school?: string;
  description?: string;
  level?: number;
}

interface ClassLevelRow {
  cls: string;
  level: string;
}

export function AddSpellToLibraryDialog({ open, onClose, prefill, onCreated }: {
  open: boolean;
  onClose: () => void;
  prefill?: SpellLibraryPrefill;
  onCreated?: (entry: { id: string; name: string }) => void;
}) {
  // Render the form with a key so prefill applies fresh each time it opens.
  if (!open) return null;
  return <SpellForm key={JSON.stringify(prefill ?? null)} prefill={prefill} onClose={onClose} onCreated={onCreated} />;
}

function SpellForm({ prefill, onClose, onCreated }: {
  prefill?: SpellLibraryPrefill;
  onClose: () => void;
  onCreated?: (entry: { id: string; name: string }) => void;
}) {
  const [name, setName] = useState(prefill?.name ?? '');
  const [school, setSchool] = useState(prefill?.school ?? '');
  const [subschool, setSubschool] = useState('');
  const [descriptors, setDescriptors] = useState('');
  const [castingTime, setCastingTime] = useState('');
  const [components, setComponents] = useState('');
  const [range, setRange] = useState('');
  const [areaTargetEffect, setAreaTargetEffect] = useState('');
  const [duration, setDuration] = useState('');
  const [savingThrow, setSavingThrow] = useState('');
  const [spellResistance, setSpellResistance] = useState('');
  const [description, setDescription] = useState(prefill?.description ?? '');
  const [levels, setLevels] = useState<ClassLevelRow[]>([
    { cls: '', level: prefill?.level !== undefined ? String(prefill.level) : '' },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addLevelRow = () => setLevels((rows) => [...rows, { cls: '', level: '' }]);
  const removeLevelRow = (i: number) => setLevels((rows) => rows.filter((_, j) => j !== i));

  const save = async () => {
    if (!name.trim()) { setError('Name is required.'); return; }
    setBusy(true);
    setError(null);
    try {
      const spellLevels = levels
        .filter((r) => r.cls.trim() !== '' || r.level.trim() !== '')
        .map((r) => ({ cls: r.cls.trim(), level: parseInt(r.level, 10) }));
      const body = {
        kind: 'spell',
        name: name.trim(),
        data: {
          school: school.trim(),
          subschool: subschool.trim(),
          descriptors: descriptors.split(',').map((d) => d.trim()).filter(Boolean),
          castingTime: castingTime.trim(),
          components: components.trim(),
          range: range.trim(),
          areaTargetEffect: areaTargetEffect.trim(),
          duration: duration.trim(),
          savingThrow: savingThrow.trim(),
          spellResistance: spellResistance.trim(),
          description: description.trim(),
        },
        spellLevels,
      };
      const res = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 201) {
        toast.success(`Added "${data?.name ?? name.trim()}" to the library`);
        onCreated?.({ id: data.id, name: data?.name ?? name.trim() });
        onClose();
      } else if (res.status === 409) {
        setError(data?.error ?? 'A spell with that name is already in the library.');
      } else if (res.status === 413) {
        setError('That spell is too large for the library (64KB limit). Shorten the description and try again.');
      } else if (res.status === 400) {
        const issues = (data?.issues ?? []).map((i: { message?: string; path?: (string | number)[] }) =>
          i.path?.length ? `${i.path.join('.')}: ${i.message}` : i.message
        ).filter(Boolean);
        setError(issues.length ? `Invalid spell: ${issues.slice(0, 3).join('; ')}` : (data?.error ?? 'That spell is not valid. Check the fields and try again.'));
      } else {
        setError(data?.error ?? 'Could not save to the library. Try again.');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-card rounded-lg border border-border p-5 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h4 className="font-display font-semibold mb-4">Add spell to library</h4>
        <div className="grid gap-3">
          {field('Name *', name, setName, 'Fireball')}
          <div className="grid grid-cols-2 gap-3">
            {field('School', school, setSchool, 'Evocation')}
            {field('Subschool', subschool, setSubschool, 'Fire')}
          </div>
          {field('Descriptors (comma-separated)', descriptors, setDescriptors, 'fire, force')}
          <div className="grid grid-cols-2 gap-3">
            {field('Casting time', castingTime, setCastingTime, '1 standard action')}
            {field('Components', components, setComponents, 'V, S, M')}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {field('Range', range, setRange, 'Long (400 ft. + 40 ft./level)')}
            {field('Area / Target / Effect', areaTargetEffect, setAreaTargetEffect, '20-ft.-radius spread')}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {field('Duration', duration, setDuration, 'Instantaneous')}
            {field('Saving throw', savingThrow, setSavingThrow, 'Reflex half')}
            {field('Spell resistance', spellResistance, setSpellResistance, 'Yes')}
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Full spell description..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[100px] resize-y outline-none"
            />
          </label>
          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted-foreground">Class / Level</span>
            {levels.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={row.cls}
                  onChange={(e) => setLevels((rows) => rows.map((r, j) => j === i ? { ...r, cls: e.target.value } : r))}
                  placeholder="wizard"
                  className="h-8 text-sm flex-1"
                />
                <Input
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
            <p className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">{error}</p>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save to library'}</Button>
        </div>
      </div>
    </div>
  );
}
