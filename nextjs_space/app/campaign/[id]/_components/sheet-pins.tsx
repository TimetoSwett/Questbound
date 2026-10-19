'use client';

import { TOGGLES } from '@/lib/conditions';
import { SHEET_PINS, weaponTotals, type AbilityName, type SheetPin } from '@/lib/equipment';
import { formatMod } from '@/lib/pf1e-skills';
import { type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export const PIN_LABELS: Record<SheetPin, string> = {
  hp: 'Hit points',
  abilities: 'Abilities',
  ac: 'Armor class',
  saves: 'Saves',
  attacks: 'Attacks',
  combat: 'Initiative & maneuvers',
  effects: 'Conditions & buffs',
};

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

export function toggleSheetPin(pins: { left?: SheetPin[]; right?: SheetPin[] } | undefined, side: 'left' | 'right', id: SheetPin) {
  const left = (pins?.left ?? []).filter(pin => pin !== id);
  const right = (pins?.right ?? []).filter(pin => pin !== id);
  const already = (pins?.[side] ?? []).includes(id);
  if (!already) (side === 'left' ? left : right).push(id);
  return { left, right };
}

function Card({ title, onUnpin, children }: { title: string; onUnpin?: () => void; children: ReactNode }) {
  return <section className="rounded-lg border bg-card p-3 space-y-2">
    <div className="flex items-center justify-between gap-2">
      <h3 className="font-display text-xs font-semibold">{title}</h3>
      {onUnpin && <Button variant="ghost" size="sm" className="h-6 px-1 text-[10px]" onClick={onUnpin}>Unpin</Button>}
    </div>
    {children}
  </section>;
}

export function PinRail({ ids, side, data, stats, editable, onChange, onUnpin }: {
  ids: SheetPin[];
  side: 'left' | 'right';
  data: any;
  stats: any;
  editable: boolean;
  onChange: (field: string, value: string) => void;
  onUnpin: (id: SheetPin) => void;
}) {
  if (!ids.length) return null;
  const weapons = (data?.equipped?.weapons ?? []).filter((weapon: { name?: string }) => weapon?.name?.trim());
  const active = (data?.equipped?.conditions ?? []).map((id: string) => TOGGLES.find(toggle => toggle.id === id)?.label ?? id);
  const buffs = (data?.equipped?.buffs ?? []).filter((buff: { on?: boolean; name?: string }) => buff.on && buff.name?.trim()).map((buff: { name: string }) => buff.name);
  return <aside aria-label={side === 'left' ? 'Left pins' : 'Right pins'} className={`${side === 'left' ? 'order-1' : 'order-2'} xl:order-none xl:sticky xl:top-24 space-y-3 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto`}>
    {ids.map(id => {
      if (id === 'hp') return <Card key={id} title="Hit points" onUnpin={editable ? () => onUnpin(id) : undefined}>
        <label className="block text-[10px] text-muted-foreground">Current<Input type="number" value={data?.hpCurrent ?? 0} disabled={!editable} className="h-8 text-center font-mono" onChange={e => onChange('hpCurrent', e.target.value)} /></label>
        <p className="text-center text-xs text-muted-foreground">of {data?.hpMax ?? 0}{data?.hpTemp ? ` · ${data.hpTemp} temp` : ''}</p>
      </Card>;
      if (id === 'abilities') return <Card key={id} title="Abilities" onUnpin={editable ? () => onUnpin(id) : undefined}>
        <div className="grid grid-cols-3 gap-1 text-center">
          {ABILITIES.map(ability => <div key={ability}><div className="text-[10px] uppercase text-muted-foreground">{ability}</div><div className="font-mono text-sm">{formatMod(stats?.mods?.[ability] ?? 0)}</div></div>)}
        </div>
      </Card>;
      if (id === 'ac') return <Card key={id} title="Armor class" onUnpin={editable ? () => onUnpin(id) : undefined}>
        <div className="grid grid-cols-3 gap-1 text-center">
          {[['AC', stats?.ac], ['Touch', stats?.touchAC], ['Flat', stats?.flatAC]].map(([label, value]) => <div key={String(label)}><div className="font-mono text-lg font-bold">{value ?? 10}</div><div className="text-[10px] text-muted-foreground">{label}</div></div>)}
        </div>
      </Card>;
      if (id === 'saves') return <Card key={id} title="Saves" onUnpin={editable ? () => onUnpin(id) : undefined}>
        <div className="grid grid-cols-3 gap-1 text-center">
          {[['Fort', stats?.fort], ['Ref', stats?.ref], ['Will', stats?.will]].map(([label, value]) => <div key={String(label)}><div className="font-mono text-lg font-bold">{formatMod(Number(value) || 0)}</div><div className="text-[10px] text-muted-foreground">{label}</div></div>)}
        </div>
      </Card>;
      if (id === 'attacks') return <Card key={id} title="Attacks" onUnpin={editable ? () => onUnpin(id) : undefined}>
        {weapons.length === 0 ? <p className="text-xs text-muted-foreground">No weapons equipped.</p> : weapons.map((weapon: { name: string; ability?: 'str' | 'dex'; extraAbilities?: AbilityName[]; attackBonus?: number; damage?: string; damageBonus?: number; crit?: string; range?: number; type?: string; category?: 'melee' | 'ranged' | 'thrown' | 'composite'; hands?: 'one' | 'two' | 'off'; baseDie?: 'medium' }, index: number) => {
          const ability = weapon.ability === 'dex' ? 'dex' : 'str';
          const extra = (weapon.extraAbilities ?? []).reduce((sum, item) => sum + (stats?.mods?.[item] ?? 0), 0);
          const totals = weaponTotals(
            { name: weapon.name, attackBonus: weapon.attackBonus || 0, ability, damage: weapon.damage || '1d6', damageBonus: weapon.damageBonus || 0, crit: weapon.crit || '20/x2', range: weapon.range || 0, type: weapon.type || '', category: weapon.category, hands: weapon.hands, baseDie: weapon.baseDie },
            Number(data?.bab) || 0, stats?.strMod ?? 0, stats?.dexMod ?? 0, Number(data?.sizeMod) || 0, (stats?.itemBonuses?.attack ?? 0) + extra, stats?.itemBonuses?.damage ?? 0, data?.size,
          );
          return <p key={`${weapon.name}-${index}`} className="text-xs"><span className="font-medium">{weapon.name}</span> <span className="font-mono">{formatMod(totals.attack)} · {totals.damage}</span></p>;
        })}
      </Card>;
      if (id === 'combat') return <Card key={id} title="Initiative & maneuvers" onUnpin={editable ? () => onUnpin(id) : undefined}>
        <div className="grid grid-cols-2 gap-1 text-center">
          {[['Init', formatMod(stats?.init ?? 0)], ['BAB', formatMod(Number(data?.bab) || 0)], ['CMB', formatMod(stats?.cmb ?? 0)], ['CMD', String(stats?.cmd ?? 10)]].map(([label, value]) => <div key={label}><div className="font-mono font-bold">{value}</div><div className="text-[10px] text-muted-foreground">{label}</div></div>)}
        </div>
      </Card>;
      return <Card key={id} title="Conditions & buffs" onUnpin={editable ? () => onUnpin(id) : undefined}>
        {active.length + buffs.length === 0 ? <p className="text-xs text-muted-foreground">Nothing active.</p> : <ul className="space-y-1 text-xs">{[...active, ...buffs].map(name => <li key={name}>{name}</li>)}</ul>}
      </Card>;
    })}
  </aside>;
}

export function pinChoices() {
  return SHEET_PINS.map(id => ({ id, label: PIN_LABELS[id] }));
}
