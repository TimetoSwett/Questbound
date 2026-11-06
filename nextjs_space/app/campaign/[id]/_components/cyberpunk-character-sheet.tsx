'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  CYBERPUNK_STATS,
  defaultCyberpunkSheet,
  readCyberpunkSheet,
  type CyberpunkSheet,
  type CyberpunkSkillStat,
  type CyberpunkStat,
} from '@/lib/cyberpunk-sheet';

function parseStatInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '-' || trimmed === '+') return 0;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}

function saveCyberpunk(characterId: string, nextName: string, nextSheet: CyberpunkSheet, keepalive = false) {
  return fetch('/api/characters', {
    method: 'PUT',
    keepalive,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: characterId, name: nextName, cyberpunk: nextSheet }),
  });
}

export function CyberpunkCharacterSheet({ characterId, editable = true }: { characterId: string; editable?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [name, setName] = useState('');
  const [sheet, setSheet] = useState<CyberpunkSheet>(defaultCyberpunkSheet);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [activeId, setActiveId] = useState(characterId);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const payloadRef = useRef<{ name: string; sheet: CyberpunkSheet }>({ name: '', sheet: defaultCyberpunkSheet() });
  const editableRef = useRef(editable);

  if (activeId !== characterId) {
    setActiveId(characterId);
    setLoading(true);
    setMissing(false);
    setStatus('idle');
    setName('');
    setSheet(defaultCyberpunkSheet());
  }

  useEffect(() => {
    editableRef.current = editable;
  }, [editable]);

  useEffect(() => {
    let active = true;
    fetch(`/api/characters/single?id=${characterId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active) return;
        if (!data) {
          setMissing(true);
          return;
        }
        const nextName = typeof data.name === 'string' ? data.name : '';
        const nextSheet = readCyberpunkSheet(data.cyberpunk);
        payloadRef.current = { name: nextName, sheet: nextSheet };
        setName(nextName);
        setSheet(nextSheet);
      })
      .catch(() => { if (active) setMissing(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => {
      active = false;
      if (!saveTimer.current) return;
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      if (!editableRef.current) return;
      const pending = payloadRef.current;
      void saveCyberpunk(characterId, pending.name, pending.sheet, true);
    };
  }, [characterId]);

  const persist = useCallback(async (nextName: string, nextSheet: CyberpunkSheet) => {
    if (!editableRef.current) return;
    setStatus('saving');
    try {
      const res = await saveCyberpunk(characterId, nextName, nextSheet);
      if (!res.ok) {
        setStatus('error');
        toast.error('Save failed');
        return;
      }
      setStatus('saved');
    } catch {
      setStatus('error');
      toast.error('Save error');
    }
  }, [characterId]);

  const scheduleSave = useCallback((nextName: string, nextSheet: CyberpunkSheet) => {
    payloadRef.current = { name: nextName, sheet: nextSheet };
    if (!editableRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      const current = payloadRef.current;
      void persist(current.name, current.sheet);
    }, 600);
  }, [persist]);

  const editSheet = (next: CyberpunkSheet) => {
    setSheet(next);
    scheduleSave(name, next);
  };

  const setStat = (stat: CyberpunkStat, raw: string) => {
    const value = parseStatInput(raw);
    if (value === null) return;
    editSheet({ ...sheet, stats: { ...sheet.stats, [stat]: value } });
  };

  const updateSkill = (index: number, patch: Partial<CyberpunkSheet['skills'][number]>) => {
    editSheet({
      ...sheet,
      skills: sheet.skills.map((skill, i) => (i === index ? { ...skill, ...patch } : skill)),
    });
  };

  if (loading) {
    return <p className="py-10 text-center text-muted-foreground">Loading sheet...</p>;
  }
  if (missing) {
    return <p className="py-10 text-center text-muted-foreground">Couldn&apos;t load this character.</p>;
  }

  const statusLabel = status === 'saving' ? 'Saving...' : status === 'saved' ? 'Saved' : status === 'error' ? 'Not saved' : editable ? '' : 'View only';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Cyberpunk 2020</p>
          <Label htmlFor="cp-name" className="mt-2 block">Character name</Label>
          <Input
            id="cp-name"
            value={name}
            disabled={!editable}
            placeholder="Unnamed"
            className="mt-1 font-display text-lg"
            onChange={(e) => {
              const nextName = e.target.value;
              setName(nextName);
              scheduleSave(nextName, sheet);
            }}
          />
        </div>
        <p className="pt-6 text-xs text-muted-foreground" aria-live="polite">{statusLabel}</p>
      </div>

      <section className="rounded-lg border border-border bg-card p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <Label htmlFor="cp-role">Role</Label>
        <Input
          id="cp-role"
          value={sheet.role}
          disabled={!editable}
          placeholder="Solo, Netrunner, Rocker..."
          className="mt-1"
          onChange={(e) => editSheet({ ...sheet, role: e.target.value })}
        />
      </section>

      <section className="rounded-lg border border-border bg-card p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <h3 className="font-display text-lg font-semibold">Stats</h3>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-9">
          {CYBERPUNK_STATS.map((stat) => (
            <div key={stat}>
              <Label htmlFor={`cp-stat-${stat}`} className="font-mono text-xs">{stat}</Label>
              <Input
                id={`cp-stat-${stat}`}
                type="number"
                inputMode="numeric"
                value={sheet.stats[stat] ?? ''}
                disabled={!editable}
                className="mt-1 px-2 text-center font-mono"
                onChange={(e) => setStat(stat, e.target.value)}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-lg font-semibold">Skills</h3>
          {editable && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => editSheet({ ...sheet, skills: [...sheet.skills, { name: '', stat: 'REF', value: 0, chipped: false }] })}
            >
              <Plus className="mr-1 h-4 w-4" /> Add skill
            </Button>
          )}
        </div>
        {sheet.skills.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No skills yet. Add one to track a name, linked stat, and value.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {sheet.skills.map((skill, index) => (
              <li key={index} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_7rem_5rem_auto]">
                <div>
                  <Label htmlFor={`cp-skill-name-${index}`} className="text-xs">Name</Label>
                  <Input
                    id={`cp-skill-name-${index}`}
                    value={skill.name}
                    disabled={!editable}
                    placeholder="Skill"
                    className="mt-1"
                    onChange={(e) => updateSkill(index, { name: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor={`cp-skill-stat-${index}`} className="text-xs">Stat</Label>
                  <select
                    id={`cp-skill-stat-${index}`}
                    value={skill.stat}
                    disabled={!editable}
                    className="mt-1 flex h-10 w-full rounded-lg border border-input bg-background px-2 text-sm font-mono disabled:cursor-not-allowed disabled:opacity-50"
                    onChange={(e) => updateSkill(index, { stat: e.target.value as CyberpunkSkillStat })}
                  >
                    {!(CYBERPUNK_STATS as readonly string[]).includes(skill.stat) && (
                      <option value={skill.stat}>{skill.stat}</option>
                    )}
                    {CYBERPUNK_STATS.map((stat) => (
                      <option key={stat} value={stat}>{stat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor={`cp-skill-value-${index}`} className="text-xs">Value</Label>
                  <Input
                    id={`cp-skill-value-${index}`}
                    type="number"
                    inputMode="numeric"
                    value={skill.value ?? ''}
                    disabled={!editable}
                    className="mt-1 font-mono"
                    onChange={(e) => {
                      const value = parseStatInput(e.target.value);
                      if (value === null) return;
                      updateSkill(index, { value });
                    }}
                  />
                </div>
                {editable && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="mb-1"
                    aria-label={`Remove ${skill.name || 'skill'}`}
                    onClick={() => editSheet({ ...sheet, skills: sheet.skills.filter((_, i) => i !== index) })}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
