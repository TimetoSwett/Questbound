'use client';

import { useState } from 'react';
import { FeatEntryFields } from '@/components/library/feat-entry-fields';
import { AbilityEntryFields } from '@/components/library/ability-entry-fields';
import { GearEntryFields } from '@/components/library/gear-entry-fields';
import {
  featFormFromEntry, featPatchFromForm, abilityFormFromEntry, abilityPatchFromForm,
  gearFormFromItem, gearPatchFromForm, nextDraft,
} from '@/lib/sheet-entry-forms';

export function SheetFeatEditor({ entry, onPatch, idPrefix }: {
  entry: Parameters<typeof featFormFromEntry>[0];
  onPatch: (patch: Extract<ReturnType<typeof featPatchFromForm>, { ok: true }>['patch']) => void;
  idPrefix: string;
}) {
  const [form, setForm] = useState(() => featFormFromEntry(entry));
  const [lastSynced, setLastSynced] = useState(() => JSON.stringify(featFormFromEntry(entry)));
  const [error, setError] = useState('');
  // Adjust this component's state during render to avoid an effect-triggered update.
  const synced = nextDraft(form, lastSynced, featFormFromEntry(entry), !error);
  if (synced.lastSynced !== lastSynced) {
    setForm(synced.draft);
    setLastSynced(synced.lastSynced);
  }
  const change = (next: typeof form) => {
    setForm(next);
    const result = featPatchFromForm(next);
    if (result.ok) {
      setLastSynced(JSON.stringify(featFormFromEntry({ ...entry, ...result.patch })));
      onPatch(result.patch);
      setError('');
    } else setError(result.error);
  };
  return <div className="space-y-2">
    <FeatEntryFields form={form} onChange={change} idPrefix={idPrefix} />
    <label className="block text-xs text-muted-foreground" htmlFor={`${idPrefix}-description`}>Description
      <textarea id={`${idPrefix}-description`} value={form.description} onChange={(event) => change({ ...form, description: event.target.value })} className="w-full bg-transparent text-xs text-muted-foreground resize-y min-h-[60px] mt-1" placeholder="Description..." />
    </label>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>;
}

export function SheetAbilityEditor({ entry, onPatch, idPrefix }: {
  entry: Parameters<typeof abilityFormFromEntry>[0];
  onPatch: (patch: Extract<ReturnType<typeof abilityPatchFromForm>, { ok: true }>['patch']) => void;
  idPrefix: string;
}) {
  const [form, setForm] = useState(() => abilityFormFromEntry(entry));
  const [lastSynced, setLastSynced] = useState(() => JSON.stringify(abilityFormFromEntry(entry)));
  const [error, setError] = useState('');
  // Adjust this component's state during render to avoid an effect-triggered update.
  const synced = nextDraft(form, lastSynced, abilityFormFromEntry(entry), !error);
  if (synced.lastSynced !== lastSynced) {
    setForm(synced.draft);
    setLastSynced(synced.lastSynced);
  }
  const change = (next: typeof form) => {
    setForm(next);
    const result = abilityPatchFromForm(next);
    if (result.ok) {
      setLastSynced(JSON.stringify(abilityFormFromEntry({ ...entry, ...result.patch })));
      onPatch(result.patch);
      setError('');
    } else setError(result.error);
  };
  return <div className="space-y-2">
    <AbilityEntryFields form={form} onChange={change} idPrefix={idPrefix} />
    <label className="block text-xs text-muted-foreground" htmlFor={`${idPrefix}-description`}>Description
      <textarea id={`${idPrefix}-description`} value={form.description} onChange={(event) => change({ ...form, description: event.target.value })} className="w-full bg-transparent text-xs text-muted-foreground resize-y min-h-[60px] mt-1" placeholder="Description..." />
    </label>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>;
}

export function SheetGearEditor({ item, onPatch, idPrefix }: {
  item: Parameters<typeof gearFormFromItem>[0];
  onPatch: (patch: Extract<ReturnType<typeof gearPatchFromForm>, { ok: true }>['patch']) => void;
  idPrefix: string;
}) {
  const [form, setForm] = useState(() => gearFormFromItem(item));
  const [lastSynced, setLastSynced] = useState(() => JSON.stringify(gearFormFromItem(item)));
  const [error, setError] = useState('');
  // Adjust this component's state during render to avoid an effect-triggered update.
  const synced = nextDraft(form, lastSynced, gearFormFromItem(item), !error);
  if (synced.lastSynced !== lastSynced) {
    setForm(synced.draft);
    setLastSynced(synced.lastSynced);
  }
  const change = (next: typeof form) => {
    setForm(next);
    const result = gearPatchFromForm(next);
    if (result.ok) {
      setLastSynced(JSON.stringify(gearFormFromItem({ ...item, ...result.patch })));
      onPatch(result.patch);
      setError('');
    } else setError(result.error);
  };
  return <div className="space-y-2">
    <GearEntryFields form={form} onChange={change} idPrefix={idPrefix} />
    <label className="block text-xs text-muted-foreground" htmlFor={`${idPrefix}-description`}>Notes
      <textarea id={`${idPrefix}-description`} value={form.description} onChange={(event) => change({ ...form, description: event.target.value })} className="w-full bg-transparent text-xs text-muted-foreground resize-y min-h-[60px] mt-1" placeholder="Description..." />
    </label>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>;
}

