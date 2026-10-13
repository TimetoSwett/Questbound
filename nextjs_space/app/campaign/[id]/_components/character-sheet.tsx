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
import { EquipmentEditor } from './equipment-editor';
import { equipmentEffects, equipmentSkillPenalty } from '@/lib/equipment';

const SIZES = ['Fine', 'Diminutive', 'Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan', 'Colossal'];
const ALIGNMENTS = ['LG', 'NG', 'CG', 'LN', 'N', 'CN', 'LE', 'NE', 'CE'];

interface SkillEntry { name: string; ranks: number; classSkill: boolean; misc: number; }
interface EquipItem { name: string; weight: number; quantity: number; value: string; notes: string; }
interface FeatEntry { name: string; description: string; }
interface SpellEntry { name: string; level: number; school: string; description: string; cast: number; maxCast: number; }
interface ClassEntry { name: string; level: number; }

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

function resolveSection(key: string): string {
  return SECTION_ALIASES[key] ?? key;
}

function CollapsibleSection({ sectionKey, title, actions, children, openSections, setOpenSections }: {
  sectionKey: string;
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  openSections: Record<string, boolean>;
  setOpenSections: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}) {
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
  const setSection = (s: string) => setSectionState(resolveSection(s));
  const isSection = (key: string): boolean => sectionState === key;
  // Collapsible open/closed state persists across tab switches.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ skills: true, feats: true, spells: true, notes: true });
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
          <button key={s.key} onClick={() => setSection(resolveSection(s.key))}
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
                <Button variant="ghost" size="sm" onClick={() => { update('equipment', [...(data?.equipment ?? []), { name: '', weight: 0, quantity: 1, value: '', notes: '' }]); autoSave(); }}>+ Add Item</Button>
              )}
            </div>
          </div>
          {(data?.equipment ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No items</p>
          ) : (
            <div className="space-y-1">
              <div className="grid grid-cols-[1fr_60px_50px_70px_30px] gap-2 text-xs text-muted-foreground px-1">
                <span>Name</span><span>Weight</span><span>Qty</span><span>Value</span><span></span>
              </div>
              {(data?.equipment ?? []).map((item: EquipItem, i: number) => (
                <div key={i} className="grid grid-cols-[1fr_60px_50px_70px_30px] gap-2 items-center">
                  <Input value={item?.name ?? ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const arr = [...(data?.equipment ?? [])]; arr[i] = { ...(arr[i] ?? {}), name: e.target.value }; update('equipment', arr); autoSave(); }} disabled={!editable} className="h-7 text-xs" placeholder="Item name" />
                  <Input type="number" value={item?.weight ?? 0} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const arr = [...(data?.equipment ?? [])]; arr[i] = { ...(arr[i] ?? {}), weight: parseFloat(e.target.value) || 0 }; update('equipment', arr); autoSave(); }} disabled={!editable} className="h-7 text-xs text-center font-mono" />
                  <Input type="number" value={item?.quantity ?? 1} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const arr = [...(data?.equipment ?? [])]; arr[i] = { ...(arr[i] ?? {}), quantity: parseInt(e.target.value) || 1 }; update('equipment', arr); autoSave(); }} disabled={!editable} className="h-7 text-xs text-center font-mono" />
                  <Input value={item?.value ?? ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const arr = [...(data?.equipment ?? [])]; arr[i] = { ...(arr[i] ?? {}), value: e.target.value }; update('equipment', arr); autoSave(); }} disabled={!editable} className="h-7 text-xs" placeholder="gp" />
                  {editable && (
                    <Button variant="ghost" size="icon-sm" onClick={() => { const arr = [...(data?.equipment ?? [])]; arr.splice(i, 1); update('equipment', arr); autoSave(); }}>
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isSection('equipped') && <EquipmentEditor value={data.equipped ?? {}} characterId={characterId} campaignId={data.campaignId} editable={editable}
        bab={Number(data.bab) || 0} strMod={stats?.strMod ?? 0} dexMod={stats?.dexMod ?? 0} sizeMod={Number(data.sizeMod) || 0}
        onChange={value => { update('equipped', value); autoSave(); }} />}

      {/* DETAILS TAB: Feats, Skills, Spells & Notes */}
      {isSection('details') && (
        <div className="space-y-4">
          <CollapsibleSection sectionKey="skills" title="Skills" openSections={openSections} setOpenSections={setOpenSections}>
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

          <CollapsibleSection
            sectionKey="feats"
            title="Feats & Special Abilities"
            openSections={openSections}
            setOpenSections={setOpenSections}
            actions={editable ? (
              <Button variant="ghost" size="sm" onClick={() => { update('feats', [...(data?.feats ?? []), { name: '', description: '' }]); autoSave(); }}>+ Add Feat</Button>
            ) : undefined}
          >
          {(data?.feats ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No feats</p>
          ) : (
            <div className="space-y-3">
              {(data?.feats ?? []).map((feat: FeatEntry, i: number) => (
                <div key={i} className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Input value={feat?.name ?? ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const arr = [...(data?.feats ?? [])]; arr[i] = { ...(arr[i] ?? {}), name: e.target.value }; update('feats', arr); autoSave(); }} disabled={!editable} className="h-7 text-sm font-semibold" placeholder="Feat name" />
                    {editable && (
                      <Button variant="ghost" size="icon-sm" onClick={() => { const arr = [...(data?.feats ?? [])]; arr.splice(i, 1); update('feats', arr); autoSave(); }}>
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </Button>
                    )}
                  </div>
                  <textarea value={feat?.description ?? ''} onChange={(e) => { const arr = [...(data?.feats ?? [])]; arr[i] = { ...(arr[i] ?? {}), description: e.target.value }; update('feats', arr); autoSave(); }} disabled={!editable}
                    className="w-full bg-transparent text-xs text-muted-foreground resize-none min-h-[40px] outline-none" placeholder="Description..." />
                </div>
              ))}
            </div>
          )}
          </CollapsibleSection>

          <CollapsibleSection sectionKey="spells" title="Spells" openSections={openSections} setOpenSections={setOpenSections}>
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
                <Button variant="ghost" size="sm" onClick={() => {
                  const spells = { ...(data?.spells ?? { slots: {}, known: [] }) };
                  spells.known = [...(spells.known ?? []), { name: '', level: 0, school: '', description: '', cast: 0, maxCast: 1 }];
                  update('spells', spells);
                  autoSave();
                }}>+ Add Spell</Button>
              )}
            </div>
            {(data?.spells?.known ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No spells</p>
            ) : (
              <div className="space-y-2">
                {(data?.spells?.known ?? []).map((spell: SpellEntry, i: number) => (
                  <div key={i} className="p-3 bg-muted/50 rounded-lg">
                    <div className="grid grid-cols-[1fr_50px_80px_60px_30px] gap-2 items-center">
                      <Input value={spell?.name ?? ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const spells = { ...(data?.spells ?? { slots: {}, known: [] }) };
                        spells.known = [...(spells.known ?? [])];
                        spells.known[i] = { ...(spells.known[i] ?? {}), name: e.target.value };
                        update('spells', spells); autoSave();
                      }} disabled={!editable} className="h-7 text-xs" placeholder="Spell name" />
                      <Input type="number" value={spell?.level ?? 0} onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const spells = { ...(data?.spells ?? { slots: {}, known: [] }) };
                        spells.known = [...(spells.known ?? [])];
                        spells.known[i] = { ...(spells.known[i] ?? {}), level: parseInt(e.target.value) || 0 };
                        update('spells', spells); autoSave();
                      }} disabled={!editable} className="h-7 text-xs text-center font-mono" />
                      <Input value={spell?.school ?? ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const spells = { ...(data?.spells ?? { slots: {}, known: [] }) };
                        spells.known = [...(spells.known ?? [])];
                        spells.known[i] = { ...(spells.known[i] ?? {}), school: e.target.value };
                        update('spells', spells); autoSave();
                      }} disabled={!editable} className="h-7 text-xs" placeholder="School" />
                      <div className="flex items-center gap-1 text-xs font-mono">
                        <span>{spell?.cast ?? 0}/{spell?.maxCast ?? 1}</span>
                        {editable && (
                          <Button variant="ghost" size="icon-sm" className="h-5 w-5" onClick={() => {
                            const spells = { ...(data?.spells ?? { slots: {}, known: [] }) };
                            spells.known = [...(spells.known ?? [])];
                            spells.known[i] = { ...(spells.known[i] ?? {}), cast: (spell?.cast ?? 0) + 1 };
                            update('spells', spells); autoSave();
                          }}>+</Button>
                        )}
                      </div>
                      {editable && (
                        <Button variant="ghost" size="icon-sm" onClick={() => {
                          const spells = { ...(data?.spells ?? { slots: {}, known: [] }) };
                          spells.known = [...(spells.known ?? [])];
                          spells.known.splice(i, 1);
                          update('spells', spells); autoSave();
                        }}>
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      )}
                    </div>
                    <textarea value={spell?.description ?? ''} onChange={(e) => {
                      const spells = { ...(data?.spells ?? { slots: {}, known: [] }) };
                      spells.known = [...(spells.known ?? [])];
                      spells.known[i] = { ...(spells.known[i] ?? {}), description: e.target.value };
                      update('spells', spells); autoSave();
                    }} disabled={!editable}
                      className="w-full bg-transparent text-xs text-muted-foreground resize-none min-h-[30px] outline-none mt-1" placeholder="Description..." />
                  </div>
                ))}
              </div>
            )}
          </div>
          </div>
          </CollapsibleSection>

          <CollapsibleSection sectionKey="notes" title="Notes & Backstory" openSections={openSections} setOpenSections={setOpenSections}>
          <TipTapEditor content={data?.notes ?? ''} onChange={(html: string) => { update('notes', html); autoSave(); }} editable={editable} placeholder="Write your character's backstory, notes, and other details..." />
          </CollapsibleSection>
        </div>
      )}
    </div>
  );
}
