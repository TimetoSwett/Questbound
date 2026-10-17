'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Save, Upload, Heart, Shield, BookOpen, Package, User, ChevronDown, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { abilityMod, formatMod } from '@/lib/pf1e-skills';
import { SkillRows } from './skill-rows';
import { TipTapEditor } from '@/components/tiptap-editor';
import Image from 'next/image';
import { levelForCharacter } from '@/components/library/spell-picker';
import { SpellCard, type SpellEntry } from './spell-card';
import { EntryCard, sheetCardGridClass } from './entry-card';
import { castingAbilityFor, spellDc } from '@/lib/spell-dc';
import { ensureEntryIds, newEntryId } from '@/lib/entry-ids';
import { newAbilityId } from '@/lib/spells-extras';
import { newSpellClientId } from '@/lib/spell-client-id';
import { EquipmentEditor, BonusEditor } from './equipment-editor';
import { PsionicsSection } from '@/components/characters/psionics-section';
import { PathOfWarSection } from '@/components/characters/path-of-war-section';
import { AbilityScoreCell } from './ability-score-cell';
import { SheetEffects } from './sheet-effects';
import { SensesSection } from './senses-section';
import { NonlethalField } from './nonlethal-field';
import { BackstoryTab } from './backstory-tab';
import { sheetAdjustment, maneuverSize } from '@/lib/conditions';
import { PinRail, pinChoices, toggleSheetPin } from './sheet-pins';
import { STACK_LABELS, bonusLabel, equipmentEffects, formatCrit, formatWeaponDamage, manualBonusAfterChange, weaponTotals, type AbilityName, type ItemBonus, type SheetOptions, type SheetPin } from '@/lib/equipment';
import { carryLimits, loadBracket } from '@/lib/carry';
import { CoinsBox, useSharedPurse } from './coins-box';
import { AddSpellToLibraryDialog } from './add-spell-dialog';
import { AddSpellSearchDialog } from './add-spell-search-dialog';
import { CatalogSearchDialog } from '@/components/library/catalog-search-dialog';
import { CompanionSwitcher } from '@/components/characters/companion-switcher';
import { CompanionPanel } from '@/components/characters/companion-panel';
import { ABILITY_TAGS, abilityTag, featFromLibrary, gearFromLibrary } from '@/lib/catalog';
import { abilityMeta, featCardBody, gearMetaExtras } from '@/lib/sheet-entry-forms';
import { SheetFeatEditor, SheetAbilityEditor, SheetGearEditor } from './sheet-entry-editors';
import type { AbilityTag } from '@/lib/catalog';
import type { FeatData, GearData } from '@/lib/library';

const SIZES = ['Fine', 'Diminutive', 'Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan', 'Colossal'];
const ALIGNMENTS = ['LG', 'NG', 'CG', 'LN', 'N', 'CN', 'LE', 'NE', 'CE'];
type DrRow = NonNullable<SheetOptions['dr']>[number];
type ResistRow = NonNullable<SheetOptions['resist']>[number];

interface EquipItem { id?: string; slot?: string; aura?: string; cl?: number; name: string; weight: number; quantity: number; value: string; notes: string; summary?: string; libraryEntryId?: string; sourceUrl?: string | null; }
interface FeatEntry { id?: string; uses?: string; featType?: string; prerequisites?: string; benefit?: string; name: string; description: string; summary?: string; kind?: 'feat' | 'ability'; tag?: AbilityTag; libraryEntryId?: string; sourceUrl?: string | null; bonuses?: ItemBonus[]; }
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
  const extras = gearMetaExtras(item);
  return `${weightLabel} lb · qty ${item?.quantity ?? 1}${item?.value ? ` · ${item.value}` : ''}${extras ? ` · ${extras}` : ''}`;
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
  backstory: 'details',
};

const DETAIL_TABS = [
  { key: 'feats', label: 'Feats' },
  { key: 'skills', label: 'Skills' },
  { key: 'spells', label: 'Spells' },
  { key: 'abilities', label: 'Limited-use' },
  { key: 'notes', label: 'Notes' },
  { key: 'backstory', label: 'Backstory' },
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
  const purse = useSharedPurse(data?.campaignId);
  const [saving, setSaving] = useState(false);
  // Old tab ids (core, combat, feats, skills, spells, notes) map to the merged tabs.
  // Keep the state type as string so old tab ids can be resolved at runtime.
  const [sectionState, setSectionState] = useState(() => resolveSection(initialSection ?? 'core-combat') as string);
  const [detailTab, setDetailTab] = useState<DetailTab>(() => initialDetailTab(initialSection));
  const [openAbility, setOpenAbility] = useState<AbilityName | null>(null);
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
            equipment: ensureEntryIds(parseJson(ch?.equipment, [])),
            equipped: parseJson(ch?.equipped, {}),
            feats: ensureEntryIds(parseJson(ch?.feats, [])),
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
          const abilityIds = new Set<string>();
          parsed.spells.abilities = (Array.isArray(parsed.spells.abilities) ? parsed.spells.abilities : [])
            .filter((ability: any) => ability && typeof ability === 'object' && !Array.isArray(ability))
            .map((ability: any) => {
              let id = ability.id;
              if (typeof id !== 'string' || !id.length || id.length > 100 || abilityIds.has(id)) {
                do { id = newAbilityId(); } while (abilityIds.has(id));
              }
              abilityIds.add(id);
              return { ...ability, id };
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
    const adjust = sheetAdjustment({ equipped: data.equipped, feats: data.feats });
    const sheet = data.equipped?.sheet ?? {};
    const score = (ability: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha') => (parseInt(data?.[ability]) || 0) + adjust.ability[ability];
    const mod = (ability: AbilityName) => sheet.noScore?.includes(ability) ? 0 : abilityMod(score(ability));
    const strMod = mod('str');
    const dexMod = mod('dex');
    const conMod = mod('con');
    const intMod = mod('int');
    const wisMod = mod('wis');
    const chaMod = mod('cha');
    const mods = { str: strMod, dex: dexMod, con: conMod, int: intMod, wis: wisMod, cha: chaMod };
    const bab = s('bab');
    const sizeMod = s('sizeMod');
    const combatSize = maneuverSize(sizeMod, adjust.sizeCmb || 0);
    const dodge = (sheet.dodge || 0) + adjust.ac.dodge;
    const naturalEnh = Math.max(sheet.naturalEnhancement || 0, adjust.naturalEnhancement || 0);

    const effects = equipmentEffects(data.equipped, s('armorBonus'), s('shieldBonus'), dexMod);
    const acDex = adjust.loseDex ? Math.min(effects.dexToAC, 0) : effects.dexToAC;
    const ac = 10 + effects.armorBonus + adjust.ac.armor + effects.shieldBonus + adjust.ac.shield + acDex + sizeMod + adjust.acSize + s('naturalArmor') + adjust.ac.natural + naturalEnh + s('deflection') + adjust.ac.deflection + s('miscAC') + dodge + adjust.acPenalty;
    const touchAC = 10 + acDex + sizeMod + adjust.acSize + s('deflection') + adjust.ac.deflection + s('miscTouchAC') + dodge + adjust.acPenalty;
    const flatAC = 10 + effects.armorBonus + adjust.ac.armor + effects.shieldBonus + adjust.ac.shield + sizeMod + adjust.acSize + s('naturalArmor') + adjust.ac.natural + naturalEnh + s('deflection') + adjust.ac.deflection + s('miscFlatAC') + adjust.acPenalty;
    const cmdDex = adjust.loseDex ? Math.min(dexMod, 0) : dexMod;
    const cmd = 10 + bab + strMod + cmdDex + combatSize + s('miscCMD') + adjust.cmb + dodge + s('deflection') + adjust.ac.deflection + adjust.acPenalty + adjust.cmdAc;
    const cmb = bab + strMod + combatSize + s('miscCMB') + adjust.cmb;
    const initAbilities = sheet.initAbilities ?? ['dex'];
    const init = initAbilities.reduce((sum: number, ability: AbilityName) => sum + mods[ability], 0) + s('miscInit') + adjust.init;
    const fort = s('baseFort') + conMod + s('miscFort') + adjust.saves.fort;
    const ref = s('baseRef') + dexMod + s('miscRef') + adjust.saves.ref;
    const will = s('baseWill') + wisMod + s('miscWill') + adjust.saves.will;

    return { effects, itemBonuses: adjust, mods, strMod, dexMod, conMod, intMod, wisMod, chaMod, ac, touchAC, flatAC, cmd, cmb, combatSize, init, fort, ref, will, dodge, naturalEnh };
  }, [data]);

  const abilityList = Array.isArray(data?.spells?.abilities) ? data.spells.abilities : [];
  const spellClasses = (data?.classes ?? []).map((cls: ClassEntry) => cls.name);
  const castingAbility = castingAbilityFor(spellClasses);
  const castingMod = stats && castingAbility ? stats[`${castingAbility}Mod`] : null;

  const abilityModForSkill = useCallback((ability: string) => {
    if (!stats) return 0;
    const map: Record<string, number> = { STR: stats.strMod, DEX: stats.dexMod, CON: stats.conMod, INT: stats.intMod, WIS: stats.wisMod, CHA: stats.chaMod };
    return map[ability] ?? 0;
  }, [stats]);

  if (!data) return <div className="text-center py-20 text-muted-foreground">Loading character...</div>;

  const patchSheet = (partial: Partial<SheetOptions>) => {
    update('equipped', { ...(data.equipped ?? {}), sheet: { ...(data.equipped?.sheet ?? {}), ...partial } });
    autoSave();
  };

  const sections = [
    { key: 'core-combat', label: 'Core & Combat', icon: User },
    { key: 'equipped', label: 'Equipment', icon: Shield },
    { key: 'equipment', label: 'Inventory', icon: Package },
    { key: 'details', label: 'Feats, Skills, Spells & Notes', icon: BookOpen },
    { key: 'powers', label: 'Powers', icon: BookOpen },
    { key: 'maneuvers', label: 'Maneuvers', icon: BookOpen },
  ];

  const pins = data?.equipped?.sheet?.pins ?? {};
  const leftPins = (pins.left ?? []).filter((id: string): id is SheetPin => pinChoices().some(choice => choice.id === id));
  const rightPins = (pins.right ?? []).filter((id: string): id is SheetPin => pinChoices().some(choice => choice.id === id));
  const pinned = leftPins.length + rightPins.length > 0;
  const pin = (side: 'left' | 'right', id: SheetPin) => { if (!editable) return; patchSheet({ pins: toggleSheetPin(pins, side, id) }); };

  return (
    <div className={`mx-auto w-full ${pinned ? 'max-w-[96rem] xl:grid xl:items-start xl:gap-4 ' + (leftPins.length && rightPins.length ? 'xl:grid-cols-[14rem_minmax(0,1fr)_14rem]' : leftPins.length ? 'xl:grid-cols-[14rem_minmax(0,1fr)]' : 'xl:grid-cols-[minmax(0,1fr)_14rem]') : 'max-w-6xl'}`}>
      {leftPins.length > 0 && <PinRail ids={leftPins} side="left" data={data} stats={stats} editable={editable} onChange={(field, value) => { update(field, value); autoSave(); }} onUnpin={id => pin('left', id)} />}
      <div className="order-3 min-w-0 space-y-4 xl:order-none">
      <CompanionSwitcher characterId={characterId} />
      <CompanionPanel characterId={characterId} campaignId={data?.campaignId ?? null} ownerUserId={data?.userId ?? null} editable={editable} />
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
          {editable && <details className="relative">
            <summary className="cursor-pointer list-none rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">Pin columns</summary>
            <div className="absolute right-0 z-20 mt-1 w-64 rounded-lg border bg-card p-3 shadow-lg">
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-2 gap-y-1 text-xs">
                <span />
                <span className="text-center text-muted-foreground">Left</span>
                <span className="text-center text-muted-foreground">Right</span>
                {pinChoices().map(choice => <div key={choice.id} className="contents">
                  <span>{choice.label}</span>
                  <input aria-label={`Pin ${choice.label} left`} type="checkbox" className="justify-self-center" checked={leftPins.includes(choice.id)} disabled={!editable} onChange={() => pin('left', choice.id)} />
                  <input aria-label={`Pin ${choice.label} right`} type="checkbox" className="justify-self-center" checked={rightPins.includes(choice.id)} disabled={!editable} onChange={() => pin('right', choice.id)} />
                </div>)}
              </div>
            </div>
          </details>}
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

          <div className="bg-card rounded-lg p-4 border border-border" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <h3 className="font-display font-semibold text-sm mb-2">Favored class</h3>
            <p className="text-xs text-muted-foreground mb-2">Bonus HP is added on top of the max you type. Spend bonus ranks on the skill rows.</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <TextField label="Class" value={data?.equipped?.sheet?.favoredClass ?? ''} onChange={(v: string) => patchSheet({ favoredClass: v })} disabled={!editable} />
              <NumField label="Bonus HP" value={data?.equipped?.sheet?.favoredHp ?? 0} onChange={(v: string) => patchSheet({ favoredHp: parseInt(v) || 0 })} disabled={!editable} />
              <NumField label="Bonus ranks" value={data?.equipped?.sheet?.favoredRanks ?? 0} onChange={(v: string) => patchSheet({ favoredRanks: parseInt(v) || 0 })} disabled={!editable} />
              <TextField label="Other" value={data?.equipped?.sheet?.favoredNotes ?? ''} onChange={(v: string) => patchSheet({ favoredNotes: v })} disabled={!editable} placeholder="Alternate bonus" />
            </div>
          </div>

          {/* Ability Scores */}
          <div className="bg-card rounded-lg p-4 border border-border" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <h3 className="font-display font-semibold text-sm mb-3">Ability Scores</h3>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((ab) => {
                const gear = stats?.itemBonuses.ability[ab] ?? 0;
                const mod = { str: stats?.strMod, dex: stats?.dexMod, con: stats?.conMod, int: stats?.intMod, wis: stats?.wisMod, cha: stats?.chaMod }[ab] ?? 0;
                return (
                  <div key={ab} className="text-center">
                    <AbilityScoreCell ability={ab} score={data?.[ab] ?? 10} modifier={mod} gear={gear}
                      noScore={data.equipped?.sheet?.noScore?.includes(ab) ?? false} editable={editable}
                      onScoreChange={value => { update(ab, value); autoSave(); }}
                      onNoScoreChange={absent => patchSheet({ noScore: absent
                        ? [...new Set<AbilityName>([...(data.equipped?.sheet?.noScore ?? []), ab])]
                        : (data.equipped?.sheet?.noScore ?? []).filter((ability: AbilityName) => ability !== ab) })} />
                    <button type="button" className="text-[10px] text-primary underline" onClick={() => setOpenAbility(openAbility === ab ? null : ab)}>{openAbility === ab ? 'Hide' : 'Breakdown'}</button>
                  </div>
                );
              })}
            </div>
            {openAbility && (
              <div className="mt-3 rounded-md border p-3 text-sm">
                <p className="font-medium uppercase">{openAbility}</p>
                <p>Base {parseInt(data?.[openAbility]) || 0}</p>
                {(stats?.itemBonuses.abilityParts[openAbility] ?? []).map(part => <p key={part.stack}>{STACK_LABELS[part.stack]} {formatMod(part.amount)}</p>)}
                <p className="font-medium">Score {data.equipped?.sheet?.noScore?.includes(openAbility) ? 'N/A' : (parseInt(data?.[openAbility]) || 0) + (stats?.itemBonuses.ability[openAbility] ?? 0)} · modifier {data.equipped?.sheet?.noScore?.includes(openAbility) ? 'N/A (treated as +0)' : formatMod(stats?.mods?.[openAbility] ?? 0)}</p>
              </div>
            )}
          </div>

          {/* HP */}
          <div className="bg-card rounded-lg p-4 border border-border" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <h3 className="font-display font-semibold text-sm mb-3 flex items-center gap-1"><Heart className="w-4 h-4 text-destructive" /> Hit Points</h3>
            <div className="grid grid-cols-3 gap-3">
              <NumField label="Max HP" value={data?.hpMax ?? 0} onChange={(v: string) => { update('hpMax', v); autoSave(); }} disabled={!editable} />
              {(data?.equipped?.sheet?.favoredHp ?? 0) > 0 && <p className="text-[10px] text-muted-foreground text-center">Total max {(parseInt(data?.hpMax) || 0) + (data.equipped.sheet.favoredHp ?? 0)} with favored class</p>}
              <NumField label="Current HP" value={data?.hpCurrent ?? 0} onChange={(v: string) => { update('hpCurrent', v); autoSave(); }} disabled={!editable} />
              <NonlethalField value={data?.equipped?.sheet?.nonlethal ?? 0} currentHp={(parseInt(data?.hpCurrent) || 0) + (parseInt(data?.hpTemp) || 0)} disabled={!editable} onChange={nonlethal => patchSheet({ nonlethal })} />
              <NumField label="Temp HP" value={data?.hpTemp ?? 0} onChange={(v: string) => { update('hpTemp', v); autoSave(); }} disabled={!editable} />
            </div>
            {data?.hpMax > 0 && (
              <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-success transition-all" style={{ width: `${Math.min(100, Math.max(0, ((parseInt(data?.hpCurrent) || 0) / (parseInt(data?.hpMax) || 1)) * 100))}%` }} />
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
              <NumField label="Natural enhancement" value={data?.equipped?.sheet?.naturalEnhancement ?? 0} onChange={(v: string) => patchSheet({ naturalEnhancement: parseInt(v) || 0 })} disabled={!editable} />
              <NumField label="Deflection" value={data?.deflection ?? 0} onChange={(v: string) => { update('deflection', v); autoSave(); }} disabled={!editable} />
              <NumField label="Dodge" value={data?.equipped?.sheet?.dodge ?? 0} onChange={(v: string) => patchSheet({ dodge: parseInt(v) || 0 })} disabled={!editable} />
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
              <div className="mt-1 flex flex-wrap justify-center gap-1">
                {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map(ability => {
                  const selected = (data?.equipped?.sheet?.initAbilities ?? ['dex']).includes(ability);
                  return <button key={ability} type="button" aria-pressed={selected} disabled={!editable} onClick={() => {
                    const current = data?.equipped?.sheet?.initAbilities ?? ['dex' as AbilityName];
                    patchSheet({ initAbilities: selected ? current.filter((item: AbilityName) => item !== ability) : [...current, ability] });
                  }} className={`rounded border px-1.5 py-0.5 text-[10px] uppercase ${selected ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground'}`}>{ability}</button>;
                })}
              </div>
              <NumField label="Misc Init" value={data?.miscInit ?? 0} onChange={(v: string) => { update('miscInit', v); autoSave(); }} disabled={!editable} className="mt-2" />
            </div>
            <div className="bg-card rounded-lg p-4 border border-border text-center" style={{ boxShadow: 'var(--shadow-sm)' }}>
              <div className="text-2xl font-mono font-bold">{formatMod(stats?.cmb ?? 0)}</div>
              <div className="text-xs text-muted-foreground">CMB</div>
              <div className="text-[10px] text-muted-foreground">Size {formatMod(stats?.combatSize ?? 0)}</div>
              <NumField label="Misc CMB" value={data?.miscCMB ?? 0} onChange={(v: string) => { update('miscCMB', v); autoSave(); }} disabled={!editable} className="mt-2" />
            </div>
            <div className="bg-card rounded-lg p-4 border border-border text-center" style={{ boxShadow: 'var(--shadow-sm)' }}>
              <div className="text-2xl font-mono font-bold">{stats?.cmd ?? 10}</div>
              <div className="text-xs text-muted-foreground">CMD</div>
              <div className="text-[10px] text-muted-foreground">Includes size, dodge, deflection, and AC penalties</div>
              <NumField label="Misc CMD" value={data?.miscCMD ?? 0} onChange={(v: string) => { update('miscCMD', v); autoSave(); }} disabled={!editable} className="mt-2" />
            </div>
            <div className="bg-card rounded-lg p-4 border border-border text-center" style={{ boxShadow: 'var(--shadow-sm)' }}>
              <NumField label="BAB" value={data?.bab ?? 0} onChange={(v: string) => { update('bab', v); autoSave(); }} disabled={!editable} />
              <NumField label="SR" value={data?.sr ?? 0} onChange={(v: string) => { update('sr', v); autoSave(); }} disabled={!editable} className="mt-2" />
            </div>
          </div>

          <div className="bg-card rounded-lg p-4 border border-border" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <h3 className="font-display font-semibold text-sm mb-3">Attack mods</h3>
            {(data?.equipped?.weapons ?? []).filter((weapon: { name?: string }) => weapon?.name?.trim()).length === 0 ? (
              <p className="text-xs text-muted-foreground">No weapons equipped. Add them on the Equipment tab.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b border-border">
                      <th className="text-left py-1 px-1">Weapon</th>
                      <th className="text-center py-1 px-1">Damage</th>
                      <th className="text-center py-1 px-1">Ability</th>
                      <th className="text-center py-1 px-1">BAB</th>
                      <th className="text-center py-1 px-1">Misc</th>
                      <th className="text-center py-1 px-1">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.equipped?.weapons ?? []).filter((weapon: { name?: string }) => weapon?.name?.trim()).map((weapon: { name: string; ability?: 'str' | 'dex'; extraAbilities?: AbilityName[]; attackBonus?: number; damage?: string; damageBonus?: number; crit?: string; range?: number; type?: string; category?: 'melee' | 'ranged' | 'thrown' | 'composite'; hands?: 'one' | 'two' | 'off'; baseDie?: 'medium' }, index: number) => {
                      const ability: 'str' | 'dex' = weapon.ability === 'dex' ? 'dex' : 'str';
                      const extraAbilities = weapon.extraAbilities ?? [];
                      const stat = (stats?.mods?.[ability] ?? 0) + extraAbilities.reduce((sum, extra) => sum + (stats?.mods?.[extra] ?? 0), 0);
                      const bab = parseInt(data?.bab) || 0;
                      const misc = (weapon.attackBonus || 0) + (parseInt(data?.sizeMod) || 0) + (stats?.itemBonuses.attack ?? 0);
                      const piece = { name: weapon.name, attackBonus: weapon.attackBonus || 0, ability, damage: weapon.damage || '1d6', damageBonus: weapon.damageBonus || 0, crit: weapon.crit || '20/x2', range: weapon.range || 0, type: weapon.type || '', category: weapon.category, hands: weapon.hands, baseDie: weapon.baseDie };
                      const totalsArgs = [bab, stats?.strMod ?? 0, stats?.dexMod ?? 0, parseInt(data?.sizeMod) || 0, (stats?.itemBonuses.attack ?? 0) + extraAbilities.reduce((sum, extra) => sum + (stats?.mods?.[extra] ?? 0), 0), stats?.itemBonuses.damage ?? 0, data?.size] as const;
                      const total = weaponTotals(piece, ...totalsArgs).attack;
                      const damageText = formatWeaponDamage({ ...piece, damage: weapon.damage ?? '' }, ...totalsArgs);
                      const critText = formatCrit(weapon.crit);
                      const abilityLabel = [ability, ...extraAbilities].map(item => `${item.toUpperCase()} ${formatMod(stats?.mods?.[item] ?? 0)}`).join(' + ');
                      return <tr key={`${weapon.name}-${index}`} className="border-b border-border/50">
                        <td className="py-1 px-1">{weapon.name}</td>
                        <td className="text-center font-mono whitespace-nowrap px-1">{damageText}{critText && damageText !== '\u2014' ? <span className="text-muted-foreground text-xs"> {critText}</span> : null}</td>
                        <td className="text-center font-mono">{abilityLabel || formatMod(stat)}</td>
                        <td className="text-center font-mono">{formatMod(bab)}</td>
                        <td className="text-center font-mono">{formatMod(misc)}</td>
                        <td className="text-center font-mono font-bold">{formatMod(total)}</td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-2">Damage uses the same totals as the Equipment tab (die scaled by size when “Scale die by size” is on + Str x1 / x1.5 two-hand / x0.5 off-hand for melee/thrown + weapon and gear damage bonuses); crit shown when set. Total = ability + BAB + misc. Misc is the weapon's attack bonus, size, and attack bonuses from gear, feats, and conditions.</p>
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
          <SensesSection value={data.equipped?.sheet?.senses} disabled={!editable} onChange={senses => patchSheet({ senses })} />
          <SheetEffects equipped={data.equipped ?? {}} editable={editable} onChange={next => { update('equipped', next); autoSave(); }} />
          <div className="bg-card rounded-lg p-4 border border-border space-y-3" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <h3 className="font-display font-semibold text-sm">DR and resistances</h3>
            <div className="space-y-2">
              {(data?.equipped?.sheet?.dr ?? []).map((row: DrRow, index: number) => <div key={index} className="flex gap-2">
                <Input aria-label="DR amount" type="number" value={row.amount} disabled={!editable} className="h-8 w-20" onChange={e => patchSheet({ dr: (data.equipped?.sheet?.dr ?? []).map((item: DrRow, i: number) => i === index ? { ...item, amount: parseInt(e.target.value) || 0 } : item) })} />
                <Input aria-label="DR bypass" value={row.bypass} disabled={!editable} placeholder="magic, adamantine…" className="h-8 flex-1" onChange={e => patchSheet({ dr: (data.equipped?.sheet?.dr ?? []).map((item: DrRow, i: number) => i === index ? { ...item, bypass: e.target.value } : item) })} />
                {editable && <Button variant="ghost" size="sm" onClick={() => patchSheet({ dr: (data.equipped?.sheet?.dr ?? []).filter((_: DrRow, i: number) => i !== index) })}>Remove</Button>}
              </div>)}
              {editable && <Button variant="ghost" size="sm" onClick={() => patchSheet({ dr: [...(data.equipped?.sheet?.dr ?? []), { amount: 5, bypass: '' }] })}>+ DR</Button>}
            </div>
            <div className="space-y-2">
              {(data?.equipped?.sheet?.resist ?? []).map((row: ResistRow, index: number) => <div key={index} className="flex gap-2">
                <Input aria-label="Energy" value={row.energy} disabled={!editable} placeholder="Fire" className="h-8 flex-1" onChange={e => patchSheet({ resist: (data.equipped?.sheet?.resist ?? []).map((item: ResistRow, i: number) => i === index ? { ...item, energy: e.target.value } : item) })} />
                <Input aria-label="Resistance amount" type="number" value={row.amount} disabled={!editable} className="h-8 w-20" onChange={e => patchSheet({ resist: (data.equipped?.sheet?.resist ?? []).map((item: ResistRow, i: number) => i === index ? { ...item, amount: parseInt(e.target.value) || 0 } : item) })} />
                {editable && <Button variant="ghost" size="sm" onClick={() => patchSheet({ resist: (data.equipped?.sheet?.resist ?? []).filter((_: ResistRow, i: number) => i !== index) })}>Remove</Button>}
              </div>)}
              {editable && <Button variant="ghost" size="sm" onClick={() => patchSheet({ resist: [...(data.equipped?.sheet?.resist ?? []), { energy: '', amount: 10 }] })}>+ Resistance</Button>}
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
                {(() => {
                  const weight = (data?.equipment ?? []).reduce((sum: number, i: EquipItem) => sum + ((i?.weight ?? 0) * (i?.quantity ?? 1)), 0);
                  const limits = carryLimits(stats?.mods ? ((parseInt(data?.str) || 0) + (stats?.itemBonuses.ability.str ?? 0)) : 10, data?.size ?? 'Medium');
                  return ` · ${loadBracket(weight, limits)} (light ${limits.light} / medium ${limits.medium} / heavy ${limits.heavy})`;
                })()}
              </span>
              {editable && (
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setCatalog('gear')}>+ From shop</Button>
                  <Button variant="ghost" size="sm" onClick={() => { update('equipment', [...(data?.equipment ?? []), { id: newEntryId(), name: '', weight: 0, quantity: 1, value: '', notes: '' }]); autoSave(); }}>+ Custom item</Button>
                </div>
              )}
            </div>
          </div>
          <CoinsBox purse={purse} coins={data.spells?.coins} editable={editable}
            onChange={coins => {
              update('spells', { ...(data.spells ?? { slots: {}, known: [] }), coins });
              autoSave();
            }} />
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
                return <EntryCard key={item?.id ?? i} name={item?.name ?? ''} unnamed="Unnamed item" meta={itemMeta(item)} body={item?.summary || item?.notes} libraryEntryId={item?.libraryEntryId} sourceUrl={item?.sourceUrl} editable={editable}
                  onDelete={() => { const arr = [...(data?.equipment ?? [])]; arr.splice(i, 1); update('equipment', arr); autoSave(); }}>
                  <Input value={item?.name ?? ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ name: e.target.value, libraryEntryId: undefined, sourceUrl: null, summary: undefined })} className="h-7 text-xs" placeholder="Item name" />
                  <label className="text-xs text-muted-foreground">Qty<Input type="number" value={item?.quantity ?? 1} onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ quantity: parseInt(e.target.value) || 1 })} className="h-7 text-xs text-center font-mono" /></label>
                  <SheetGearEditor key={item?.id ?? i} item={item} onPatch={(partial) => patch({ ...partial, summary: undefined })} idPrefix={`sheet-gear-${item?.id ?? i}`} />
                </EntryCard>;
              })}
            </div>
          )}
        </div>
      )}

      {isSection('equipped') && <EquipmentEditor value={data.equipped ?? {}} characterId={characterId} campaignId={data.campaignId} editable={editable}
        bab={Number(data.bab) || 0} strMod={stats?.strMod ?? 0} dexMod={stats?.dexMod ?? 0} sizeMod={Number(data.sizeMod) || 0} attackMod={stats?.itemBonuses.attack ?? 0} damageMod={stats?.itemBonuses.damage ?? 0} abilityMods={stats?.mods} size={data.size}
        onChange={value => {
          for (const key of ['armor', 'shield'] as const) {
            const field = key === 'armor' ? 'armorBonus' : 'shieldBonus';
            const current = parseInt(data[field]) || 0;
            const next = manualBonusAfterChange(data.equipped, value, key, current);
            if (next !== current) update(field, next);
          }
          update('equipped', value); autoSave();
        }} />}

      {isSection('powers') && <PsionicsSection value={data.spells?.psionics} editable={editable}
        abilityMods={{ int: stats?.intMod ?? 0, wis: stats?.wisMod ?? 0, cha: stats?.chaMod ?? 0 }}
        onChange={psionics => { update('spells', { ...(data.spells ?? { slots: {}, known: [] }), psionics }); autoSave(); }} />}
      {isSection('maneuvers') && <PathOfWarSection value={data.spells?.pathOfWar} editable={editable}
        abilityMods={{ int: stats?.intMod ?? 0, wis: stats?.wisMod ?? 0, cha: stats?.chaMod ?? 0 }}
        onChange={pathOfWar => { update('spells', { ...(data.spells ?? { slots: {}, known: [] }), pathOfWar }); autoSave(); }} />}

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
                <SkillRows skills={data?.skills ?? []} editable={editable} abilityModForSkill={abilityModForSkill}
                  skillBonuses={stats?.itemBonuses.skills ?? {}} skillAll={stats?.itemBonuses.skillAll ?? 0}
                  checkPenalty={stats?.effects.checkPenalty ?? 0}
                  onChange={(skills) => { update('skills', skills); autoSave(); }} />
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
                <Button variant="ghost" size="sm" onClick={() => { update('feats', [...(data?.feats ?? []), { id: newEntryId(), name: '', description: '' }]); autoSave(); }}>+ Custom</Button>
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
                      const tag = group.kind === 'ability' && feat?.tag && feat.tag in ABILITY_TAGS ? ABILITY_TAGS[feat.tag] : undefined;
                      const meta = [group.kind === 'ability' ? abilityMeta(feat) : feat.featType || 'Feat', ...(feat?.bonuses ?? []).map(bonusLabel)].filter(Boolean).join(' · ');
                      return <EntryCard key={feat?.id ?? index} name={feat?.name ?? ''} unnamed={group.kind === 'ability' ? 'Unnamed ability' : 'Unnamed feat'} meta={meta} note={tag?.text} body={group.kind === 'feat' ? featCardBody(feat) : feat?.summary || feat?.description} libraryEntryId={feat?.libraryEntryId} sourceUrl={feat?.sourceUrl} editable={editable}
                        onDelete={() => { const arr = [...(data?.feats ?? [])]; arr.splice(index, 1); update('feats', arr); autoSave(); }}>
                        <Input value={feat?.name ?? ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ name: e.target.value, libraryEntryId: undefined, sourceUrl: null, summary: undefined })} className="h-7 text-sm font-semibold" placeholder="Name" />
                        <label className="text-xs text-muted-foreground">Type
                          <select value={feat?.kind === 'ability' ? 'ability' : 'feat'} onChange={(e) => patch({ kind: e.target.value === 'ability' ? 'ability' : 'feat' })} className="mt-1 h-7 w-full rounded-md border border-input bg-background px-2 text-xs">
                            <option value="feat">Feat</option>
                            <option value="ability">Special ability</option>
                          </select>
                        </label>
                        {group.kind === 'ability' ? <>
                          <SheetAbilityEditor key={feat?.id ?? index} entry={feat} onPatch={(partial) => patch({ ...partial, summary: undefined })} idPrefix={`sheet-ability-${feat?.id ?? index}`} />
                          {tag && <p className="text-xs text-muted-foreground">{tag.text}</p>}
                        </> : <SheetFeatEditor key={feat?.id ?? index} entry={feat} onPatch={patch} idPrefix={`sheet-feat-${feat?.id ?? index}`} />}
                        <BonusEditor bonuses={feat?.bonuses ?? []} hint={group.kind === 'ability' ? 'This ability counts while it is on the sheet.' : 'This feat counts while it is on the sheet.'} onChange={bonuses => patch({ bonuses })} />

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

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold text-sm">Casting pools</h3>
              {editable && <Button variant="ghost" size="sm" onClick={() => { const spells = { ...(data?.spells ?? { slots: {}, known: [] }) }; spells.pools = [...(spells.pools ?? []), { name: 'Sorcerer', spontaneous: true, ability: 'cha', slots: Array(10).fill(0), used: Array(10).fill(0) }]; update('spells', spells); autoSave(); }}>+ Pool</Button>}
            </div>
            <p className="text-xs text-muted-foreground">Spontaneous pools share one set of slots. A spell set to its own uses is left out, which is how a prepared class stays separate. Add one pool per class if you multiclass.</p>
            {(data?.spells?.pools ?? []).map((pool: { name: string; spontaneous?: boolean; ability?: string; slots?: number[]; used?: number[] }, index: number) => (
              <div key={index} className="rounded-md border p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Input aria-label="Pool name" value={pool.name} disabled={!editable} className="h-8 w-40" onChange={e => { const spells = { ...(data.spells ?? {}) }; const pools = [...(spells.pools ?? [])]; pools[index] = { ...pools[index], name: e.target.value }; update('spells', { ...spells, pools }); autoSave(); }} />
                  <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={pool.spontaneous !== false} disabled={!editable} onChange={e => { const spells = { ...(data.spells ?? {}) }; const pools = [...(spells.pools ?? [])]; pools[index] = { ...pools[index], spontaneous: e.target.checked }; update('spells', { ...spells, pools }); autoSave(); }} /> Spontaneous</label>
                  <select aria-label="Pool casting ability" value={pool.ability ?? ''} disabled={!editable} onChange={e => { const spells = { ...(data.spells ?? {}) }; const pools = [...(spells.pools ?? [])]; pools[index] = { ...pools[index], ability: e.target.value }; update('spells', { ...spells, pools }); autoSave(); }} className="h-8 rounded-md border bg-card px-2 text-xs">
                    <option value="">Casting ability</option>
                    {(['int', 'wis', 'cha', 'str', 'dex', 'con'] as const).map(ability => <option key={ability} value={ability}>{ability.toUpperCase()}</option>)}
                  </select>
                  {editable && <Button variant="ghost" size="sm" onClick={() => { const spells = { ...(data.spells ?? {}) }; update('spells', { ...spells, pools: (spells.pools ?? []).filter((_: unknown, i: number) => i !== index) }); autoSave(); }}>Remove</Button>}
                </div>
                <div className="grid grid-cols-5 sm:grid-cols-10 gap-1">
                  {Array.from({ length: 10 }, (_, level) => <label key={level} className="text-center text-[10px] text-muted-foreground">{level}<Input type="number" aria-label={`${pool.name} level ${level} slots`} value={pool.slots?.[level] ?? 0} disabled={!editable} className="h-7 text-center text-xs" onChange={e => { const spells = { ...(data.spells ?? {}) }; const pools = [...(spells.pools ?? [])]; const slots = Array.from({ length: 10 }, (_, i) => pools[index]?.slots?.[i] ?? 0); slots[level] = parseInt(e.target.value) || 0; pools[index] = { ...pools[index], slots }; update('spells', { ...spells, pools }); autoSave(); }} /></label>)}
                </div>
              </div>
            ))}
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
                      {group.items.map(({ spell }) => {
                        const pools = data?.spells?.pools ?? [];
                        const pool = pools.find((item: { name?: string }) => item?.name && item.name === spell.pool);
                        const ability = spell.dcAbility || pool?.ability || castingAbility;
                        const mod = ability && stats ? stats[`${ability}Mod` as 'intMod'] : null;
                        const dc = mod === null || mod === undefined ? null : spellDc(spell.level ?? 0, mod + (stats?.itemBonuses.spellDc ?? 0));
                        const level = Math.max(0, Math.min(9, spell.level ?? 0));
                        const shared = pool?.spontaneous === false || !pool ? null : { used: pool.used?.[level] ?? 0, max: pool.slots?.[level] ?? 0 };
                        return (
                        <SpellCard key={spell.clientId} spell={spell} editable={editable} classes={spellClasses}
                          dc={dc}
                          pools={pools.map((item: { name: string }) => ({ name: item.name })).filter((item: { name: string }) => item.name)}
                          shared={shared}
                          onShared={(used) => {
                            const spells = { ...(data?.spells ?? { slots: {}, known: [] }) };
                            spells.pools = (spells.pools ?? []).map((item: { name?: string; used?: number[] }) => {
                              if (item.name !== spell.pool) return item;
                              const next = Array.from({ length: 10 }, (_, i) => item.used?.[i] ?? 0);
                              next[level] = used;
                              return { ...item, used: next };
                            });
                            update('spells', spells);
                            autoSave();
                          }}
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
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          </div>
          </CollapsibleSection>
          )}

          {detailTab === 'abilities' && (
          <CollapsibleSection sectionKey="abilities" title="Limited-use Abilities" bare openSections={openSections} setOpenSections={setOpenSections}>
          <div className="flex items-center gap-2 mb-3">
            <p className="text-xs text-muted-foreground flex-1">Class features, item powers, and spell-like abilities with limited uses.</p>
            {editable && (
              <>
                <Button variant="ghost" size="sm" onClick={() => {
                  const spells = { ...(data?.spells ?? { slots: {}, known: [] }) };
                  const abilities = [...abilityList, { id: newAbilityId(), name: '', source: 'class', max: 1, used: 0, reset: 'day', notes: '' }];
                  update('spells', { ...spells, abilities });
                  autoSave();
                }}>+ Add ability</Button>
                <Button variant="ghost" size="sm" onClick={() => {
                  const spells = { ...(data?.spells ?? { slots: {}, known: [] }) };
                  const abilities = abilityList.map((a: any) => a?.reset === 'day' ? { ...a, used: 0 } : a);
                  update('spells', { ...spells, abilities });
                  autoSave();
                }}>Reset daily uses</Button>
              </>
            )}
          </div>
          {abilityList.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No limited-use abilities. Add class features, item powers, or spell-like abilities.</p>
          ) : (
            <div className={sheetCardGridClass}>
              {abilityList.map((ability: any) => {
                const patch = (partial: any) => {
                  const spells = { ...(data?.spells ?? { slots: {}, known: [] }) };
                  const abilities = [...abilityList];
                  const i = abilities.findIndex((a: any) => a.id === ability.id);
                  if (i < 0) return;
                  abilities[i] = { ...(abilities[i] ?? {}), ...partial };
                  update('spells', { ...spells, abilities });
                  autoSave();
                };
                const rawMax = Number(ability?.max);
                const rawUsed = Number(ability?.used);
                const max = Number.isFinite(rawMax) ? Math.min(1000, Math.max(0, Math.trunc(rawMax))) : 1;
                const used = Number.isFinite(rawUsed) ? Math.min(max, Math.max(0, Math.trunc(rawUsed))) : 0;
                return (
                  <div key={ability.id} className="bg-muted/50 rounded-lg p-3 border border-border flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Input value={ability?.name ?? ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ name: e.target.value })} disabled={!editable} className="h-7 text-xs font-semibold" placeholder="Ability name" />
                      {editable && (
                        <Button variant="ghost" size="icon-sm" aria-label={`Delete ${ability?.name || 'ability'}`} onClick={() => {
                          const spells = { ...(data?.spells ?? { slots: {}, known: [] }) };
                          const abilities = [...abilityList];
                          const i = abilities.findIndex((a: any) => a.id === ability.id);
                          if (i < 0) return;
                          abilities.splice(i, 1);
                          update('spells', { ...spells, abilities });
                          autoSave();
                        }}><Trash2 className="w-3 h-3 text-destructive" /></Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs text-muted-foreground">Source
                        <select value={ability?.source ?? 'class'} disabled={!editable} onChange={(e) => patch({ source: e.target.value })} className="mt-1 h-7 w-full rounded-md border border-input bg-background px-2 text-xs">
                          <option value="class">Class feature</option>
                          <option value="item">Item power</option>
                          <option value="sla">Spell-like ability</option>
                          <option value="other">Other</option>
                        </select>
                      </label>
                      <label className="text-xs text-muted-foreground">Resets
                        <select value={ability?.reset ?? 'day'} disabled={!editable} onChange={(e) => patch({ reset: e.target.value })} className="mt-1 h-7 w-full rounded-md border border-input bg-background px-2 text-xs">
                          <option value="day">Daily</option>
                          <option value="encounter">Per encounter</option>
                          <option value="week">Weekly</option>
                          <option value="none">Never</option>
                        </select>
                      </label>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span>Used {used} / {max}</span>
                      {editable && (
                        <>
                          <Button variant="ghost" size="icon-sm" className="h-5 w-5" aria-label={`Refund a use of ${ability?.name || 'ability'}`} onClick={() => patch({ used: Math.max(0, used - 1) })}>-</Button>
                          <Button variant="ghost" size="icon-sm" className="h-5 w-5" aria-label={`Spend a use of ${ability?.name || 'ability'}`} disabled={used >= max} onClick={() => patch({ used: Math.min(max, used + 1) })}>+</Button>
                        </>
                      )}
                      <label className="ml-auto flex items-center gap-1 text-muted-foreground">
                        <span>{{ day: 'Per day', encounter: 'Per encounter', week: 'Per week', none: 'Total uses' }[ability?.reset as string] ?? 'Per day'}</span>
                        <Input type="number" min="0" value={max} disabled={!editable} onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ max: Math.max(0, parseInt(e.target.value) || 0) })} className="w-16 h-6 text-xs text-center font-mono" />
                      </label>
                    </div>
                    <label className="block text-xs text-muted-foreground">Notes
                      <textarea value={ability?.notes ?? ''} disabled={!editable} onChange={(e) => patch({ notes: e.target.value })} className="w-full bg-transparent text-xs text-muted-foreground resize-y min-h-[40px] mt-1" placeholder="Short notes..." />
                    </label>
                  </div>
                );
              })}
            </div>
          )}
          </CollapsibleSection>
          )}

          {detailTab === 'notes' && (
          <CollapsibleSection sectionKey="notes" title="Notes & Backstory" bare openSections={openSections} setOpenSections={setOpenSections}>
          <TipTapEditor content={data?.notes ?? ''} onChange={(html: string) => { update('notes', html); autoSave(); }} editable={editable} placeholder="Session notes, reminders, anything else..." />
          </CollapsibleSection>
          )}
          {detailTab === 'backstory' && (
            <BackstoryTab backstory={data.equipped?.sheet?.backstory ?? ''} editable={editable} onChange={backstory => patchSheet({ backstory })} />
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
          onCustom={() => { update('equipment', [...(data?.equipment ?? []), { id: newEntryId(), name: '', weight: 0, quantity: 1, value: '', notes: '' }]); autoSave(); setCatalog(null); }}
          onPick={(entry) => {
            const item = { id: newEntryId(), ...gearFromLibrary(entry.name, (entry.data ?? {}) as GearData, { libraryEntryId: entry.id, sourceUrl: entry.sourceUrl }), summary: entry.summary ?? '' };
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
          onCustom={() => { update('feats', [...(data?.feats ?? []), { id: newEntryId(), name: '', description: '' }]); autoSave(); setCatalog(null); }}
          onPick={(entry) => {
            const made = featFromLibrary(entry.name, (entry.data ?? {}) as FeatData, { libraryEntryId: entry.id, sourceUrl: entry.sourceUrl });
            const kind = entry.kind === 'ability' ? 'ability' as const : 'feat' as const;
            const feat = { ...made, id: newEntryId(), summary: entry.summary ?? '', kind, tag: kind === 'ability' ? made.tag ?? abilityTag(entry.name, `${entry.summary ?? ''}\n${made.description}`) : undefined };
            setData((prev: any) => ({ ...prev, feats: [...(prev?.feats ?? []), feat] }));
            autoSave();
          }}
        />
      )}
      </div>
      {rightPins.length > 0 && <PinRail ids={rightPins} side="right" data={data} stats={stats} editable={editable} onChange={(field, value) => { update(field, value); autoSave(); }} onUnpin={id => pin('right', id)} />}
    </div>
  );
}
