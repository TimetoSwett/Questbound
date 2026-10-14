'use client';

import { useState } from 'react';
import { Bookmark, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LibraryTermPopover } from '@/components/library/library-term-popover';
import { SpellPicker } from '@/components/library/spell-picker';
import { rulesUrl, type LibrarySpell } from '@/components/library/types';

export interface SpellEntry { clientId: string; name: string; level: number; school: string; description: string; cast: number; maxCast: number; libraryEntryId?: string; sourceUrl?: string | null; summary?: string; pool?: string; dcAbility?: string; }

type Props = {
  spell: SpellEntry; editable: boolean; classes: string[]; dc: number | null;
  pools?: { name: string }[];
  shared?: { used: number; max: number } | null;
  onShared?: (used: number) => void;
  onPatch: (partial: Partial<SpellEntry>) => void;
  onPickEntry: (entry: LibrarySpell) => void;
  onDelete: () => void; onSaveToLibrary: () => void;
};

export function SpellCard({ spell, editable, classes, dc, pools = [], shared = null, onShared, onPatch, onPickEntry, onDelete, onSaveToLibrary }: Props) {
  const [editing, setEditing] = useState(editable && !spell.name);
  const href = rulesUrl(spell.sourceUrl);
  return <div className="min-h-[300px] flex flex-col gap-3 bg-muted/50 rounded-lg p-3 border border-border">
    <div>
      <h5 className="font-display font-semibold break-words">{spell.libraryEntryId ? <LibraryTermPopover term={spell.name} entryId={spell.libraryEntryId}>{spell.name}</LibraryTermPopover> : spell.name || 'Unnamed spell'}</h5>
      <p className="text-xs text-muted-foreground">Level {spell.level ?? 0} · {spell.school}{spell.pool ? ` · ${spell.pool}` : ''}</p>
    </div>
    <p className="text-sm font-mono font-semibold" title={dc === null ? 'Pick a casting ability to calculate the DC' : undefined}>Save DC {dc ?? '—'}</p>
    <div className="flex items-center gap-2 text-xs">
      {shared ? <>
        <span>Pool slots {shared.used} / {shared.max}</span>
        {editable && onShared && <>
          <Button variant="ghost" size="icon-sm" className="h-5 w-5" aria-label={`Refund a slot of ${spell.name}`} onClick={() => onShared(Math.max(0, shared.used - 1))}>-</Button>
          <Button variant="ghost" size="icon-sm" className="h-5 w-5" aria-label={`Spend a slot of ${spell.name}`} disabled={shared.max > 0 && shared.used >= shared.max} onClick={() => onShared(shared.max > 0 ? Math.min(shared.max, shared.used + 1) : shared.used + 1)}>+</Button>
        </>}
      </> : <>
      <span>Used {spell.cast ?? 0} / {spell.maxCast ?? 1} per day</span>
      {editable && <>
        <Button variant="ghost" size="icon-sm" className="h-5 w-5" aria-label={`Decrease uses of ${spell.name}`} onClick={() => onPatch({ cast: Math.max(0, (spell.cast ?? 0) - 1) })}>-</Button>
        <Button variant="ghost" size="icon-sm" className="h-5 w-5" aria-label={`Increase uses of ${spell.name}`} disabled={spell.maxCast > 0 && (spell.cast ?? 0) >= spell.maxCast} onClick={() => onPatch({ cast: spell.maxCast > 0 ? Math.min(spell.maxCast, (spell.cast ?? 0) + 1) : (spell.cast ?? 0) + 1 })}>+</Button>
      </>}
      </>}
    </div>
    <div className="flex-1"><p className="line-clamp-3 whitespace-pre-line text-xs text-muted-foreground">{spell.summary || spell.description}</p></div>
    {href && <a href={href} target="_blank" rel="noopener noreferrer" className="inline-block text-xs text-primary hover:underline">See full rules</a>}
    {editable && <>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" aria-expanded={editing} onClick={() => setEditing(value => !value)}><Pencil className="w-3 h-3" /> Edit</Button>
        <Button variant="ghost" size="icon-sm" title="Save to library" aria-label="Save to library" onClick={onSaveToLibrary}><Bookmark className="w-3 h-3" /></Button>
        <Button variant="ghost" size="icon-sm" aria-label={`Delete ${spell.name}`} onClick={onDelete}><Trash2 className="w-3 h-3 text-destructive" /></Button>
      </div>
      {editing && <div className="space-y-2">
        <SpellPicker value={spell.name ?? ''} classes={classes}
          onChange={name => onPatch({ name, libraryEntryId: undefined, sourceUrl: null, summary: undefined })} onPick={onPickEntry} />
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-muted-foreground">Level<Input type="number" value={spell.level ?? 0} onChange={e => onPatch({ level: parseInt(e.target.value) || 0 })} className="h-7 text-xs font-mono" /></label>
          <label className="text-xs text-muted-foreground">School<Input value={spell.school ?? ''} onChange={e => onPatch({ school: e.target.value })} className="h-7 text-xs" placeholder="School" /></label>
          <label className="text-xs text-muted-foreground">Per day<Input type="number" value={spell.maxCast ?? 1} onChange={e => onPatch({ maxCast: parseInt(e.target.value) || 0 })} className="h-7 text-xs font-mono" /></label>
          <label className="text-xs text-muted-foreground">DC ability
            <select value={spell.dcAbility ?? ''} onChange={e => onPatch({ dcAbility: e.target.value })} className="mt-1 h-7 w-full rounded-md border border-input bg-background px-2 text-xs">
              <option value="">From pool or class</option>
              {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map(ability => <option key={ability} value={ability}>{ability.toUpperCase()}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted-foreground col-span-2">Casting pool
            <select value={spell.pool ?? ''} onChange={e => onPatch({ pool: e.target.value })} className="mt-1 h-7 w-full rounded-md border border-input bg-background px-2 text-xs">
              <option value="">Own uses (not in a pool)</option>
              {pools.map(pool => <option key={pool.name} value={pool.name}>{pool.name}</option>)}
            </select>
          </label>
        </div>
        <label className="block text-xs text-muted-foreground">Description<textarea value={spell.description ?? ''} onChange={e => onPatch({ description: e.target.value })} className="w-full bg-transparent text-xs text-muted-foreground resize-y min-h-[60px] mt-1" placeholder="Description..." /></label>
      </div>}
    </>}
  </div>;
}
