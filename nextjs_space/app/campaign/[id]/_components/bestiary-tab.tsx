'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Copy, Trash2, Search, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { CreatureImportDialog } from './creature-import-dialog';
import { FadeIn, Stagger, StaggerItem, HoverLift } from '@/components/ui/animate';

interface CreatureSummary {
  id: string;
  name: string;
  type: string;
  subtype: string;
  size: string;
  cr: string;
  isNpc: boolean;
  portraitUrl?: string | null;
  revealLevel?: string;
  unlockedSections?: string[];
  hpMax?: number;
  hpCurrent?: number;
}

/** Numeric value of a CR string like "1/2", "1/3", "2" for sorting. */
/** Numeric value of a CR string like "1/2", "1/3", "2" for sorting. */
function crValue(cr: string): number {
  const s = (cr ?? '').trim();
  if (!s) return -1;
  if (s.includes('/')) {
    const [n, d] = s.split('/').map(Number);
    if (d) return n / d;
  }
  const v = Number(s);
  return Number.isFinite(v) ? v : 999;
}

const LEVEL_LABEL: Record<string, string> = { hidden: 'Hidden', unknown: 'Unknown', named: 'Named', full: 'Full' };
const LEVEL_CLASS: Record<string, string> = {
  hidden: 'text-muted-foreground',
  unknown: 'text-warning border-warning/40',
  named: 'text-accent border-accent/40',
  full: 'text-success border-success/40',
};

export function BestiaryTab({ campaignId, role }: { campaignId: string; role: string }) {
  const router = useRouter();
  const isDM = role === 'dm';
  const [creatures, setCreatures] = useState<CreatureSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [crFilter, setCrFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [kindFilter, setKindFilter] = useState<'all' | 'npc' | 'monster'>('all');

  const fetchCreatures = useCallback(async () => {
    const res = await fetch(`/api/creatures?campaignId=${campaignId}`);
    return res.ok ? ((await res.json()) ?? []) as CreatureSummary[] : null;
  }, [campaignId]);

  const load = useCallback(() => fetchCreatures()
    .then((data) => { if (data) setCreatures(data); })
    .catch(() => { /* ignore */ })
    .finally(() => setLoading(false)), [fetchCreatures]);

  useEffect(() => {
    let active = true;
    fetchCreatures()
      .then((data) => { if (active && data) setCreatures(data); })
      .catch(() => { /* ignore */ })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fetchCreatures]);

  const crOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of creatures ?? []) if (c.cr) set.add(c.cr);
    return [...set].sort((a, b) => crValue(a) - crValue(b));
  }, [creatures]);

  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of creatures ?? []) if (c.type) set.add(c.type);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [creatures]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (creatures ?? []).filter((c) => {
      if (q && !(c.name ?? '').toLowerCase().includes(q)) return false;
      if (crFilter !== 'all' && (c.cr ?? '') !== crFilter) return false;
      if (typeFilter !== 'all' && (c.type ?? '') !== typeFilter) return false;
      if (kindFilter === 'npc' && !c.isNpc) return false;
      if (kindFilter === 'monster' && c.isNpc) return false;
      return true;
    });
  }, [creatures, search, crFilter, typeFilter, kindFilter]);

  const openCreature = (id: string) => router.push(`/campaign/${campaignId}/bestiary/${id}`);

  const newCreature = async () => {
    const res = await fetch('/api/creatures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId, name: 'New Creature' }),
    });
    if (res.ok) {
      const c = await res.json();
      toast.success('Creature created!');
      openCreature(c.id);
    } else {
      toast.error('Could not create creature');
    }
  };

  const duplicateCreature = async (id: string, name: string) => {
    const res = await fetch('/api/creatures/duplicate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      toast.success(`Duplicated ${name}`);
      load();
    } else {
      toast.error('Could not duplicate creature');
    }
  };

  const deleteCreature = async (id: string, name: string) => {
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
    const res = await fetch(`/api/creatures?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('Creature deleted');
      load();
    } else {
      toast.error('Could not delete creature');
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <FadeIn>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-primary" />
            Bestiary &amp; NPCs
          </h2>
          {isDM && (
            <div className="flex gap-2"><CreatureImportDialog campaignId={campaignId} onCreated={openCreature} /><Button onClick={newCreature}><Plus className="w-4 h-4 mr-1" /> New</Button></div>
          )}
        </div>
      </FadeIn>

      {/* Search + filters */}
      <FadeIn>
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)} placeholder="Search by name..." className="pl-8" />
          </div>
          <Select value={crFilter} onValueChange={setCrFilter}>
            <SelectTrigger className="w-[110px]"><SelectValue placeholder="CR" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">CR: All</SelectItem>
              {crOptions.map((cr) => <SelectItem key={cr} value={cr}>CR {cr}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Type: All</SelectItem>
              {typeOptions.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={kindFilter} onValueChange={(v: string) => setKindFilter(v as 'all' | 'npc' | 'monster')}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Kind" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All kinds</SelectItem>
              <SelectItem value="npc">NPCs</SelectItem>
              <SelectItem value="monster">Monsters</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </FadeIn>

      {loading ? (
        <p className="text-muted-foreground py-10 text-center">Loading bestiary...</p>
      ) : filtered.length === 0 ? (
        <FadeIn>
          <div className="text-center py-16">
            <BookOpen className="w-14 h-14 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              {(creatures ?? []).length === 0
                ? (isDM ? 'No creatures yet. Create one to start your bestiary!' : 'The GM has not revealed any creatures yet.')
                : 'No creatures match these filters.'}
            </p>
          </div>
        </FadeIn>
      ) : (
        <Stagger staggerDelay={0.06}>
          <div className="grid gap-3">
            {filtered.map((c: CreatureSummary) => {
              // Players see runic filler for the name until it's unlocked (server-scrambled).
              const nameLocked = !isDM && c.revealLevel !== 'full'
                && !(c.unlockedSections ?? []).includes('name');
              return (
              <StaggerItem key={c.id}>
                <HoverLift>
                  <div
                    className="flex items-center gap-3 bg-card p-4 rounded-lg border border-border hover:border-primary/30 transition-colors cursor-pointer"
                    style={{ boxShadow: 'var(--shadow-sm)' }}
                    onClick={() => openCreature(c.id)}
                  >
                    {c.portraitUrl ? (
                      <img src={c.portraitUrl} alt={c.name} className="w-12 h-12 rounded-md object-cover shrink-0 border border-border" />
                    ) : (
                      <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center shrink-0">
                        <BookOpen className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-display font-semibold truncate ${nameLocked ? 'tracking-[0.2em] text-muted-foreground/70' : ''}`}>{c.name ?? 'Unnamed'}</h3>
                      <p className="text-sm text-muted-foreground truncate">
                        {c.size}{c.type ? ` ${c.type}` : ''}{c.subtype ? ` (${c.subtype})` : ''}{c.cr ? ` • CR ${c.cr}` : ''}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Badge variant={c.isNpc ? 'secondary' : 'outline'} className="text-[10px] px-1.5 py-0">
                          {c.isNpc ? 'NPC' : 'Monster'}
                        </Badge>
                        {isDM && (
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${LEVEL_CLASS[c.revealLevel ?? 'hidden'] ?? ''}`}>
                            {LEVEL_LABEL[c.revealLevel ?? 'hidden'] ?? c.revealLevel ?? 'Hidden'}
                          </Badge>
                        )}
                      </div>
                    </div>
                    {isDM && typeof c.hpMax === 'number' && (
                      <div className="text-right shrink-0 hidden sm:block">
                        <p className="text-sm font-mono"><span className="text-success">{c.hpCurrent ?? 0}</span>/{c.hpMax ?? 0} HP</p>
                      </div>
                    )}
                    {isDM && (
                      <div className="flex items-center shrink-0" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon-sm" title={`Duplicate ${c.name}`} onClick={() => duplicateCreature(c.id, c.name)}>
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon-sm" title={`Delete ${c.name}`} onClick={() => deleteCreature(c.id, c.name)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </div>
                </HoverLift>
              </StaggerItem>
              );
            })}
          </div>
        </Stagger>
      )}
    </div>
  );
}
