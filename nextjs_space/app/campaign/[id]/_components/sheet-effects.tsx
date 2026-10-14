'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CatalogSearchDialog } from '@/components/library/catalog-search-dialog';
import { rulesUrl } from '@/components/library/types';
import { TOGGLES } from '@/lib/conditions';
import { bonusLabel, type CharacterBuff, type Equipped, type ItemBonus } from '@/lib/equipment';
import { BonusEditor } from './equipment-editor';

export function SheetEffects({ equipped, editable, onChange }: {
  equipped: Equipped;
  editable: boolean;
  onChange: (next: Equipped) => void;
}) {
  const [spellOpen, setSpellOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const conditions = equipped.conditions ?? [];
  const buffs = equipped.buffs ?? [];
  const active = new Set(conditions);
  const setConditions = (ids: string[]) => onChange({ ...equipped, conditions: ids });
  const setBuffs = (next: CharacterBuff[]) => onChange({ ...equipped, buffs: next });
  const press = (id: string) => {
    const toggle = TOGGLES.find(item => item.id === id);
    const ids = new Set(conditions);
    if (ids.has(id)) ids.delete(id);
    else {
      if (toggle?.group) for (const other of TOGGLES) if (other.group === toggle.group) ids.delete(other.id);
      ids.add(id);
    }
    setConditions([...ids]);
  };
  const addBuff = (buff: CharacterBuff) => {
    const next = [...buffs, buff];
    setBuffs(next);
    setEditing(next.length - 1);
  };
  return <div className="bg-card rounded-lg border border-border p-4 space-y-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
    {(['condition', 'buff'] as const).map(section => <div key={section} className="space-y-2">
      <h3 className="font-display font-semibold text-sm">{section === 'condition' ? 'Conditions' : 'Common buffs'}</h3>
      <div className="flex flex-wrap gap-1">
        {TOGGLES.filter(toggle => toggle.section === section).map(toggle => <button key={toggle.id} type="button" aria-pressed={active.has(toggle.id)} disabled={!editable} title={toggle.detail} onClick={() => press(toggle.id)}
          className={`rounded-full border px-3 py-1 text-xs min-h-[32px] ${active.has(toggle.id) ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground hover:text-foreground'}`}>
          {toggle.label}
        </button>)}
      </div>
    </div>)}
    {TOGGLES.filter(toggle => active.has(toggle.id)).map(toggle => <p key={toggle.id} className="text-xs text-muted-foreground">{toggle.label}: {toggle.detail}</p>)}
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display font-semibold text-sm">Custom buffs</h3>
        {editable && <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => addBuff({ name: '', on: true, bonuses: [] })}>+ Custom</Button>
          <Button variant="ghost" size="sm" onClick={() => setSpellOpen(true)}>+ From a spell</Button>
        </div>}
      </div>
      <p className="text-xs text-muted-foreground">A spell link does not guess the bonus. Turn the buff on, then say what it changes.</p>
      {buffs.length === 0 ? <p className="text-xs text-muted-foreground">No custom buffs.</p> : buffs.map((buff, index) => {
        const href = rulesUrl(buff.sourceUrl);
        return <div key={index} className="rounded-md border p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" aria-pressed={buff.on} disabled={!editable} onClick={() => setBuffs(buffs.map((item, i) => i === index ? { ...item, on: !item.on } : item))}
              className={`rounded-full border px-3 py-1 text-xs min-h-[32px] ${buff.on ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground'}`}>{buff.on ? 'On' : 'Off'}</button>
            {editable ? <Input aria-label="Buff name" maxLength={200} value={buff.name} placeholder="Buff name" className="h-8 flex-1 text-sm" onChange={e => setBuffs(buffs.map((item, i) => i === index ? { ...item, name: e.target.value } : item))} /> : <span className="text-sm font-medium">{buff.name || 'Unnamed buff'}</span>}
          </div>
          {!!buff.bonuses?.length && editing !== index && <p className="text-xs font-medium">{buff.bonuses.map(bonusLabel).join(' · ')}</p>}
          {href && <a href={href} target="_blank" rel="noopener noreferrer" className="inline-block text-xs text-primary hover:underline">See full rules</a>}
          {editable && <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => setEditing(editing === index ? null : index)}>{editing === index ? 'Done' : 'Edit bonuses'}</Button>
            <Button variant="ghost" size="sm" onClick={() => { setEditing(current => current === index ? null : current); setBuffs(buffs.filter((_, i) => i !== index)); }}>Remove</Button>
          </div>}
          {editable && editing === index && <BonusEditor bonuses={buff.bonuses ?? []} hint="This buff counts while it is on." onChange={(bonuses: ItemBonus[]) => setBuffs(buffs.map((item, i) => i === index ? { ...item, bonuses } : item))} />}
        </div>;
      })}
    </div>
    {spellOpen && <CatalogSearchDialog title="Add a spell buff" description="Pick a spell, then set the bonus on your sheet. The spell text is not applied by itself." queries={[{ kind: 'spell', label: 'Spells' }]} knownIds={buffs.flatMap(buff => buff.libraryEntryId ? [buff.libraryEntryId] : [])} onClose={() => setSpellOpen(false)} onPick={(entry) => {
      addBuff({ name: entry.name, on: true, bonuses: [], libraryEntryId: entry.id, sourceUrl: entry.sourceUrl });
      setSpellOpen(false);
    }} />}
  </div>;
}
