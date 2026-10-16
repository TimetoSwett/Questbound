'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BODY_SLOTS, STACKS, STACK_LABELS, UNSLOTTED_SLOTS, bonusLabel, equipmentEffects, weaponTotals } from '@/lib/equipment';
import type { AcBonusName, AbilityName, Equipped, ItemBonus, SaveBonusName, SlotItem, ArmorPiece, StackKind, Weapon } from '@/lib/equipment';
import { PF1E_SKILLS, formatMod } from '@/lib/pf1e-skills';
import { CatalogSearchDialog } from '@/components/library/catalog-search-dialog';
import { rulesUrl } from '@/components/library/types';
import { armorFromLibrary, slotFromLibrary, weaponFromLibrary } from '@/lib/catalog';
import type { ArmorData, GearData, WeaponData } from '@/lib/library';
interface Choice { id: string; name: string; characterId: string | null }
const labels = ['Head', 'Headband', 'Eyes', 'Shoulders', 'Neck', 'Chest', 'Body', 'Armor', 'Belt', 'Wrists', 'Hands', 'Ring 1', 'Ring 2', 'Feet', 'Unslotted 1', 'Unslotted 2'];

function wornEffect(notes: string | undefined): string {
  const text = (notes ?? '').replace(/\r/g, '').trim();
  if (!text) return '';
  const body = text.split(/\n\s*Construction\b/i)[0].trim();
  const parts = body.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const prose = parts.filter((part) => !/^slot\s/i.test(part));
  return (prose.length ? prose : parts).join('\n\n');
}
const emptyArmor: ArmorPiece = { name: '', acBonus: 0, maxDex: null, checkPenalty: 0, spellFailure: 0 };
const emptyWeapon: Weapon = { name: '', attackBonus: 0, ability: 'str', damage: '1d6', damageBonus: 0, crit: '20/x2', range: 0, type: '' };
function blankBonus(kind: ItemBonus['kind']): ItemBonus {
  if (kind === 'ability') return { kind, ability: 'wis', amount: 2 };
  if (kind === 'ac') return { kind, bonus: 'deflection', amount: 1 };
  if (kind === 'skill') return { kind, skill: 'Perception', amount: 2 };
  if (kind === 'save') return { kind, save: 'will', amount: 1 };
  if (kind === 'attack') return { kind, amount: 1 };
  if (kind === 'damage') return { kind, amount: 1 };
  if (kind === 'init') return { kind, amount: 1 };
  return { kind: 'spell', amount: 1 };
}

export function BonusEditor({ bonuses, onChange, hint = 'This gives a bonus while it is on. These add, so do not also type the same number on the sheet.' }: { bonuses: ItemBonus[]; onChange: (bonuses: ItemBonus[]) => void; hint?: string }) {
  const update = (index: number, bonus: ItemBonus) => onChange(bonuses.map((current, i) => i === index ? bonus : current));
  return <div className="space-y-2">
    <p className="text-xs text-muted-foreground">{hint} Untyped, dodge, and penalties add. Every other type keeps only the best bonus.</p>
    {bonuses.map((bonus, index) => <div key={index} className="space-y-1 rounded-md border p-2">
      <select aria-label="Bonus kind" className="w-full min-h-[44px] rounded-md border bg-card px-2 text-sm" value={bonus.kind} onChange={e => update(index, blankBonus(e.target.value as ItemBonus['kind']))}>
        <option value="ability">Ability score</option>
        <option value="ac">Armor class</option>
        <option value="skill">Skill</option>
        <option value="save">Save</option>
        <option value="spell">Spell DC</option>
        <option value="attack">Attack</option>
        <option value="damage">Damage</option>
        <option value="init">Initiative</option>
      </select>
      {bonus.kind === 'ability' && <select aria-label="Ability" className="w-full min-h-[44px] rounded-md border bg-card px-2 text-sm" value={bonus.ability} onChange={e => update(index, { ...bonus, ability: e.target.value as AbilityName })}>
        {([['str', 'Strength'], ['dex', 'Dexterity'], ['con', 'Constitution'], ['int', 'Intelligence'], ['wis', 'Wisdom'], ['cha', 'Charisma']] as const).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>}
      {bonus.kind === 'ac' && <select aria-label="Armor class bonus" className="w-full min-h-[44px] rounded-md border bg-card px-2 text-sm" value={bonus.bonus} onChange={e => update(index, { ...bonus, bonus: e.target.value as AcBonusName })}>
        {([['armor', 'Armor'], ['shield', 'Shield'], ['natural', 'Natural armor'], ['deflection', 'Deflection'], ['dodge', 'Dodge']] as const).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>}
      {bonus.kind === 'skill' && <select aria-label="Skill" className="w-full min-h-[44px] rounded-md border bg-card px-2 text-sm" value={bonus.skill} onChange={e => update(index, { ...bonus, skill: e.target.value })}>
        {PF1E_SKILLS.map(skill => <option key={skill.name} value={skill.name}>{skill.name}</option>)}
      </select>}
      {bonus.kind === 'save' && <select aria-label="Save" className="w-full min-h-[44px] rounded-md border bg-card px-2 text-sm" value={bonus.save} onChange={e => update(index, { ...bonus, save: e.target.value as SaveBonusName })}>
        <option value="fort">Fortitude</option><option value="ref">Reflex</option><option value="will">Will</option>
      </select>}
      <div className="flex gap-1">
        <Input aria-label="Bonus amount" type="number" min={-30} max={30} value={bonus.amount} onChange={e => update(index, { ...bonus, amount: Math.max(-30, Math.min(30, parseInt(e.target.value) || 0)) } as ItemBonus)} />
        <Button variant="ghost" onClick={() => onChange(bonuses.filter((_, i) => i !== index))}>Remove</Button>
      </div>
      <select aria-label="Modifier type" className="w-full min-h-[44px] rounded-md border bg-card px-2 text-sm" value={bonus.stack ?? 'untyped'} onChange={e => update(index, { ...bonus, stack: e.target.value as StackKind })}>
        {STACKS.map(kind => <option key={kind} value={kind}>{STACK_LABELS[kind]}</option>)}
      </select>
    </div>)}
    <Button variant="ghost" onClick={() => onChange([...bonuses, blankBonus('ability')])}>Add bonus</Button>
  </div>;
}
export function EquipmentEditor({ value, onChange, characterId, campaignId, editable, bab, strMod, dexMod, sizeMod, attackMod = 0, damageMod = 0, abilityMods, size }: {
  value: Equipped; onChange: (value: Equipped) => void; characterId: string; campaignId: string | null; editable: boolean; bab: number; strMod: number; dexMod: number; sizeMod: number; attackMod?: number; damageMod?: number;
  abilityMods?: Partial<Record<AbilityName, number>>;
  size?: string | null;
}) {
  const [items, setItems] = useState<Choice[]>([]);
  const [error, setError] = useState(false);
  const [picker, setPicker] = useState<null | 'armor' | 'shield' | 'weapon'>(null);
  const [shopSlot, setShopSlot] = useState<null | (typeof BODY_SLOTS)[number] | (typeof UNSLOTTED_SLOTS)[number]>(null);
  const [editingSlot, setEditingSlot] = useState<string | null>(null);
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
        const extra = (weapon.extraAbilities ?? []).reduce((sum, ability) => sum + (abilityMods?.[ability] ?? 0), 0);
        const totals = weaponTotals(weapon, bab, strMod, dexMod, sizeMod, attackMod + extra, damageMod, size);
        return <div key={index} className="rounded-md border p-3 space-y-3">
          {identity(weapon, change, `Weapon ${index + 1}`)}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {numeric('Attack bonus', weapon.attackBonus, v => change({ ...weapon, attackBonus: v ?? 0 }))}
            <div><Label>Attack ability</Label><select aria-label="Attack ability" className="w-full min-h-[44px] rounded-md border bg-card" disabled={!editable} value={weapon.ability} onChange={e => change({ ...weapon, ability: e.target.value as 'str' | 'dex' })}><option value="str">Strength</option><option value="dex">Dexterity</option></select></div>
            <div><Label>Also add</Label><select aria-label="Extra attack ability" className="w-full min-h-[44px] rounded-md border bg-card" disabled={!editable} value={weapon.extraAbilities?.[0] ?? ''} onChange={e => change({ ...weapon, extraAbilities: e.target.value ? [e.target.value as AbilityName] : [] })}>
              <option value="">None</option>
              {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map(ability => <option key={ability} value={ability}>{ability.toUpperCase()}</option>)}
            </select></div>
            {(['damage', 'crit', 'type'] as const).map(field => <div key={field}><Label>{field === 'damage' ? 'Damage dice' : field === 'crit' ? 'Critical' : 'Damage type'}</Label><Input aria-label={field} maxLength={100} value={weapon[field]} disabled={!editable} onChange={e => change({ ...weapon, [field]: e.target.value })} /></div>)}
            {numeric('Damage bonus', weapon.damageBonus, v => change({ ...weapon, damageBonus: v ?? 0 }))}
            <div><Label>Weapon category</Label><select aria-label="Weapon category" className="w-full min-h-[44px] rounded-md border bg-card" disabled={!editable} value={weapon.category ?? 'melee'} onChange={e => change({ ...weapon, category: e.target.value as Weapon['category'] })}><option value="melee">Melee</option><option value="ranged">Ranged</option><option value="thrown">Thrown</option><option value="composite">Composite</option></select></div>
            <div><Label>Hands</Label><select aria-label="Weapon hands" className="w-full min-h-[44px] rounded-md border border-input bg-card text-foreground" disabled={!editable} value={weapon.hands ?? 'one'} onChange={e => change({ ...weapon, hands: e.target.value === 'one' ? undefined : e.target.value as Weapon['hands'] })}><option value="one">One-handed (Str ×1)</option><option value="two">Two-handed (Str ×1½)</option><option value="off">Off-hand (Str ×½)</option></select></div>
            {numeric('Range (ft)', weapon.range, v => change({ ...weapon, range: v ?? 0 }), false, 0, 100000)}
          </div>
          <p className="font-mono text-sm">Attack {formatMod(totals.attack)} · Damage {totals.damage}</p>
          <p className="text-xs text-muted-foreground">Attack includes BAB, selected ability, bonus and size. Damage includes damage bonus, plus Strength for melee, thrown and composite weapons.</p>
          {editable && <Button variant="ghost" onClick={() => onChange({ ...value, weapons: value.weapons?.filter((_, i) => i !== index) })}>Remove weapon</Button>}
        </div>;
      })}
    </div>
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{[...BODY_SLOTS, ...UNSLOTTED_SLOTS].map((slot, i) => {
      const item = value.slots?.[slot] ?? { name: '' };
      const effect = wornEffect(item.notes);
      const href = rulesUrl(item.sourceUrl);
      return <div key={slot} className="rounded-lg border bg-card p-3 space-y-2">
        <Label>{labels[i]}</Label>
        {item.libraryEntryId && editable && editingSlot === slot ? (
          <Input aria-label={`${labels[i]} name`} maxLength={200} value={item.name} autoFocus onChange={e => onChange({ ...value, slots: { ...value.slots, [slot]: { ...item, name: e.target.value } } })} />
        ) : item.libraryEntryId || !editable ? (
          item.name ? <h3 className="font-display font-semibold leading-tight">{item.name}</h3> : <p className="text-sm text-muted-foreground">Empty</p>
        ) : (
          <Input aria-label={`${labels[i]} name`} maxLength={200} value={item.name} placeholder="Empty" onChange={e => onChange({ ...value, slots: { ...value.slots, [slot]: { ...item, name: e.target.value, inventoryItemId: null, libraryEntryId: undefined, sourceUrl: null } } })} />
        )}
        {effect && <p className="max-h-40 overflow-y-auto whitespace-pre-line text-sm leading-snug text-muted-foreground">{effect}</p>}
        {editingSlot !== slot && !!item.bonuses?.length && <p className="text-xs font-medium">{item.bonuses.map(bonusLabel).join(' · ')}</p>}
        {editable && editingSlot === slot && <BonusEditor bonuses={item.bonuses ?? []} hint="This item gives a bonus while it is worn. These add, so do not also type the same number on the sheet." onChange={bonuses => onChange({ ...value, slots: { ...value.slots, [slot]: { ...item, bonuses } } })} />}
        {href && <a href={href} target="_blank" rel="noopener noreferrer" className="inline-block text-xs text-primary hover:underline">See full rules</a>}
        {editable && <div className="flex flex-wrap gap-1">
          <Button variant="ghost" onClick={() => setShopSlot(slot)}>From shop</Button>
          {item.name && <Button variant="ghost" onClick={() => setEditingSlot(editingSlot === slot ? null : slot)}>{editingSlot === slot ? 'Done' : 'Edit'}</Button>}
          {item.name && <Button variant="ghost" onClick={() => { setEditingSlot(current => current === slot ? null : current); onChange({ ...value, slots: { ...value.slots, [slot]: null } }); }}>Clear slot</Button>}
        </div>}
      </div>;
    })}</div>
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
    {shopSlot && <CatalogSearchDialog
      title={`Add to ${labels[[...BODY_SLOTS, ...UNSLOTTED_SLOTS].indexOf(shopSlot)]}`}
      description="Search the shop, then click an item to wear it in this slot."
      queries={[{ kind: 'gear', label: 'Gear' }]}
      knownIds={[...BODY_SLOTS, ...UNSLOTTED_SLOTS].map((key) => value.slots?.[key]?.libraryEntryId).filter((id): id is string => Boolean(id))}
      onClose={() => setShopSlot(null)}
      onPick={(entry) => {
        const worn = slotFromLibrary(entry.name, (entry.data ?? {}) as GearData, { libraryEntryId: entry.id, sourceUrl: entry.sourceUrl });
        onChange({ ...value, slots: { ...value.slots, [shopSlot]: worn } });
        setEditingSlot(shopSlot);
        setShopSlot(null);
      }}
    />}
  </div>;
}
