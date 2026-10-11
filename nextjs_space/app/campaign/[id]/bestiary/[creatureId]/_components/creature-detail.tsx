'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, BookOpen, Plus, Trash2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { FadeIn } from '@/components/ui/animate';

// Keys the PUT endpoint accepts (creatureInputSchema, strict). Never send anything else.
const SAVE_KEYS = [
  'name', 'type', 'subtype', 'cr', 'alignment', 'size', 'isNpc', 'portraitPath',
  'acTotal', 'acTouch', 'acFlatFooted', 'hpMax', 'hpCurrent', 'hitDice',
  'fort', 'ref', 'will',
  'str', 'dex', 'con', 'int', 'wis', 'cha', 'speed',
  'attacks', 'skills', 'feats', 'specialAbilities', 'spells', 'gear',
  'wikiPageId', 'gmNotes', 'playerNotes', 'revealLevel', 'unlockedSections',
] as const;

const REVEAL_LEVELS = ['hidden', 'unknown', 'named', 'full'] as const;

// Sections unlockable one at a time at the "unknown"/"named" reveal levels.
const REVEAL_SECTIONS = [
  { key: 'name', label: 'Name' },
  { key: 'defense', label: 'Defense' },
  { key: 'offense', label: 'Offense' },
  { key: 'statistics', label: 'Statistics' },
  { key: 'specialAbilities', label: 'Special Abilities' },
  { key: 'playerNotes', label: 'Player Notes' },
  { key: 'wiki', label: 'Wiki Page' },
] as const;

const SIZES = ['Fine', 'Diminutive', 'Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan', 'Colossal'];

const asArray = (v: any): any[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);

function normalizeSpells(v: any): { slots: Record<string, unknown>; known: any[] } {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return { slots: (v.slots && typeof v.slots === 'object' ? v.slots : {}), known: asArray(v.known) };
  }
  return { slots: {}, known: [] };
}

function normalize(raw: any): any {
  const level = REVEAL_LEVELS.includes(raw?.revealLevel) ? raw.revealLevel : 'hidden';
  return {
    ...raw,
    revealLevel: level,
    unlockedSections: Array.isArray(raw?.unlockedSections)
      ? (raw.unlockedSections as unknown[]).filter((x): x is string => typeof x === 'string')
      : [],
    playerNotes: typeof raw?.playerNotes === 'string' ? raw.playerNotes : '',
    attacks: asArray(raw?.attacks),
    skills: asArray(raw?.skills),
    feats: asArray(raw?.feats),
    specialAbilities: asArray(raw?.specialAbilities),
    gear: asArray(raw?.gear),
    spells: normalizeSpells(raw?.spells),
  };
}

const parseIntField = (raw: string, prev: number): number => {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : prev;
};

const parseScore = (raw: string, prev: number | null): number | null => {
  if (raw.trim() === '') return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : prev;
};

function abilityMod(score: number | null | undefined): string {
  if (score == null) return '—';
  const m = Math.floor((score - 10) / 2);
  return `${m >= 0 ? '+' : ''}${m}`;
}

export function CreatureDetail({ campaignId, creatureId, role }: { campaignId: string; creatureId: string; role: string }) {
  const router = useRouter();
  const isDM = role === 'dm';
  const [data, setData] = useState<any>(null);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [wikiPages, setWikiPages] = useState<any[]>([]);
  const saveTimer = useRef<any>(null);
  const dataRef = useRef<any>(null);
  useEffect(() => { dataRef.current = data; }, [data]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/creatures?id=${creatureId}`);
      if (res.status === 404) { setNotFound(true); return; }
      if (res.ok) setData(normalize(await res.json()));
    } catch { /* ignore */ }
  }, [creatureId]);

  useEffect(() => { load(); }, [load]);

  // GM-only: wiki pages for the link picker.
  useEffect(() => {
    if (!isDM) return;
    (async () => {
      try {
        const res = await fetch(`/api/wiki?campaignId=${campaignId}`);
        if (res.ok) setWikiPages((await res.json()) ?? []);
      } catch { /* ignore */ }
    })();
  }, [isDM, campaignId]);

  const saveNow = useCallback(async (overrides?: Record<string, unknown>) => {
    const d = dataRef.current;
    if (!d || !isDM) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = { id: creatureId };
      // Omit undefined keys; the PUT schema is partial+strict, so unknown or
      // null-in-non-nullable fields would be rejected. Nulls are only sent for
      // genuinely nullable fields (scores, portraitPath, wikiPageId).
      for (const k of SAVE_KEYS) {
        const v: unknown = overrides && k in overrides ? (overrides as Record<string, unknown>)[k] : d[k];
        if (v !== undefined) body[k] = v;
      }
      const res = await fetch('/api/creatures', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) toast.error('Could not save creature');
    } catch {
      toast.error('Could not save creature');
    } finally {
      setSaving(false);
    }
  }, [creatureId, isDM]);

  const autoSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void saveNow(); }, 2000);
  }, [saveNow]);

  // Flush a pending debounced save on unmount (e.g. "Back to Bestiary" within 2s of an edit).
  useEffect(() => () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; void saveNow(); }
  }, [saveNow]);

  const update = useCallback((field: string, value: any) => {
    setData((prev: any) => ({ ...(prev ?? {}), [field]: value }));
  }, []);

  const updateAndSave = useCallback((field: string, value: any) => {
    update(field, value);
    autoSave();
  }, [update, autoSave]);

  const updateListItem = useCallback((field: string, index: number, patch: Record<string, any>) => {
    setData((prev: any) => {
      const arr = [...(prev?.[field] ?? [])];
      arr[index] = { ...(arr[index] ?? {}), ...patch };
      return { ...(prev ?? {}), [field]: arr };
    });
    autoSave();
  }, [autoSave]);

  const addListItem = useCallback((field: string, item: Record<string, any>) => {
    setData((prev: any) => ({ ...(prev ?? {}), [field]: [...(prev?.[field] ?? []), item] }));
    autoSave();
  }, [autoSave]);

  const removeListItem = useCallback((field: string, index: number) => {
    setData((prev: any) => {
      const arr = [...(prev?.[field] ?? [])];
      arr.splice(index, 1);
      return { ...(prev ?? {}), [field]: arr };
    });
    autoSave();
  }, [autoSave]);

  if (notFound) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <Button variant="ghost" size="sm" onClick={() => router.push(`/campaign/${campaignId}?tab=bestiary`)} className="mb-4">
            <ChevronRight className="w-4 h-4 rotate-180 mr-1" /> Back to Bestiary
          </Button>
          <div className="text-center py-16">
            <BookOpen className="w-14 h-14 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">This creature doesn&apos;t exist or hasn&apos;t been revealed to you yet.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <p className="text-muted-foreground py-10 text-center">Loading creature...</p>
        </div>
      </div>
    );
  }

  // Players only ever see the basic card the API returns.
  if (!isDM) return <PlayerCard data={data} onBack={() => router.push(`/campaign/${campaignId}?tab=bestiary`)} />;

  const wikiTitle = (wikiPages ?? []).find((p) => p?.id === data.wikiPageId)?.title ?? data?.wikiPage?.title;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <FadeIn>
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="sm" onClick={() => router.push(`/campaign/${campaignId}?tab=bestiary`)}>
              <ChevronRight className="w-4 h-4 rotate-180 mr-1" /> Back to Bestiary
            </Button>
            <span className="text-xs text-muted-foreground font-mono">{saving ? 'Saving…' : 'Saved'}</span>
          </div>

          {/* ---- Header: name / CR / type line ---- */}
          <div className="bg-card rounded-lg border border-border p-5 mb-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <div className="flex flex-wrap items-start gap-3">
              {data.portraitUrl && (
                <img src={data.portraitUrl} alt={data.name} className="w-20 h-20 rounded-lg object-cover border border-border" />
              )}
              <div className="flex-1 min-w-[220px]">
                <Input
                  value={data.name ?? ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateAndSave('name', e.target.value)}
                  className="font-display text-2xl font-bold tracking-tight h-11 px-2 -ml-2 border-transparent hover:border-input focus:border-input bg-transparent"
                  placeholder="Creature name"
                />
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <label className="text-xs text-muted-foreground">CR</label>
                  <Input
                    value={data.cr ?? ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateAndSave('cr', e.target.value)}
                    className="h-7 w-16 text-sm font-mono text-center"
                    placeholder="—"
                  />
                  <Select value={data.isNpc ? 'npc' : 'monster'} onValueChange={(v: string) => updateAndSave('isNpc', v === 'npc')}>
                    <SelectTrigger className="h-7 w-[110px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="npc">NPC</SelectItem>
                      <SelectItem value="monster">Monster</SelectItem>
                    </SelectContent>
                  </Select>
                  <label className="text-xs text-muted-foreground ml-1">Reveal</label>
                  <Select value={data.revealLevel ?? 'hidden'} onValueChange={(v: string) => updateAndSave('revealLevel', v)}>
                    <SelectTrigger className="h-7 w-[110px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hidden">Hidden</SelectItem>
                      <SelectItem value="unknown">Unknown</SelectItem>
                      <SelectItem value="named">Named</SelectItem>
                      <SelectItem value="full">Full</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(data.revealLevel === 'named' || data.revealLevel === 'unknown') && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 pt-3 border-t border-border">
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Unlock sections:</span>
                    {REVEAL_SECTIONS.map((s) => {
                      const on = (data.unlockedSections ?? []).includes(s.key);
                      return (
                        <label key={s.key} className="flex items-center gap-1.5 text-xs cursor-pointer">
                          <Switch
                            checked={on}
                            onCheckedChange={() => {
                              const cur: string[] = data.unlockedSections ?? [];
                              const next = on ? cur.filter((k: string) => k !== s.key) : [...cur, s.key];
                              update('unlockedSections', next);
                              void saveNow({ unlockedSections: next });
                            }}
                          />
                          {s.label}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
              <div>
                <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Size</label>
                <Select value={data.size ?? 'Medium'} onValueChange={(v: string) => updateAndSave('size', v)}>
                  <SelectTrigger className="h-8 mt-0.5 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{SIZES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <TextField label="Type" value={data.type ?? ''} onChange={(v: string) => updateAndSave('type', v)} placeholder="Humanoid" />
              <TextField label="Subtype" value={data.subtype ?? ''} onChange={(v: string) => updateAndSave('subtype', v)} placeholder="Goblinoid" />
              <TextField label="Alignment" value={data.alignment ?? ''} onChange={(v: string) => updateAndSave('alignment', v)} placeholder="NE" />
            </div>
          </div>

          {/* ---- Defense ---- */}
          <Section title="Defense">
            <div className="grid grid-cols-3 gap-2 mb-3">
              <NumField label="AC" value={data.acTotal} onChange={(v: string) => updateAndSave('acTotal', parseIntField(v, data.acTotal ?? 10))} />
              <NumField label="Touch" value={data.acTouch} onChange={(v: string) => updateAndSave('acTouch', parseIntField(v, data.acTouch ?? 10))} />
              <NumField label="Flat-footed" value={data.acFlatFooted} onChange={(v: string) => updateAndSave('acFlatFooted', parseIntField(v, data.acFlatFooted ?? 10))} />
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <NumField label="HP (current)" value={data.hpCurrent} onChange={(v: string) => updateAndSave('hpCurrent', parseIntField(v, data.hpCurrent ?? 0))} />
              <NumField label="HP (max)" value={data.hpMax} onChange={(v: string) => updateAndSave('hpMax', parseIntField(v, data.hpMax ?? 0))} />
              <TextField label="Hit Dice" value={data.hitDice ?? ''} onChange={(v: string) => updateAndSave('hitDice', v)} placeholder="3d8+6" mono />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <NumField label="Fort" value={data.fort} onChange={(v: string) => updateAndSave('fort', parseIntField(v, data.fort ?? 0))} signed />
              <NumField label="Ref" value={data.ref} onChange={(v: string) => updateAndSave('ref', parseIntField(v, data.ref ?? 0))} signed />
              <NumField label="Will" value={data.will} onChange={(v: string) => updateAndSave('will', parseIntField(v, data.will ?? 0))} signed />
            </div>
          </Section>

          {/* ---- Offense ---- */}
          <Section title="Offense">
            <div className="grid grid-cols-3 gap-2 mb-4">
              <NumField label="Speed (ft)" value={data.speed} onChange={(v: string) => updateAndSave('speed', parseIntField(v, data.speed ?? 30))} />
            </div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Attacks</h4>
            <EntryEditor
              items={data.attacks}
              onAdd={() => addListItem('attacks', { name: '', bonus: '', damage: '', critical: '', type: '', notes: '' })}
              onRemove={(i: number) => removeListItem('attacks', i)}
              addLabel="Add attack"
              columns={[
                { key: 'name', label: 'Attack', placeholder: 'Bite', className: 'flex-[2]' },
                { key: 'bonus', label: 'Atk bonus', placeholder: '+5', className: 'w-20', mono: true },
                { key: 'damage', label: 'Damage', placeholder: '1d6+2', className: 'w-24', mono: true },
                { key: 'critical', label: 'Crit', placeholder: '×2', className: 'w-16', mono: true },
                { key: 'type', label: 'Type', placeholder: 'B/P/S', className: 'w-20' },
              ]}
              notesKey="notes"
              onEdit={(i: number, k: string, v: string) => updateListItem('attacks', i, { [k]: v })}
            />
            {(data.spells?.known ?? []).length > 0 && (
              <>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-4 mb-2">Spells Known</h4>
                <EntryEditor
                  items={data.spells.known}
                  onAdd={() => {
                    const spells = { ...(data.spells ?? { slots: {}, known: [] }), known: [...(data.spells?.known ?? []), { name: '', level: '', school: '', description: '' }] };
                    updateAndSave('spells', spells);
                  }}
                  onRemove={(i: number) => {
                    const known = [...(data.spells?.known ?? [])];
                    known.splice(i, 1);
                    updateAndSave('spells', { ...(data.spells ?? { slots: {}, known: [] }), known });
                  }}
                  addLabel="Add spell"
                  columns={[
                    { key: 'name', label: 'Spell', placeholder: 'Fireball', className: 'flex-[2]' },
                    { key: 'level', label: 'Lvl', placeholder: '3', className: 'w-14', mono: true },
                    { key: 'school', label: 'School', placeholder: 'Evocation', className: 'w-28' },
                  ]}
                  notesKey="description"
                  onEdit={(i: number, k: string, v: string) => {
                    const known = [...(data.spells?.known ?? [])];
                    known[i] = { ...(known[i] ?? {}), [k]: v };
                    updateAndSave('spells', { ...(data.spells ?? { slots: {}, known: [] }), known });
                  }}
                />
              </>
            )}
            {(data.spells?.known ?? []).length === 0 && (
              <Button variant="ghost" size="sm" className="mt-1 text-muted-foreground" onClick={() => {
                updateAndSave('spells', { ...(data.spells ?? { slots: {}, known: [] }), known: [{ name: '', level: '', school: '', description: '' }] });
              }}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Add spellcasting
              </Button>
            )}
          </Section>

          {/* ---- Statistics ---- */}
          <Section title="Statistics">
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
              {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((ab) => (
                <div key={ab} className="bg-muted/50 rounded-lg p-2 text-center">
                  <label className="text-[11px] uppercase tracking-wide text-muted-foreground">{ab}</label>
                  <Input
                    value={data[ab] ?? ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateAndSave(ab, parseScore(e.target.value, data[ab] ?? null))}
                    className="h-8 mt-1 text-center font-mono text-lg font-semibold bg-transparent border-transparent hover:border-input focus:border-input"
                    placeholder="—"
                  />
                  <div className="text-xs font-mono text-muted-foreground">{abilityMod(data[ab])}</div>
                </div>
              ))}
            </div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Feats</h4>
            <EntryEditor
              items={data.feats}
              onAdd={() => addListItem('feats', { name: '' })}
              onRemove={(i: number) => removeListItem('feats', i)}
              addLabel="Add feat"
              columns={[{ key: 'name', label: 'Feat', placeholder: 'Power Attack', className: 'flex-1' }]}
              onEdit={(i: number, k: string, v: string) => updateListItem('feats', i, { [k]: v })}
            />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-4 mb-2">Skills</h4>
            <EntryEditor
              items={data.skills}
              onAdd={() => addListItem('skills', { name: '', bonus: '' })}
              onRemove={(i: number) => removeListItem('skills', i)}
              addLabel="Add skill"
              columns={[
                { key: 'name', label: 'Skill', placeholder: 'Perception', className: 'flex-1' },
                { key: 'bonus', label: 'Bonus', placeholder: '+8', className: 'w-20', mono: true },
              ]}
              onEdit={(i: number, k: string, v: string) => updateListItem('skills', i, { [k]: v })}
            />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-4 mb-2">Gear</h4>
            <EntryEditor
              items={data.gear}
              onAdd={() => addListItem('gear', { name: '', notes: '' })}
              onRemove={(i: number) => removeListItem('gear', i)}
              addLabel="Add gear"
              columns={[{ key: 'name', label: 'Item', placeholder: 'Longsword', className: 'flex-1' }]}
              notesKey="notes"
              onEdit={(i: number, k: string, v: string) => updateListItem('gear', i, { [k]: v })}
            />
          </Section>

          {/* ---- Special Abilities ---- */}
          <Section title="Special Abilities">
            <EntryEditor
              items={data.specialAbilities}
              onAdd={() => addListItem('specialAbilities', { name: '', description: '' })}
              onRemove={(i: number) => removeListItem('specialAbilities', i)}
              addLabel="Add special ability"
              columns={[{ key: 'name', label: 'Ability', placeholder: 'Darkvision', className: 'flex-1' }]}
              notesKey="description"
              textarea
              onEdit={(i: number, k: string, v: string) => updateListItem('specialAbilities', i, { [k]: v })}
            />
          </Section>

          {/* ---- GM notes (GM only) ---- */}
          <Section title="GM Notes" subtle>
            <textarea
              value={data.gmNotes ?? ''}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateAndSave('gmNotes', e.target.value)}
              placeholder="Secret tactics, plot hooks, things the players must never know..."
              className="w-full min-h-[100px] bg-muted/50 rounded-lg p-3 text-sm outline-none focus:ring-1 focus:ring-ring resize-y"
            />
          </Section>

          {/* ---- Player notes (GM only editor; shown to players when unlocked) ---- */}
          <Section title="Player Notes" subtle>
            <p className="text-xs text-muted-foreground mb-2">
              Weaknesses, rumors, lore the party could learn. Players see this only when the
              Player Notes section is unlocked (Named) or the reveal level is Full.
            </p>
            <textarea
              value={data.playerNotes ?? ''}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateAndSave('playerNotes', e.target.value)}
              placeholder="What the players might discover about this creature..."
              className="w-full min-h-[80px] bg-muted/50 rounded-lg p-3 text-sm outline-none focus:ring-1 focus:ring-ring resize-y"
            />
          </Section>

          {/* ---- Wiki link (GM only) ---- */}
          <Section title="Wiki" subtle>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={data.wikiPageId ?? 'none'}
                onValueChange={(v: string) => updateAndSave('wikiPageId', v === 'none' ? null : v)}
              >
                <SelectTrigger className="w-[220px] h-8 text-sm"><SelectValue placeholder="No linked page" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No linked page</SelectItem>
                  {(wikiPages ?? []).map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.title ?? 'Untitled'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {wikiTitle && (
                <Button variant="link" size="sm" className="px-1" onClick={() => router.push(`/campaign/${campaignId}?tab=world`)}>
                  <BookOpen className="w-3.5 h-3.5 mr-1" /> {wikiTitle}
                </Button>
              )}
            </div>
          </Section>
        </FadeIn>
      </div>
    </div>
  );
}

// Runic styling for server-scrambled filler (the real text never reaches the client).
const RUNIC = 'tracking-[0.25em] text-muted-foreground/70';

/**
 * Renders a value from a player-visible section. Locked sections arrive from
 * the server as runic filler, but this is a defensive second layer: a number
 * must NEVER render as digits inside a locked section (locked numbers are
 * filler server-side, so a digit here would mean something leaked — show
 * runes instead).
 */
function PVal({ value, isLocked }: { value: unknown; isLocked: boolean }) {
  if (value == null || value === '') return <span className="text-muted-foreground">?</span>;
  if (isLocked && typeof value === 'number') return <span className={RUNIC}>ᚱᚢ</span>;
  return <span className={isLocked ? RUNIC : ''}>{String(value)}</span>;
}

function PlayerCard({ data, onBack }: { data: any; onBack: () => void }) {
  const router = useRouter();
  const level: string = data?.revealLevel ?? 'unknown';
  const unlocked: string[] = Array.isArray(data?.unlockedSections) ? data.unlockedSections : [];
  const locked = (s: string) => !unlocked.includes(s);
  const unknown = level === 'unknown';
  const nameLocked = !(level === 'full' || unlocked.includes('name'));

  const defense = data?.defense ?? {};
  const offense = data?.offense ?? {};
  const statistics = data?.statistics ?? {};
  const special = data?.specialAbilities?.specialAbilities ?? [];
  const notes = data?.playerNotes?.playerNotes ?? '';
  const lDefense = locked('defense');
  const lOffense = locked('offense');
  const lStats = locked('statistics');

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-4">
          <ChevronRight className="w-4 h-4 rotate-180 mr-1" /> Back to Bestiary
        </Button>
        <FadeIn>
          {/* identity card — name is runic unless unlocked; other identity fields
              stay runic until "full" (server-scrambled) */}
          <div className="bg-card rounded-lg border border-border p-8 text-center mb-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
            {data.portraitUrl ? (
              <img src={data.portraitUrl} alt="" className="w-32 h-32 rounded-lg object-cover mx-auto mb-4 border border-border" />
            ) : (
              <div className="w-32 h-32 rounded-lg bg-muted flex items-center justify-center mx-auto mb-4">
                <BookOpen className="w-10 h-10 text-muted-foreground" />
              </div>
            )}
            <h1 className={`font-display text-3xl font-bold tracking-tight ${nameLocked ? RUNIC : ''}`}>{data.name ?? '???'}</h1>
            <p className={`text-muted-foreground mt-1 ${level !== 'full' ? RUNIC : ''}`}>
              {data.size}{data.type ? ` ${data.type}` : ''}{data.subtype ? ` (${data.subtype})` : ''}
            </p>
            <div className="mt-3 flex items-center justify-center gap-2">
              <Badge variant={data.isNpc ? 'secondary' : 'outline'}>{data.isNpc ? 'NPC' : 'Monster'}</Badge>
              {unknown && <Badge variant="outline">Unidentified</Badge>}
            </div>
            {data.cr && <p className={`text-xs text-muted-foreground mt-2 ${level !== 'full' ? RUNIC : ''}`}>Challenge {data.cr}</p>}
          </div>

          {/* Sections render at every visible level (unknown included);
              locked ones show runic filler, never real data. */}
          <PlayerSection title="Defense" locked={lDefense}>
            <div className="grid grid-cols-3 gap-3 text-center">
              <Stat label="AC" value={<PVal value={defense.acTotal} isLocked={lDefense} />} mono />
              <Stat label="HP" value={<><PVal value={defense.hpCurrent} isLocked={lDefense} />/<PVal value={defense.hpMax} isLocked={lDefense} /></>} mono />
              <Stat label="Fort / Ref / Will" value={<><PVal value={defense.fort} isLocked={lDefense} />/<PVal value={defense.ref} isLocked={lDefense} />/<PVal value={defense.will} isLocked={lDefense} /></>} mono />
            </div>
            {defense.hitDice ? <p className="text-xs text-muted-foreground mt-2 text-center">Hit Dice {defense.hitDice}</p> : null}
          </PlayerSection>

          <PlayerSection title="Offense" locked={lOffense}>
            <p className="text-sm mb-2">Speed <PVal value={offense.speed} isLocked={lOffense} /> ft.</p>
                {(offense.attacks ?? []).map((a: any, i: number) => (
                  <div key={i} className="text-sm py-1 border-b border-border/50 last:border-0">
                    <span className="font-semibold">{a?.name}</span>
                    {a?.bonus ? <span className="font-mono text-muted-foreground"> {a.bonus}</span> : null}
                    {a?.damage ? <span className="text-muted-foreground"> — {a.damage}{a?.critical ? ` (${a.critical})` : ''}</span> : null}
                  </div>
                ))}
                {(offense.spells?.known ?? []).length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Spells</p>
                    {(offense.spells.known ?? []).map((s: any, i: number) => (
                      <p key={i} className="text-sm">{s?.name}{s?.level ? <span className="text-muted-foreground"> ({s.level})</span> : null}</p>
                    ))}
                  </div>
                )}
              </PlayerSection>

              <PlayerSection title="Statistics" locked={lStats}>
                <div className="grid grid-cols-6 gap-1 text-center mb-3">
                  {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((ab) => (
                    <div key={ab}>
                      <div className="text-[10px] uppercase text-muted-foreground">{ab}</div>
                      <div className="font-mono font-semibold"><PVal value={statistics[ab]} isLocked={lStats} /></div>
                      <div className="text-[10px] font-mono text-muted-foreground">
                        {lStats
                          ? <span className={RUNIC}>ᚱᚢ</span>
                          : abilityMod(typeof statistics[ab] === 'number' ? statistics[ab] : null)}
                      </div>
                    </div>
                  ))}
                </div>
                {(statistics.feats ?? []).length > 0 && (
                  <p className="text-sm"><span className="text-muted-foreground">Feats: </span>{(statistics.feats ?? []).map((f: any) => f?.name).filter(Boolean).join(', ')}</p>
                )}
                {(statistics.skills ?? []).length > 0 && (
                  <p className="text-sm"><span className="text-muted-foreground">Skills: </span>{(statistics.skills ?? []).map((s: any) => `${s?.name ?? ''} ${s?.bonus ?? ''}`.trim()).filter(Boolean).join(', ')}</p>
                )}
                {(statistics.gear ?? []).length > 0 && (
                  <p className="text-sm"><span className="text-muted-foreground">Gear: </span>{(statistics.gear ?? []).map((g: any) => g?.name).filter(Boolean).join(', ')}</p>
                )}
            </PlayerSection>

            <PlayerSection title="Special Abilities" locked={locked('specialAbilities')}>
              {special.length === 0 && <p className="text-sm text-muted-foreground">None recorded.</p>}
              {special.map((a: any, i: number) => (
                <div key={i} className="mb-2">
                  <p className="text-sm font-semibold">{a?.name}</p>
                  {a?.description ? <p className="text-sm text-muted-foreground">{a.description}</p> : null}
                </div>
              ))}
            </PlayerSection>

            <PlayerSection title="Player Notes" locked={locked('playerNotes')}>
              {notes
                ? <p className="text-sm whitespace-pre-wrap">{notes}</p>
                : <p className={`text-sm ${RUNIC}`}>ᚱᚢᚾᛖᛊ ᚾᛟᛏ ᚤᛖᛏ ᚱᛖᚢᛖᚨᛚᛖᛞ</p>}
            </PlayerSection>

            {data?.wikiPage?.title ? (
              <div className="text-center mt-2">
                <Button variant="link" size="sm" onClick={() => router.push(`/campaign/${data.campaignId}?tab=world`)}>
                  <BookOpen className="w-3.5 h-3.5 mr-1" /> {data.wikiPage.title}
                </Button>
              </div>
            ) : null}
        </FadeIn>
      </div>
    </div>
  );
}

function PlayerSection({ title, locked, children }: { title: string; locked: boolean; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-lg border border-border p-5 mb-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <h3 className="font-display text-sm font-bold uppercase tracking-widest text-primary border-b border-border pb-2 mb-4 flex items-center justify-between">
        {title}
        {locked && (
          <span className="flex items-center gap-1 text-[10px] font-sans font-normal tracking-normal text-muted-foreground">
            <Lock className="w-3 h-3" /> sealed
          </span>
        )}
      </h3>
      <div className={locked ? RUNIC : ''}>{children}</div>
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={`font-semibold ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}

function Section({ title, children, subtle }: { title: string; children: React.ReactNode; subtle?: boolean }) {
  return (
    <div className={`bg-card rounded-lg border border-border p-5 mb-4 ${subtle ? 'border-dashed' : ''}`} style={{ boxShadow: 'var(--shadow-sm)' }}>
      <h3 className="font-display text-sm font-bold uppercase tracking-widest text-primary border-b border-border pb-2 mb-4">{title}</h3>
      {children}
    </div>
  );
}

function TextField({ label, value, onChange, placeholder, mono }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean;
}) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</label>
      <Input value={value} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)} placeholder={placeholder} className={`h-8 mt-0.5 text-sm ${mono ? 'font-mono' : ''}`} />
    </div>
  );
}

function NumField({ label, value, onChange, signed }: {
  label: string; value: number | null | undefined; onChange: (v: string) => void; signed?: boolean;
}) {
  // type="number" inputs reject a leading "+", so show the sign in the label instead.
  const sign = signed && typeof value === 'number' ? ` (${value >= 0 ? '+' : ''}${value})` : '';
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}{sign}</label>
      <Input
        type="number"
        value={value ?? ''}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        className="h-8 mt-0.5 text-sm font-mono text-center"
      />
    </div>
  );
}

interface EditorColumn {
  key: string;
  label: string;
  placeholder?: string;
  className?: string;
  mono?: boolean;
}

function EntryEditor({ items, columns, onEdit, onAdd, onRemove, addLabel, notesKey, textarea }: {
  items: any[];
  columns: EditorColumn[];
  onEdit: (index: number, key: string, value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  addLabel: string;
  notesKey?: string;
  textarea?: boolean;
}) {
  return (
    <div className="space-y-2">
      {(items ?? []).map((item: any, i: number) => (
        <div key={i} className="p-2.5 bg-muted/50 rounded-lg">
          <div className="flex gap-2 items-center">
            {columns.map((col) => (
              <div key={col.key} className={col.className ?? 'flex-1'}>
                <Input
                  value={item?.[col.key] ?? ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => onEdit(i, col.key, e.target.value)}
                  placeholder={col.placeholder ?? col.label}
                  className={`h-7 text-xs ${col.mono ? 'font-mono' : ''}`}
                />
              </div>
            ))}
            <Button variant="ghost" size="icon-sm" className="h-7 w-7 shrink-0" onClick={() => onRemove(i)} title="Remove">
              <Trash2 className="w-3.5 h-3.5 text-destructive" />
            </Button>
          </div>
          {notesKey && (
            textarea ? (
              <textarea
                value={item?.[notesKey] ?? ''}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onEdit(i, notesKey, e.target.value)}
                placeholder="Description..."
                className="w-full bg-transparent text-xs text-muted-foreground resize-none min-h-[36px] outline-none mt-1.5 px-1"
              />
            ) : (
              <Input
                value={item?.[notesKey] ?? ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => onEdit(i, notesKey, e.target.value)}
                placeholder="Notes..."
                className="h-7 text-xs mt-1.5 bg-transparent border-transparent hover:border-input focus:border-input"
              />
            )
          )}
        </div>
      ))}
      <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onAdd}>
        <Plus className="w-3.5 h-3.5 mr-1" /> {addLabel}
      </Button>
    </div>
  );
}
