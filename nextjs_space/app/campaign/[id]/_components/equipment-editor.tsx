'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BODY_SLOTS, UNSLOTTED_SLOTS, equipmentEffects, weaponTotals } from '@/lib/equipment';
import type { Equipped, SlotItem, ArmorPiece, Weapon } from '@/lib/equipment';
import { formatMod } from '@/lib/pf1e-skills';
import { CatalogSearchDialog } from '@/components/library/catalog-search-dialog';
import { rulesUrl } from '@/components/library/types';
import { armorFromLibrary, weaponFromLibrary } from '@/lib/catalog';
import type { ArmorData, WeaponData } from '@/lib/library';
interface Choice { id: string; name: string; characterId: string | null }
const labels = ['Head', 'Headband', 'Eyes', 'Shoulders', 'Neck', 'Chest', 'Body', 'Armor', 'Belt', 'Wrists', 'Hands', 'Ring 1', 'Ring 2', 'Feet', 'Unslotted 1', 'Unslotted 2'];
const emptyArmor: ArmorPiece = { name: '', acBonus: 0, maxDex: null, checkPenalty: 0, spellFailure: 0 };
const emptyWeapon: Weapon = { name: '', attackBonus: 0, ability: 'str', damage: '1d6', damageBonus: 0, crit: '20/x2', range: 0, type: '' };
export function EquipmentEditor({ value, onChange, characterId, campaignId, editable, bab, strMod, dexMod, sizeMod }: {
  value: Equipped; onChange: (value: Equipped) => void; characterId: string; campaignId: string | null; editable: boolean; bab: number; strMod: number; dexMod: number; sizeMod: number;
}) {
  const [items, setItems] = useState<Choice[]>([]);
  const [error, setError] = useState(false);
  const [picker, setPicker] = useState<null | 'armor' | 'shield' | 'weapon'>(null);
  useEffect(() => {
    let active = true;
    if (!campaignId) return;
    fetch(`/api/loot?campaignId=${encodeURIComponent(campaignId)}`).then(async res => {
      if (!res.ok) throw Error('Inventory unavailable');
      const result = await res.json();
      if (active) setItems(result.items.filter((item: Choice) => item.characterId === characterId));
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [campaignId, characterId]);
  const identity = <T extends SlotItem,>(item: T, change: (item: T) => void, label: string) => <div className="space-y-2">
    <Label>{label}</Label>
    <Input aria-label={`${label} name`} maxLength={200} value={item.name} disabled={!editable} placeholder="Type item name" onChange={e => change({ ...item, name: e.target.value, inventoryItemId: null, libraryEntryId: undefined, sourceUrl: null })} />
    {rulesUrl(item.sourceUrl) && <a href={rulesUrl(item.sourceUrl)} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">See full rules</a>}
    <select aria-label={`${label} inventory item`} className="w-full min-h-[44px] rounded-md border bg-card px-2 text-sm" value={item.inventoryItemId ?? ''} disabled={!editable || !campaignId} onChange={e => {
      const selected = items.find(i => i.id === e.target.value);
      change({ ...item, ...(selected ? { name: selected.name, inventoryItemId: selected.id, libraryEntryId: undefined, sourceUrl: null } : { inventoryItemId: null }) });
    }}><option value="">Manual entry / choose carried item</option>
      {item.inventoryItemId && !items.some(i => i.id === item.inventoryItemId) && <option value={item.inventoryItemId}>Unavailable: {item.name}</option>}
      {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
    </select>
    <Input aria-label={`${label} notes`} maxLength={5000} value={item.notes ?? ''} disabled={!editable} placeholder="Notes" onChange={e => change({ ...item, notes: e.target.value })} />
  </div>;
  const numeric = (label: string, current: number | null | undefined, change: (v: number | null) => void, nullable = false, min = -1000, max = 1000) => <div key={label}><Label className="text-xs">{label}</Label><Input aria-label={label} type="number" min={min} max={max} value={current ?? ''} placeholder={nullable ? 'Unlimited' : '0'} disabled={!editable} onChange={e => change(nullable && e.target.value === '' ? null : Math.max(min, Math.min(max, Number(e.target.value) || 0)))} /></div>;
  const effects = equipmentEffects(value);
  return <div className="space-y-4">
    <p className="text-sm">Armor check penalty: {formatMod(effects.checkPenalty)} · Spell failure: {effects.spellFailure}% · Max Dex: {effects.maxDex ?? 'Unlimited'}</p>
    {error && <p className="text-sm text-destructive">Inventory unavailable. Items can still be entered by hand.</p>}
    <div className="grid gap-4 md:grid-cols-2">{(['armor', 'shield'] as const).map(key => {
      const item = value[key] ?? emptyArmor;
      const change = (next: ArmorPiece) => onChange({ ...value, [key]: next });
      return <div key={key} className="rounded-lg border bg-card p-4 space-y-3">
        {identity(item, change, key === 'armor' ? 'Armor' : 'Shield')}
        <div className="grid grid-cols-2 gap-3">
          {numeric('AC bonus', item.acBonus, v => change({ ...item, acBonus: v ?? 0 }))}
          {numeric('Max Dex', item.maxDex, v => change({ ...item, maxDex: v }), true)}
          {numeric('Armor check penalty', item.checkPenalty, v => change({ ...item, checkPenalty: v ?? 0 }), false, -1000, 0)}
          {numeric('Spell failure %', item.spellFailure, v => change({ ...item, spellFailure: v ?? 0 }), false, 0, 100)}
        </div>
        {editable && <div className="flex flex-wrap gap-2"><Button variant="ghost" onClick={() => setPicker(key)}>From armory</Button><Button variant="ghost" onClick={() => onChange({ ...value, [key]: null })}>Unequip {key}</Button></div>}
      </div>;
    })}</div>
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <div className="flex flex-wrap justify-between gap-2"><h3>Weapons</h3>{editable && <div className="flex gap-1"><Button variant="ghost" disabled={(value.weapons?.length ?? 0) >= 50} onClick={() => setPicker('weapon')}>+ From armory</Button><Button variant="ghost" disabled={(value.weapons?.length ?? 0) >= 50} onClick={() => onChange({ ...value, weapons: [...(value.weapons ?? []), { ...emptyWeapon }] })}>+ Custom weapon</Button></div>}</div>
      {(value.weapons ?? []).map((weapon, index) => {
        const change = (next: Weapon) => onChange({ ...value, weapons: value.weapons?.map((w, i) => i === index ? next : w) });
        const totals = weaponTotals(weapon, bab, strMod, dexMod, sizeMod);
        return <div key={index} className="rounded-md border p-3 space-y-3">
          {identity(weapon, change, `Weapon ${index + 1}`)}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {numeric('Attack bonus', weapon.attackBonus, v => change({ ...weapon, attackBonus: v ?? 0 }))}
            <div><Label>Attack ability</Label><select aria-label="Attack ability" className="w-full min-h-[44px] rounded-md border bg-card" disabled={!editable} value={weapon.ability} onChange={e => change({ ...weapon, ability: e.target.value as 'str' | 'dex' })}><option value="str">Strength</option><option value="dex">Dexterity</option></select></div>
            {(['damage', 'crit', 'type'] as const).map(field => <div key={field}><Label>{field === 'damage' ? 'Damage dice' : field === 'crit' ? 'Critical' : 'Damage type'}</Label><Input aria-label={field} maxLength={100} value={weapon[field]} disabled={!editable} onChange={e => change({ ...weapon, [field]: e.target.value })} /></div>)}
            {numeric('Damage bonus', weapon.damageBonus, v => change({ ...weapon, damageBonus: v ?? 0 }))}
            <div><Label>Weapon category</Label><select aria-label="Weapon category" className="w-full min-h-[44px] rounded-md border bg-card" disabled={!editable} value={weapon.category ?? 'melee'} onChange={e => change({ ...weapon, category: e.target.value as Weapon['category'] })}><option value="melee">Melee</option><option value="ranged">Ranged</option><option value="thrown">Thrown</option><option value="composite">Composite</option></select></div>
            {numeric('Range (ft)', weapon.range, v => change({ ...weapon, range: v ?? 0 }), false, 0, 100000)}
          </div>
          <p className="font-mono text-sm">Attack {formatMod(totals.attack)} · Damage {totals.damage}</p>
          <p className="text-xs text-muted-foreground">Attack includes BAB, selected ability, bonus and size. Damage includes damage bonus, plus Strength for melee, thrown and composite weapons.</p>
          {editable && <Button variant="ghost" onClick={() => onChange({ ...value, weapons: value.weapons?.filter((_, i) => i !== index) })}>Remove weapon</Button>}
        </div>;
      })}
    </div>
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{[...BODY_SLOTS, ...UNSLOTTED_SLOTS].map((slot, i) => <div key={slot} className="rounded-lg border bg-card p-3 space-y-2">
      {identity(value.slots?.[slot] ?? { name: '' }, item => onChange({ ...value, slots: { ...value.slots, [slot]: item } }), labels[i])}
      {editable && <Button variant="ghost" onClick={() => onChange({ ...value, slots: { ...value.slots, [slot]: null } })}>Clear slot</Button>}
    </div>)}</div>
    {picker && <CatalogSearchDialog
      title={picker === 'weapon' ? 'Add weapon' : picker === 'shield' ? 'Add shield' : 'Add armor'}
      description="Search the armory, then click a piece to equip it."
      queries={picker === 'weapon' ? [{ kind: 'weapon', label: 'Weapons' }] : [{ kind: 'armor', slot: picker, label: picker === 'shield' ? 'Shields' : 'Armor' }]}
      knownIds={[value.armor?.libraryEntryId, value.shield?.libraryEntryId, ...(value.weapons ?? []).map((weapon) => weapon.libraryEntryId)].filter((id): id is string => Boolean(id))}
      onClose={() => setPicker(null)}
      onPick={(entry) => {
        if (picker === 'weapon') {
          const weapon = weaponFromLibrary(entry.name, (entry.data ?? {}) as WeaponData, { libraryEntryId: entry.id, sourceUrl: entry.sourceUrl });
          onChange({ ...value, weapons: [...(value.weapons ?? []), weapon] });
        } else {
          const piece = armorFromLibrary(entry.name, { ...((entry.data ?? {}) as ArmorData), slot: picker }, { libraryEntryId: entry.id, sourceUrl: entry.sourceUrl });
          onChange({ ...value, [picker]: piece });
        }
      }}
    />}
  </div>;
}
