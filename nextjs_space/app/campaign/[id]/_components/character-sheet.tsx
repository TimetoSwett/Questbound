'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Save, Upload, Heart, Shield, BookOpen, Package, User, ChevronDown, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { PF1E_SKILLS, abilityMod, formatMod } from '@/lib/pf1e-skills';
import type { SkillDef } from '@/lib/pf1e-skills';
import { TipTapEditor } from '@/components/tiptap-editor';
import Image from 'next/image';
import { levelForCharacter } from '@/components/library/spell-picker';
import { SpellCard, type SpellEntry } from './spell-card';
import { EntryCard, sheetCardGridClass } from './entry-card';
import { castingAbilityFor, spellDc } from '@/lib/spell-dc';
import { newSpellClientId } from '@/lib/spell-client-id';
import { EquipmentEditor } from './equipment-editor';
import { equipmentEffects, equipmentSkillPenalty, manualBonusAfterChange } from '@/lib/equipment';
import { AddSpellToLibraryDialog } from './add-spell-dialog';
import { AddSpellSearchDialog } from './add-spell-search-dialog';
import { CatalogSearchDialog } from '@/components/library/catalog-search-dialog';
import { featFromLibrary, gearFromLibrary } from '@/lib/catalog';
import type { FeatData, GearData } from '@/lib/library';

const SIZES = ['Fine', 'Diminutive', 'Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan', 'Colossal'];
const ALIGNMENTS = ['LG', 'NG', 'CG', 'LN', 'N', 'CN', 'LE', 'NE', 'CE'];

interface SkillEntry { name: string; ranks: number; classSkill: boolean; misc: number; }
interface EquipItem { name: string; weight: number; quantity: number; value: string; notes: string; summary?: string; libraryEntryId?: string; sourceUrl?: string | null; }
interface FeatEntry { name: string; description: string; summary?: string; kind?: 'feat' | 'ability'; libraryEntryId?: string; sourceUrl?: string | null; }
interface ClassEntry { name: string; level: number; }

function groupFeats(feats: FeatEntry[]) {
  const groups = [
    { kind: 'feat' as const, label: 'Feats' },
    { kind: 'ability' as const, label: 'Special abilities' },
  ];
  return groups.map((group) => ({
    ...group,
    items: feats.map((feat, index) => ({ feat, index })).filter(({ feat }) => (feat?.kind === 'ability' ? 'ability' : 'feat') === group.kind),
  })).filter((group) => group.items.length > 0);
}

function itemMeta(item: EquipItem) {
  const weight = Number(item?.weight) || 0;
  const weightLabel = Number.isInteger(weight) ? String(weight) : String(Math.round(weight * 100) / 100);
  return `${weightLabel} lb · qty ${item?.quantity ?? 1}${item?.value ? ` · ${item.value}` : ''}`;
}

function groupSpells(known: SpellEntry[]) {
  const levelOf = (spell: SpellEntry) => (Number.isFinite(spell?.level) ? spell.level : 0);
  const ordered = known
    .map((spell, index) => ({ spell, index }))
    .sort((a, b) => levelOf(a.spell) - levelOf(b.spell) || (a.spell?.name ?? '').localeCompare(b.spell?.name ?? '', undefined, { sensitivity: 'base' }));
  const groups: { level: number; items: { spell: SpellEntry; index: number }[] }[] = [];
  for (const item of ordered) {
    const level = levelOf(item.spell);
    const last = groups[groups.length - 1];
    if (!last || last.level !== level) groups.push({ level, items: [item] });
    else last.items.push(item);
  }
  return groups;
}

function NumField({ label, value, onChange, disabled, className }: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        value={value ?? 0}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        disabled={disabled}
        className="mt-0.5 h-8 text-center font-mono text-sm"
      />
    </div>
  );
}

function TextField({ label, value, onChange, disabled, className, placeholder }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        value={value ?? ''}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="mt-0.5 h-8 text-sm"
      />
    </div>
  );
}

// Maps old sheet tab ids to the merged tabs (core+combat, feats+skills+spells+notes).
const SECTION_ALIASES: Record<string, string> = {
  core: 'core-combat',
  combat: 'core-combat',
  feats: 'details',
  skills: 'details',
  spells: 'details',
  notes: 'details',
};

const DETAIL_TABS = [
  { key: 'feats', label: 'Feats' },
  { key: 'skills', label: 'Skills' },
  { key: 'spells', label: 'Spells' },
  { key: 'notes', label: 'Notes' },
] as const;
type DetailTab = (typeof DETAIL_TABS)[number]['key'];

function resolveSection(key: string): string {
  return SECTION_ALIASES[key] ?? key;
}

function initialDetailTab(section?: string): DetailTab {
  return DETAIL_TABS.some((tab) => tab.key === section) ? section as DetailTab : 'feats';
}

function CollapsibleSection({ sectionKey, title, actions, children, openSections, setOpenSections, bare }: {
  sectionKey: string;
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  openSections: Record<string, boolean>;
  setOpenSections: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  bare?: boolean;
}) {
  if (bare) {
    return (
      <div className="bg-card rounded-lg border border-border" style={{ boxShadow: 'var(--shadow-sm)' }}>
        {actions && <div className="flex justify-end px-4 pt-4">{actions}</div>}
        <div className="p-4">{children}</div>
      </div>
    );
  }
  const open = openSections[sectionKey] ?? true;
  const setOpen = (v: boolean | ((o: boolean) => boolean)) => {
    setOpenSections((prev) => ({ ...prev, [sectionKey]: typeof v === 'function' ? v(prev[sectionKey] ?? true) : v }));
  };
  return (
    <div className="bg-card rounded-lg border border-border" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <div className="flex items-center justify-between gap-2 p-4 min-h-[44px]">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex items-center gap-2 text-left flex-1"
        >
          <h3 className="font-display font-semibold text-sm">{title}</h3>
          <ChevronDown className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {actions}
      </div>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

export function CharacterSheet({ characterId, editable, initialSection }: { characterId: string; editable: boolean; initialSection?: string }) {
  const [data, setData] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  // Old tab ids (core, combat, feats, skills, spells, notes) map to the merged tabs.
  // Keep the state type as string so old tab ids can be resolved at runtime.
  const [sectionState, setSectionState] = useState(() => resolveSection(initialSection ?? 'core-combat') as string);
  const [detailTab, setDetailTab] = useState<DetailTab>(() => initialDetailTab(initialSection));
  const setSection = (s: string) => {
    const next = resolveSection(s);
    if (next === 'details' && sectionState !== 'details') setDetailTab('feats');
    setSectionState(next);
  };
  const isSection = (key: string): boolean => sectionState === key;
  // Collapsible open/closed state persists across tab switches.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ skills: true, feats: true, spells: true, notes: true });
  // Client id of the spell being saved to the library (null = dialog closed).
  const [saveSpellClientId, setSaveSpellClientId] = useState<string | null>(null);
  const [addSpellOpen, setAddSpellOpen] = useState(false);
  const [catalog, setCatalog] = useState<null | 'gear' | 'training'>(null);
  const [portraitUrl, setPortraitUrl] = useState<string | null>(null);
  const saveTimer = useRef<any>(null);

  const parseJson = (val: any, fallback: any) => {
    if (!val) return fallback;
    if (typeof val === 'string') {
      try { return JSON.parse(val); } catch { return fallback; }
    }
    return val;
  };

  // Load character data directly
  useEffect(() => {
    const fetchChar = async () => {
      try {
        // Fetch via the campaign endpoint - we need campaignId
        // Actually let's make a dedicated endpoint. For now, fetch all and find.
        const res = await fetch(`/api/characters/single?id=${characterId}`);
        if (res.ok) {
          const ch = await res.json();
          // Parse JSON fields
          const parsed = {
            ...ch,
            skills: parseJson(ch?.skills, []),
            equipment: parseJson(ch?.equipment, []),
            equipped: parseJson(ch?.equipped, {}),
            feats: parseJson(ch?.feats, []),
            spells: parseJson(ch?.spells, { slots: {}, known: [] }),
            classes: parseJson(ch?.classes, []),
          };
          const clientIds = new Set<string>();
          parsed.spells.known = (parsed.spells.known ?? []).map((spell: SpellEntry) => {
            let clientId = spell.clientId;
            if (typeof clientId !== 'string' || !clientId.trim() || clientIds.has(clientId)) {
              do { clientId = newSpellClientId(); } while (clientIds.has(clientId));
            }
            clientIds.add(clientId);
            return { ...spell, clientId };
          });
          setData(parsed);
          // Load portrait
          if (ch?.portraitPath) {
            const pRes = await fetch(`/api/characters/portrait?id=${characterId}`);
            if (pRes.ok) {
              const pData = await pRes.json();
              setPortraitUrl(pData?.url ?? null);
            }
          }
        }
      } catch { /* ignore */ }
    };
    fetchChar();
  }, [characterId]);

  const update = useCallback((field: string, value: any) => {
    setData((prev: any) => ({ ...(prev ?? {}), [field]: value }));
  }, []);

  const saveNow = useCallback(async () => {
    if (!data || !editable) return;
    setSaving(true);
    try {
      const res = await fetch('/api/characters', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: characterId,
          name: data.name,
          race: data.race,
          alignment: data.alignment,
          deity: data.deity,
          size: data.size,
          gender: data.gender,
          age: data.age,
          height: data.height,
          weight: data.weight,
          homeland: data.homeland,
          xp: parseInt(data.xp) || 0,
          speed: parseInt(data.speed) || 30,
          str: parseInt(data.str) || 10,
          dex: parseInt(data.dex) || 10,
          con: parseInt(data.con) || 10,
          int: parseInt(data.int) || 10,
          wis: parseInt(data.wis) || 10,
          cha: parseInt(data.cha) || 10,
          hpMax: parseInt(data.hpMax) || 0,
          hpCurrent: parseInt(data.hpCurrent) || 0,
          hpTemp: parseInt(data.hpTemp) || 0,
          bab: parseInt(data.bab) || 0,
          sr: parseInt(data.sr) || 0,
          baseFort: parseInt(data.baseFort) || 0,
          baseRef: parseInt(data.baseRef) || 0,
          baseWill: parseInt(data.baseWill) || 0,
          miscFort: parseInt(data.miscFort) || 0,
          miscRef: parseInt(data.miscRef) || 0,
          miscWill: parseInt(data.miscWill) || 0,
          armorBonus: equipmentEffects(data.equipped, parseInt(data.armorBonus) || 0, parseInt(data.shieldBonus) || 0).armorBonus,
          shieldBonus: equipmentEffects(data.equipped, parseInt(data.armorBonus) || 0, parseInt(data.shieldBonus) || 0).shieldBonus,
          naturalArmor: parseInt(data.naturalArmor) || 0,
          deflection: parseInt(data.deflection) || 0,
          sizeMod: parseInt(data.sizeMod) || 0,
          miscAC: parseInt(data.miscAC) || 0,
          miscTouchAC: parseInt(data.miscTouchAC) || 0,
          miscFlatAC: parseInt(data.miscFlatAC) || 0,
          miscCMD: parseInt(data.miscCMD) || 0,
          miscCMB: parseInt(data.miscCMB) || 0,
          miscInit: parseInt(data.miscInit) || 0,
          classes: data.classes ?? [],
          skills: data.skills ?? [],
          equipment: data.equipment ?? [],
          equipped: data.equipped ?? {},
          feats: data.feats ?? [],
          spells: data.spells ?? { slots: {}, known: [] },
          notes: data.notes ?? '',
        }),
      });
      if (res.ok) {
        const saved = await res.json();
        setData((previous: any) => ({ ...previous, armorBonus: saved.armorBonus, shieldBonus: saved.shieldBonus }));
        toast.success('Saved!', { duration: 1500 });
      }
      else toast.error('Save failed');
    } catch { toast.error('Save error'); } finally { setSaving(false); }
  }, [data, editable, characterId]);

  const saveNowRef = useRef(saveNow);
  useEffect(() => {
    saveNowRef.current = saveNow;
  }, [saveNow]);

  const autoSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveNowRef.current(), 2000);
  }, []);

  const uploadPortrait = async (file: File) => {
    try {
      const form = new FormData();
      form.append('file', file);
      const upRes = await fetch('/api/upload', { method: 'POST', body: form });
      if (!upRes.ok) { toast.error('Upload failed'); return; }
      const { cloud_storage_path } = await upRes.json();
      // Save path to character
      await fetch('/api/characters', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: characterId, portraitPath: cloud_storage_path, portraitIsPublic: true }),
      });
      // Get URL
      const pRes = await fetch(`/api/characters/portrait?id=${characterId}`);
      if (pRes.ok) { const pData = await pRes.json(); setPortraitUrl(pData?.url ?? null); }
      toast.success('Portrait uploaded!');
    } catch { toast.error('Upload error'); }
  };

  // Computed values
  const stats = useMemo(() => {
    if (!data) return null;
    const s = (f: string) => parseInt(data?.[f]) || 0;
    const strMod = abilityMod(s('str'));
    const dexMod = abilityMod(s('dex'));
    const conMod = abilityMod(s('con'));
    const intMod = abilityMod(s('int'));
    const wisMod = abilityMod(s('wis'));
    const chaMod = abilityMod(s('cha'));
    const bab = s('bab');
    const sizeMod = s('sizeMod');

    const effects = equipmentEffects(data.equipped, s('armorBonus'), s('shieldBonus'), dexMod);
    const ac = 10 + effects.armorBonus + effects.shieldBonus + effects.dexToAC + sizeMod + s('naturalArmor') + s('deflection') + s('miscAC');
    const touchAC = 10 + effects.dexToAC + sizeMod + s('deflection') + s('miscTouchAC');
    const flatAC = 10 + effects.armorBonus + effects.shieldBonus + sizeMod + s('naturalArmor') + s('deflection') + s('miscFlatAC');
    const cmd = 10 + bab + strMod + dexMod + sizeMod + s('miscCMD');
    const cmb = bab + strMod + sizeMod + s('miscCMB');
    const init = dexMod + s('miscInit');
    const fort = s('baseFort') + conMod + s('miscFort');
    const ref = s('baseRef') + dexMod + s('miscRef');
    const will = s('baseWill') + wisMod + s('miscWill');

    return { effects, strMod, dexMod, conMod, intMod, wisMod, chaMod, ac, touchAC, flatAC, cmd, cmb, init, fort, ref, will };
  }, [data]);

  const spellClasses = (data?.classes ?? []).map((cls: ClassEntry) => cls.name);
  const castingAbility = castingAbilityFor(spellClasses);
  const castingMod = stats && castingAbility ? stats[`${castingAbility}Mod`] : null;

  const abilityModForSkill = useCallback((ability: string) => {
    if (!stats) return 0;
    const map: Record<string, number> = { STR: stats.strMod, DEX: stats.dexMod, CON: stats.conMod, INT: stats.intMod, WIS: stats.wisMod, CHA: stats.chaMod };
    return map[ability] ?? 0;
  }, [stats]);

  if (!data) return <div className="text-center py-20 text-muted-foreground">Loading character...</div>;

  const sections = [
    { key: 'core-combat', label: 'Core & Combat', icon: User },
    { key: 'equipped', label: 'Equipment', icon: Shield },
    { key: 'equipment', label: 'Inventory', icon: Package },
    { key: 'details', label: 'Feats, Skills, Spells & Notes', icon: BookOpen },
  ];

  return (
    <div className="space-y-4">
      {/* Section tabs */}
      <div className="flex flex-wrap gap-1 bg-card/50 p-1 rounded-lg">
        {sections.map((s) => (
          <button key={s.key} onClick={() => setSection(s.key)}
            className={`flex items-center gap-1 px-3 py-1.5 min-h-[44px] sm:min-h-0 text-sm rounded-md transition-colors ${
              isSection(s.key) ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}>
            <s.icon className="w-3.5 h-3.5" /> {s.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" onClick={saveNow} loading={saving} disabled={!editable}>
            <Save className="w-4 h-4 mr-1" /> Save
          </Button>
        </div>
      </div>

      {/* CORE & COMBAT SECTION */}
      {isSection('core-combat') && (
        <div className="space-y-4">
          {/* Name + Portrait */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">
            <div className="space-y-3">
              <TextField label="Character Name" value={data?.name ?? ''} onChange={(v: string) => { update('name', v); autoSave(); }} disabled={!editable} placeholder="Unnamed Hero" />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <TextField label="Race" value={data?.race ?? ''} onChange={(v: string) => { update('race', v); autoSave(); }} disabled={!editable} placeholder="Human" />
                <div>
                  <Label className="text-xs text-muted-foreground">Alignment</Label>
                  <select value={data?.alignment ?? ''} onChange={(e) => { update('alignment', e.target.value); autoSave(); }} disabled={!editable} className="mt-0.5 h-8 w-full rounded-md bg-card border border-input px-2 text-sm">
                    <option value="">-</option>
                    {ALIGNMENTS.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <TextField label="Deity" value={data?.deity ?? ''} onChange={(v: string) => { update('deity', v); autoSave(); }} disabled={!editable} />
                <div>
                  <Label className="text-xs text-muted-foreground">Size</Label>
                  <select value={data?.size ?? 'Medium'} onChange={(e) => { update('size', e.target.value); autoSave(); }} disabled={!editable} className="mt-0.5 h-8 w-full rounded-md bg-card border border-input px-2 text-sm">
                    {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <TextField label="Gender" value={data?.gender ?? ''} onChange={(v: string) => { update('gender', v); autoSave(); }} disabled={!editable} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <TextField label="Age" value={data?.age ?? ''} onChange={(v: string) => { update('age', v); autoSave(); }} disabled={!editable} />
                <TextField label="Height" value={data?.height ?? ''} onChange={(v: string) => { update('height', v); autoSave(); }} disabled={!editable} />
                <TextField label="Weight" value={data?.weight ?? ''} onChange={(v: string) => { update('weight', v); autoSave(); }} disabled={!editable} />
                <TextField label="Homeland" value={data?.homeland ?? ''} onChange={(v: string) => { update('homeland', v); autoSave(); }} disabled={!editable} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <NumField label="XP" value={data?.xp ?? 0} onChange={(v: string) => { update('xp', v); autoSave(); }} disabled={!editable} />
                <NumField label="Speed (ft)" value={data?.speed ?? 0} onChange={(v: string) => { update('speed', v); autoSave(); }} disabled={!editable} />
              </div>
            </div>
            {/* Portrait */}
            <div className="flex flex-col items-center">
              <div className="w-32 h-40 rounded-lg bg-muted border border-border overflow-hidden relative">
                {portraitUrl ? (
                  <Image src={portraitUrl} alt="Portrait" fill className="object-cover" unoptimized />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground"><User className="w-10 h-10" /></div>
                )}
              </div>
              {editable && (
                <label className="mt-2 cursor-pointer">
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target?.files?.[0]; if (f) uploadPortrait(f); }} />
                  <span className="text-xs text-primary hover:underline flex items-center gap-1"><Upload className="w-3 h-3" /> Upload Portrait</span>
                </label>
              )}
            </div>
          </div>

          {/* Classes */}
          <div className="bg-card rounded-lg p-4 border border-border" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display font-semibold text-sm">Classes</h3>
              {editable && (
                <Button variant="ghost" size="sm" onClick={() => { update('classes', [...(data?.classes ?? []), { name: '', level: 1 }]); autoSave(); }}>+ Add Class</Button>
              )}
            </div>
            {(data?.classes ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">No classes added</p>
            ) : (
              <div className="space-y-1">
                {(data?.classes ?? []).map((cls: ClassEntry, i: number) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input value={cls?.name ?? ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const arr = [...(data?.classes ?? [])]; arr[i] = { ...(arr[i] ?? {}), name: e.target.value }; update('classes', arr); autoSave(); }} placeholder="Class name" disabled={!editable} className="h-7 text-sm flex-1" />
                    <Input type="number" value={cls?.level ?? 1} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const arr = [...(data?.classes ?? [])]; arr[i] = { ...(arr[i] ?? {}), level: parseInt(e.target.value) || 1 }; update('classes', arr); autoSave(); }} disabled={!editable} className="h-7 text-sm w-16 text-center font-mono" />
                    {editable && (
                      <Button variant="ghost" size="icon-sm" onClick={() => { const arr = [...(data?.classes ?? [])]; arr.splice(i, 1); update('classes', arr); autoSave(); }}>
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Ability Scores */}
          <div className="bg-card rounded-lg p-4 border border-border" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <h3 className="font-display font-semibold text-sm mb-3">Ability Scores</h3>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((ab) => {
                const mod = abilityMod(parseInt(data?.[ab]) || 10);
                return (
                  <div key={ab} className="text-center">
                    <Label className="text-xs font-mono text-primary uppercase">{ab}</Label>
                    <Input type="number" value={data?.[ab] ?? 10} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { update(ab, e.target.value); autoSave(); }} disabled={!editable} className="mt-0.5 h-10 text-center font-mono text-lg" />
                    <div className={`text-sm font-mono mt-1 ${mod >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatMod(mod)}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* HP */}
          <div className="bg-card rounded-lg p-4 border border-border" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <h3 className="font-display font-semibold text-sm mb-3 flex items-center gap-1"><Heart className="w-4 h-4 text-red-400" /> Hit Points</h3>
            <div className="grid grid-cols-3 gap-3">
              <NumField label="Max HP" value={data?.hpMax ?? 0} onChange={(v: string) => { update('hpMax', v); autoSave(); }} disabled={!editable} />
              <NumField label="Current HP" value={data?.hpCurrent ?? 0} onChange={(v: string) => { update('hpCurrent', v); autoSave(); }} disabled={!editable} />
              <NumField label="Temp HP" value={data?.hpTemp ?? 0} onChange={(v: string) => { update('hpTemp', v); autoSave(); }} disabled={!editable} />
            </div>
            {data?.hpMax > 0 && (
              <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-green-500 transition-all" style={{ width: `${Math.min(100, Math.max(0, ((parseInt(data?.hpCurrent) || 0) / (parseInt(data?.hpMax) || 1)) * 100))}%` }} />
              </div>
            )}
          </div>

      {/* COMBAT (merged into Core & Combat) */}
          <div className="bg-card rounded-lg p-4 border border-border" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <h3 className="font-display font-semibold text-sm mb-3 flex items-center gap-1"><Shield className="w-4 h-4 text-primary" /> Armor Class</h3>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center p-3 bg-muted rounded-lg">
                <div className="text-2xl font-mono font-bold text-primary">{stats?.ac ?? 10}</div>
                <div className="text-xs text-muted-foreground">AC</div>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <div className="text-2xl font-mono font-bold">{stats?.touchAC ?? 10}</div>
                <div className="text-xs text-muted-foreground">Touch</div>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <div className="text-2xl font-mono font-bold">{stats?.flatAC ?? 10}</div>
                <div className="text-xs text-muted-foreground">Flat-Footed</div>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <NumField label="Armor Bonus" value={stats?.effects.armorBonus ?? 0} onChange={(v: string) => { update('armorBonus', v); autoSave(); }} disabled={!editable || !!data.equipped?.armor?.name?.trim()} />
              <NumField label="Shield Bonus" value={stats?.effects.shieldBonus ?? 0} onChange={(v: string) => { update('shieldBonus', v); autoSave(); }} disabled={!editable || !!data.equipped?.shield?.name?.trim()} />
              <NumField label="Natural Armor" value={data?.naturalArmor ?? 0} onChange={(v: string) => { update('naturalArmor', v); autoSave(); }} disabled={!editable} />
              <NumField label="Deflection" value={data?.deflection ?? 0} onChange={(v: string) => { update('deflection', v); autoSave(); }} disabled={!editable} />
              <NumField label="Size Mod" value={data?.sizeMod ?? 0} onChange={(v: string) => { update('sizeMod', v); autoSave(); }} disabled={!editable} />
              <NumField label="Misc AC" value={data?.miscAC ?? 0} onChange={(v: string) => { update('miscAC', v); autoSave(); }} disabled={!editable} />
              <NumField label="Misc Touch" value={data?.miscTouchAC ?? 0} onChange={(v: string) => { update('miscTouchAC', v); autoSave(); }} disabled={!editable} />
              <NumField label="Misc Flat-Footed" value={data?.miscFlatAC ?? 0} onChange={(v: string) => { update('miscFlatAC', v); autoSave(); }} disabled={!editable} />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-card rounded-lg p-4 border border-border text-center" style={{ boxShadow: 'var(--shadow-sm)' }}>
              <div className="text-2xl font-mono font-bold">{formatMod(stats?.init ?? 0)}</div>
              <div className="text-xs text-muted-foreground">Initiative</div>
              <NumField label="Misc Init" value={data?.miscInit ?? 0} onChange={(v: string) => { update('miscInit', v); autoSave(); }} disabled={!editable} className="mt-2" />
            </div>
            <div className="bg-card rounded-lg p-4 border border-border text-center" style={{ boxShadow: 'var(--shadow-sm)' }}>
              <div className="text-2xl font-mono font-bold">{formatMod(stats?.cmb ?? 0)}</div>
              <div className="text-xs text-muted-foreground">CMB</div>
              <NumField label="Misc CMB" value={data?.miscCMB ?? 0} onChange={(v: string) => { update('miscCMB', v); autoSave(); }} disabled={!editable} className="mt-2" />
            </div>
            <div className="bg-card rounded-lg p-4 border border-border text-center" style={{ boxShadow: 'var(--shadow-sm)' }}>
              <div className="text-2xl font-mono font-bold">{stats?.cmd ?? 10}</div>
              <div className="text-xs text-muted-foreground">CMD</div>
              <NumField label="Misc CMD" value={data?.miscCMD ?? 0} onChange={(v: string) => { update('miscCMD', v); autoSave(); }} disabled={!editable} className="mt-2" />
            </div>
            <div className="bg-card rounded-lg p-4 border border-border text-center" style={{ boxShadow: 'var(--shadow-sm)' }}>
              <NumField label="BAB" value={data?.bab ?? 0} onChange={(v: string) => { update('bab', v); autoSave(); }} disabled={!editable} />
              <NumField label="SR" value={data?.sr ?? 0} onChange={(v: string) => { update('sr', v); autoSave(); }} disabled={!editable} className="mt-2" />
            </div>
          </div>

          {/* Saving Throws */}
          <div className="bg-card rounded-lg p-4 border border-border" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <h3 className="font-display font-semibold text-sm mb-3">Saving Throws</h3>
            <div className="grid grid-cols-3 gap-4">
              {[
                { name: 'Fortitude', total: stats?.fort ?? 0, base: 'baseFort', misc: 'miscFort', ab: 'CON', mod: stats?.conMod ?? 0 },
                { name: 'Reflex', total: stats?.ref ?? 0, base: 'baseRef', misc: 'miscRef', ab: 'DEX', mod: stats?.dexMod ?? 0 },
                { name: 'Will', total: stats?.will ?? 0, base: 'baseWill', misc: 'miscWill', ab: 'WIS', mod: stats?.wisMod ?? 0 },
              ].map((sv) => (
                <div key={sv.name}>
                  <div className="text-center mb-2">
                    <div className="text-xl font-mono font-bold">{formatMod(sv.total)}</div>
                    <div className="text-xs text-muted-foreground">{sv.name}</div>
                  </div>
                  <NumField label={`Base ${sv.name}`} value={data?.[sv.base] ?? 0} onChange={(v: string) => { update(sv.base, v); autoSave(); }} disabled={!editable} />
                  <div className="text-xs text-muted-foreground text-center mt-1">{sv.ab} mod: {formatMod(sv.mod)}</div>
                  <NumField label="Misc" value={data?.[sv.misc] ?? 0} onChange={(v: string) => { update(sv.misc, v); autoSave(); }} disabled={!editable} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* EQUIPMENT SECTION */}
      {isSection('equipment') && (
        <div className="bg-card rounded-lg p-4 border border-border" style={{ boxShadow: 'var(--shadow-sm)' }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-semibold text-sm">Equipment & Inventory</h3>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground font-mono">
                Total Weight: {(data?.equipment ?? []).reduce((sum: number, i: EquipItem) => sum + ((i?.weight ?? 0) * (i?.quantity ?? 1)), 0)?.toFixed?.(1) ?? '0.0'} lbs
              </span>
              {editable && (
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setCatalog('gear')}>+ From shop</Button>
                  <Button variant="ghost" size="sm" onClick={() => { update('equipment', [...(data?.equipment ?? []), { name: '', weight: 0, quantity: 1, value: '', notes: '' }]); autoSave(); }}>+ Custom item</Button>
                </div>
              )}
            </div>
          </div>
          {(data?.equipment ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No items</p>
          ) : (
            <div className={sheetCardGridClass}>
              {(data?.equipment ?? []).map((item: EquipItem, i: number) => {
                const patch = (partial: Partial<EquipItem>) => {
                  const arr = [...(data?.equipment ?? [])];
                  arr[i] = { ...(arr[i] ?? {}), ...partial };
                  update('equipment', arr);
                  autoSave();
                };
                return <EntryCard key={i} name={item?.name ?? ''} unnamed="Unnamed item" meta={itemMeta(item)} body={item?.summary || item?.notes} libraryEntryId={item?.libraryEntryId} sourceUrl={item?.sourceUrl} editable={editable}
                  onDelete={() => { const arr = [...(data?.equipment ?? [])]; arr.splice(i, 1); update('equipment', arr); autoSave(); }}>
                  <Input value={item?.name ?? ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ name: e.target.value, libraryEntryId: undefined, sourceUrl: null, summary: undefined })} className="h-7 text-xs" placeholder="Item name" />
                  <div className="grid grid-cols-3 gap-2">
                    <label className="text-xs text-muted-foreground">Weight<Input type="number" value={item?.weight ?? 0} onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ weight: parseFloat(e.target.value) || 0 })} className="h-7 text-xs text-center font-mono" /></label>
                    <label className="text-xs text-muted-foreground">Qty<Input type="number" value={item?.quantity ?? 1} onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ quantity: parseInt(e.target.value) || 1 })} className="h-7 text-xs text-center font-mono" /></label>
                    <label className="text-xs text-muted-foreground">Value<Input value={item?.value ?? ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ value: e.target.value })} className="h-7 text-xs" placeholder="gp" /></label>
                  </div>
                  <label className="block text-xs text-muted-foreground">Notes<textarea value={item?.notes ?? ''} onChange={(e) => patch({ notes: e.target.value, summary: undefined })} className="w-full bg-transparent text-xs text-muted-foreground resize-y min-h-[60px] mt-1" placeholder="Description..." /></label>
                </EntryCard>;
              })}
            </div>
          )}
        </div>
      )}

      {isSection('equipped') && <EquipmentEditor value={data.equipped ?? {}} characterId={characterId} campaignId={data.campaignId} editable={editable}
        bab={Number(data.bab) || 0} strMod={stats?.strMod ?? 0} dexMod={stats?.dexMod ?? 0} sizeMod={Number(data.sizeMod) || 0}
        onChange={value => {
          for (const key of ['armor', 'shield'] as const) {
            const field = key === 'armor' ? 'armorBonus' : 'shieldBonus';
            const current = parseInt(data[field]) || 0;
            const next = manualBonusAfterChange(data.equipped, value, key, current);
            if (next !== current) update(field, next);
          }
          update('equipped', value); autoSave();
        }} />}

      {/* DETAILS TAB: Feats, Skills, Spells & Notes */}
      {isSection('details') && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1 bg-card/50 p-1 rounded-lg" role="tablist" aria-label="Feats, skills, spells, and notes">
            {DETAIL_TABS.map((tab) => (
              <button key={tab.key} type="button" role="tab" aria-selected={detailTab === tab.key} onClick={() => setDetailTab(tab.key)}
                className={`px-3 py-1.5 min-h-[44px] sm:min-h-0 text-sm rounded-md transition-colors ${
                  detailTab === tab.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}>
                {tab.label}
              </button>
            ))}
          </div>
          {detailTab === 'skills' && (
          <CollapsibleSection sectionKey="skills" title="Skills" bare openSections={openSections} setOpenSections={setOpenSections}>
          <p className="text-xs text-muted-foreground mb-2">Armor check penalty to Strength/Dexterity skills: {formatMod(stats?.effects.checkPenalty ?? 0)}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th className="text-left py-1 px-1">Skill</th>
                  <th className="text-center py-1 px-1 w-12">Total</th>
                  <th className="text-center py-1 px-1 w-14">Ranks</th>
                  <th className="text-center py-1 px-1 w-10">CS</th>
                  <th className="text-center py-1 px-1 w-12">Abil</th>
                  <th className="text-center py-1 px-1 w-14">Misc</th>
                </tr>
              </thead>
              <tbody>
                {PF1E_SKILLS.map((skill: SkillDef) => {
                  const entry = (data?.skills ?? []).find((s: SkillEntry) => s?.name === skill.name) ?? { name: skill.name, ranks: 0, classSkill: false, misc: 0 };
                  const abMod = abilityModForSkill(skill.ability);
                  const ranks = entry?.ranks ?? 0;
                  const csBonus = (entry?.classSkill && ranks >= 1) ? 3 : 0;
                  const total = ranks + csBonus + abMod + (entry?.misc ?? 0) + equipmentSkillPenalty(skill.ability, stats?.effects.checkPenalty ?? 0);

                  const updateSkill = (field: string, value: any) => {
                    const skills = [...(data?.skills ?? [])];
                    const idx = skills.findIndex((s: SkillEntry) => s?.name === skill.name);
                    if (idx >= 0) {
                      skills[idx] = { ...(skills[idx] ?? {}), [field]: value };
                    } else {
                      skills.push({ name: skill.name, ranks: 0, classSkill: false, misc: 0, [field]: value });
                    }
                    update('skills', skills);
                    autoSave();
                  };

                  return (
                    <tr key={skill.name} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-1 px-1">
                        <span className="text-xs">{skill.name}</span>
                        <span className="text-[10px] text-muted-foreground ml-1">({skill.ability})</span>
                      </td>
                      <td className="text-center font-mono font-bold">{formatMod(total)}</td>
                      <td className="text-center">
                        <input type="number" value={ranks} onChange={(e) => updateSkill('ranks', parseInt(e.target.value) || 0)} disabled={!editable}
                          className="w-10 h-6 text-center bg-transparent border border-border rounded text-xs font-mono" />
                      </td>
                      <td className="text-center">
                        <input type="checkbox" checked={entry?.classSkill ?? false} onChange={(e) => updateSkill('classSkill', e.target.checked)} disabled={!editable}
                          className="w-3.5 h-3.5 accent-primary" />
                      </td>
                      <td className="text-center text-xs font-mono text-muted-foreground">{formatMod(abMod)}</td>
                      <td className="text-center">
                        <input type="number" value={entry?.misc ?? 0} onChange={(e) => updateSkill('misc', parseInt(e.target.value) || 0)} disabled={!editable}
                          className="w-10 h-6 text-center bg-transparent border border-border rounded text-xs font-mono" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </CollapsibleSection>
          )}

          {detailTab === 'feats' && (
          <CollapsibleSection
            sectionKey="feats"
            title="Feats & Special Abilities"
            bare
            openSections={openSections}
            setOpenSections={setOpenSections}
            actions={editable ? (
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => setCatalog('training')}>+ From training</Button>
                <Button variant="ghost" size="sm" onClick={() => { update('feats', [...(data?.feats ?? []), { name: '', description: '' }]); autoSave(); }}>+ Custom</Button>
              </div>
            ) : undefined}
          >
          {(data?.feats ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No feats</p>
          ) : (
            <div className="space-y-4">
              {groupFeats(data?.feats ?? []).map((group) => (
                <div key={group.kind} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h4 className="shrink-0 text-xs font-semibold text-muted-foreground">{group.label}</h4>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  <div className={sheetCardGridClass}>
                    {group.items.map(({ feat, index }) => {
                      const patch = (partial: Partial<FeatEntry>) => {
                        const arr = [...(data?.feats ?? [])];
                        arr[index] = { ...(arr[index] ?? {}), ...partial };
                        update('feats', arr);
                        autoSave();
                      };
                      return <EntryCard key={index} name={feat?.name ?? ''} unnamed={group.kind === 'ability' ? 'Unnamed ability' : 'Unnamed feat'} meta={group.kind === 'ability' ? 'Special ability' : 'Feat'} body={feat?.summary || feat?.description} libraryEntryId={feat?.libraryEntryId} sourceUrl={feat?.sourceUrl} editable={editable}
                        onDelete={() => { const arr = [...(data?.feats ?? [])]; arr.splice(index, 1); update('feats', arr); autoSave(); }}>
                        <Input value={feat?.name ?? ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ name: e.target.value, libraryEntryId: undefined, sourceUrl: null, summary: undefined })} className="h-7 text-sm font-semibold" placeholder="Name" />
                        <label className="text-xs text-muted-foreground">Type
                          <select value={feat?.kind === 'ability' ? 'ability' : 'feat'} onChange={(e) => patch({ kind: e.target.value === 'ability' ? 'ability' : 'feat' })} className="mt-1 h-7 w-full rounded-md border border-input bg-background px-2 text-xs">
                            <option value="feat">Feat</option>
                            <option value="ability">Special ability</option>
                          </select>
                        </label>
                        <label className="block text-xs text-muted-foreground">Description<textarea value={feat?.description ?? ''} onChange={(e) => patch({ description: e.target.value, summary: undefined })} className="w-full bg-transparent text-xs text-muted-foreground resize-y min-h-[60px] mt-1" placeholder="Description..." /></label>
                      </EntryCard>;
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          </CollapsibleSection>
          )}

          {detailTab === 'spells' && (
          <CollapsibleSection sectionKey="spells" title="Spells" bare openSections={openSections} setOpenSections={setOpenSections}>
          <p className="text-xs text-muted-foreground mb-2">Arcane spell failure: {stats?.effects.spellFailure ?? 0}%</p>
          <div className="space-y-4">
          {/* Spell Slots */}
          <div>
            <h3 className="font-display font-semibold text-sm mb-3">Spell Slots per Day</h3>
            <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
              {Array.from({ length: 10 }, (_, lvl) => (
                <div key={lvl} className="text-center">
                  <Label className="text-[10px] text-muted-foreground">{lvl === 0 ? 'Cantrips' : `Lv ${lvl}`}</Label>
                  <Input type="number" value={data?.spells?.slots?.[lvl] ?? 0}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const spells = { ...(data?.spells ?? { slots: {}, known: [] }) };
                      spells.slots = { ...(spells.slots ?? {}) };
                      spells.slots[lvl] = parseInt(e.target.value) || 0;
                      update('spells', spells);
                      autoSave();
                    }} disabled={!editable}
                    className="h-7 text-center font-mono text-xs mt-0.5" />
                </div>
              ))}
            </div>
          </div>

          {/* Known Spells */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-semibold text-sm">Known / Prepared Spells</h3>
              {editable && (
                <Button variant="ghost" size="sm" onClick={() => setAddSpellOpen(true)}>+ Add Spell</Button>
              )}
            </div>
            {(data?.spells?.known ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No spells</p>
            ) : (
              <div className="space-y-4">
                {groupSpells(data?.spells?.known ?? []).map((group) => (
                  <div key={group.level} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h4 className="shrink-0 text-xs font-semibold text-muted-foreground">level {group.level} spell(s)</h4>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                    <div className={sheetCardGridClass}>
                      {group.items.map(({ spell }) => (
                        <SpellCard key={spell.clientId} spell={spell} editable={editable} classes={spellClasses}
                          dc={castingMod === null ? null : spellDc(spell.level ?? 0, castingMod)}
                          onPatch={(partial) => {
                            setData((prev: any) => {
                              const spells = { ...(prev?.spells ?? { slots: {}, known: [] }) };
                              const i = (spells.known ?? []).findIndex((s: SpellEntry) => s.clientId === spell.clientId);
                              if (i < 0) return prev;
                              spells.known = [...spells.known];
                              spells.known[i] = { ...spells.known[i], ...partial };
                              return { ...prev, spells };
                            });
                            autoSave();
                          }}
                          onPickEntry={(entry) => {
                            setData((prev: any) => {
                              const spells = { ...(prev?.spells ?? { slots: {}, known: [] }) };
                              const i = (spells.known ?? []).findIndex((s: SpellEntry) => s.clientId === spell.clientId);
                              if (i < 0) return prev;
                              spells.known = [...spells.known];
                              const level = levelForCharacter(entry.spellLevels ?? [], spellClasses);
                              spells.known[i] = { ...spells.known[i], name: entry.name, level, school: entry.data.school, description: entry.data.description, summary: entry.summary, sourceUrl: entry.sourceUrl, libraryEntryId: entry.id };
                              return { ...prev, spells };
                            });
                            autoSave();
                          }}
                          onSaveToLibrary={() => setSaveSpellClientId(spell.clientId)}
                          onDelete={() => {
                            setData((prev: any) => {
                              const spells = { ...(prev?.spells ?? { slots: {}, known: [] }) };
                              const i = (spells.known ?? []).findIndex((s: SpellEntry) => s.clientId === spell.clientId);
                              if (i < 0) return prev;
                              spells.known = [...spells.known];
                              spells.known.splice(i, 1);
                              return { ...prev, spells };
                            });
                            autoSave();
                          }} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          </div>
          </CollapsibleSection>
          )}

          {detailTab === 'notes' && (
          <CollapsibleSection sectionKey="notes" title="Notes & Backstory" bare openSections={openSections} setOpenSections={setOpenSections}>
          <TipTapEditor content={data?.notes ?? ''} onChange={(html: string) => { update('notes', html); autoSave(); }} editable={editable} placeholder="Write your character's backstory, notes, and other details..." />
          </CollapsibleSection>
          )}
        </div>
      )}
      {saveSpellClientId !== null && (
        <AddSpellToLibraryDialog
          open
          onClose={() => setSaveSpellClientId(null)}
          prefill={(() => {
            const s = (data?.spells?.known ?? []).find((spell: SpellEntry) => spell.clientId === saveSpellClientId) as SpellEntry | undefined;
            return s ? { name: s.name, school: s.school, description: s.description, level: s.level } : undefined;
          })()}
          onCreated={(entry) => {
            setData((prev: any) => {
              const spells = { ...(prev?.spells ?? { slots: {}, known: [] }) };
              const i = (spells.known ?? []).findIndex((spell: SpellEntry) => spell.clientId === saveSpellClientId);
              if (i < 0) return prev;
              spells.known = [...spells.known];
              spells.known[i] = { ...spells.known[i], libraryEntryId: entry.id };
              return { ...prev, spells };
            });
            autoSave();
            setSaveSpellClientId(null);
          }}
        />
      )}
      {addSpellOpen && (
        <AddSpellSearchDialog
          classes={(data?.classes ?? []).map((cls: ClassEntry) => cls.name)}
          knownIds={(data?.spells?.known ?? []).map((spell: SpellEntry) => spell.libraryEntryId).filter((id: string | undefined): id is string => Boolean(id))}
          onClose={() => setAddSpellOpen(false)}
          onCustom={() => {
            const spells = { ...(data?.spells ?? { slots: {}, known: [] }) };
            spells.known = [...(spells.known ?? []), { clientId: newSpellClientId(), name: '', level: 0, school: '', description: '', cast: 0, maxCast: 1 }];
            update('spells', spells);
            autoSave();
            setAddSpellOpen(false);
          }}
          onPick={(entry) => {
            setData((prev: any) => {
              const spells = { ...(prev?.spells ?? { slots: {}, known: [] }) };
              const classNames = (prev?.classes ?? []).map((cls: ClassEntry) => cls.name);
              const level = levelForCharacter(entry.spellLevels ?? [], classNames);
              spells.known = [...(spells.known ?? []), {
                clientId: newSpellClientId(),
                name: entry.name,
                level,
                school: entry.data?.school ?? '',
                description: entry.data?.description ?? '',
                summary: entry.summary ?? '',
                cast: 0,
                maxCast: 1,
                sourceUrl: entry.sourceUrl ?? null,
                libraryEntryId: entry.id,
              }];
              return { ...(prev ?? {}), spells };
            });
            autoSave();
          }}
        />
      )}
      {catalog === 'gear' && (
        <CatalogSearchDialog
          title="Add gear"
          description="Search the shop, then click an item to put it in this inventory."
          queries={[{ kind: 'gear', label: 'Gear' }]}
          knownIds={(data?.equipment ?? []).map((item: EquipItem) => item.libraryEntryId).filter((id: string | undefined): id is string => Boolean(id))}
          onClose={() => setCatalog(null)}
          onCustom={() => { update('equipment', [...(data?.equipment ?? []), { name: '', weight: 0, quantity: 1, value: '', notes: '' }]); autoSave(); setCatalog(null); }}
          onPick={(entry) => {
            const item = { ...gearFromLibrary(entry.name, (entry.data ?? {}) as GearData, { libraryEntryId: entry.id, sourceUrl: entry.sourceUrl }), summary: entry.summary ?? '' };
            setData((prev: any) => ({ ...prev, equipment: [...(prev?.equipment ?? []), item] }));
            autoSave();
          }}
        />
      )}
      {catalog === 'training' && (
        <CatalogSearchDialog
          title="Add feat or ability"
          description="Search the training grounds, then click to add it to this sheet."
          queries={[{ kind: 'feat', label: 'Feats' }, { kind: 'ability', label: 'Special abilities' }]}
          knownIds={(data?.feats ?? []).map((feat: FeatEntry) => feat.libraryEntryId).filter((id: string | undefined): id is string => Boolean(id))}
          onClose={() => setCatalog(null)}
          onCustom={() => { update('feats', [...(data?.feats ?? []), { name: '', description: '' }]); autoSave(); setCatalog(null); }}
          onPick={(entry) => {
            const feat = { ...featFromLibrary(entry.name, (entry.data ?? {}) as FeatData, { libraryEntryId: entry.id, sourceUrl: entry.sourceUrl }), summary: entry.summary ?? '', kind: entry.kind === 'ability' ? 'ability' as const : 'feat' as const };
            setData((prev: any) => ({ ...prev, feats: [...(prev?.feats ?? []), feat] }));
            autoSave();
          }}
        />
      )}
    </div>
  );
}
