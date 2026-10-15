'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Drama, ChevronRight, ArrowUpFromLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { FadeIn, Stagger, StaggerItem, HoverLift } from '@/components/ui/animate';
import { CharacterSheet } from './character-sheet';
import { CompanionNavProvider } from '@/components/characters/companion-nav';

interface NpcSummary {
  id: string;
  name: string;
  type: string;
  subtype: string;
  size: string;
  cr: string;
  hpMax: number;
  hpCurrent: number;
  isNpc: boolean;
  revealLevel: string;
  portraitUrl?: string;
}

const LEVEL_LABEL: Record<string, string> = { hidden: 'Hidden', unknown: 'Unknown', named: 'Named', full: 'Full' };

// GM-only. Lists Bestiary creatures flagged as NPCs. Hidden NPCs are fine here:
// this tab never renders for players.
export function NpcsTab({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [npcs, setNpcs] = useState<NpcSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
  const [upgradingId, setUpgradingId] = useState<string | null>(null);

  const request = useCallback(async () => {
    const res = await fetch(`/api/creatures?campaignId=${campaignId}`);
    return res.ok ? (await res.json() ?? []) : null;
  }, [campaignId]);

  const applyResult = useCallback((result: NpcSummary[] | null) => {
    if (result) setNpcs(result.filter((c) => c.isNpc));
  }, []);

  const load = useCallback(async () => {
    try { applyResult(await request()); } catch { /* ignore */ } finally { setLoading(false); }
  }, [request, applyResult]);

  useEffect(() => {
    let active = true;
    request().then((result) => {
      if (active) applyResult(result);
    }).catch(() => { /* ignore */ }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [request, applyResult]);

  const openNpc = (id: string) => router.push(`/campaign/${campaignId}/bestiary/${id}?from=npcs`);

  const createNpc = async () => {
    const res = await fetch('/api/creatures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // revealLevel defaults to hidden server-side; the GM reveals it later.
      body: JSON.stringify({ campaignId, name: 'New NPC', isNpc: true }),
    });
    if (res.ok) {
      const c = await res.json();
      toast.success('NPC created!');
      openNpc(c.id);
    } else {
      toast.error('Could not create NPC');
    }
  };

  const createAdventurer = async () => {
    const res = await fetch('/api/characters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId, name: 'New Character' }),
    });
    if (res.ok) {
      const ch = await res.json();
      toast.success('Adventurer created!');
      setSelectedCharId(ch.id);
    } else {
      toast.error('Could not create adventurer');
    }
  };

  const upgradeToAdventurer = async (id: string, name: string) => {
    if (!confirm(`Create an adventurer sheet from ${name}? The NPC stays in the Bestiary.`)) return;
    setUpgradingId(id);
    try {
      const res = await fetch('/api/characters/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creatureId: id }),
      });
      if (res.ok) {
        const ch = await res.json();
        toast.success(ch.alreadyUpgraded ? `${name} already has an adventurer sheet` : `${name} is now an adventurer too!`);
        router.push(`/campaign/${campaignId}?tab=characters&character=${ch.id}`);
      } else {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? 'Could not upgrade NPC');
      }
    } finally {
      setUpgradingId(null);
    }
  };

  if (selectedCharId) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-4">
        <Button variant="ghost" size="sm" onClick={() => { setSelectedCharId(null); load(); }} className="mb-4">
          <ChevronRight className="w-4 h-4 rotate-180 mr-1" /> Back to NPCs
        </Button>
        <CompanionNavProvider onOpen={setSelectedCharId}>
          <CharacterSheet key={selectedCharId} characterId={selectedCharId} editable={true} />
        </CompanionNavProvider>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <FadeIn>
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">
            <Drama className="w-6 h-6 text-primary" />
            NPCs
          </h2>
          <div className="flex gap-2">
            <Button variant="outline" onClick={createNpc}><Plus className="w-4 h-4 mr-1" /> Create NPC</Button>
            <Button onClick={createAdventurer}><Plus className="w-4 h-4 mr-1" /> Create Adventurer</Button>
          </div>
        </div>
      </FadeIn>

      {loading ? (
        <p className="text-muted-foreground py-10 text-center">Loading NPCs...</p>
      ) : npcs.length === 0 ? (
        <FadeIn>
          <div className="text-center py-16">
            <Drama className="w-14 h-14 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No NPCs yet. Create one to get started!</p>
          </div>
        </FadeIn>
      ) : (
        <Stagger staggerDelay={0.06}>
          <div className="grid gap-3">
            {npcs.map((c) => (
              <StaggerItem key={c.id}>
                <HoverLift>
                  <div
                    className="flex items-center gap-3 bg-card p-4 rounded-lg border border-border hover:border-primary/30 transition-colors cursor-pointer"
                    style={{ boxShadow: 'var(--shadow-sm)' }}
                    onClick={() => openNpc(c.id)}
                  >
                    {c.portraitUrl ? (
                      <img src={c.portraitUrl} alt={c.name} className="w-12 h-12 rounded-md object-cover shrink-0 border border-border" />
                    ) : (
                      <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center shrink-0">
                        <Drama className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-display font-semibold truncate">{c.name ?? 'Unnamed'}</h3>
                      <p className="text-sm text-muted-foreground truncate">
                        {c.size}{c.type ? ` ${c.type}` : ''}{c.subtype ? ` (${c.subtype})` : ''}{c.cr ? ` • CR ${c.cr}` : ''}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">NPC</Badge>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {LEVEL_LABEL[c.revealLevel ?? 'hidden'] ?? c.revealLevel ?? 'Hidden'}
                        </Badge>
                      </div>
                    </div>
                    {typeof c.hpMax === 'number' && (
                      <div className="text-right shrink-0 hidden sm:block">
                        <p className="text-sm font-mono"><span className="text-green-700">{c.hpCurrent ?? 0}</span>/{c.hpMax ?? 0} HP</p>
                      </div>
                    )}
                    <Button
                      variant="outline" size="sm"
                      disabled={upgradingId === c.id}
                      onClick={(e: React.MouseEvent) => { e.stopPropagation(); upgradeToAdventurer(c.id, c.name); }}
                      title="Create a character sheet prefilled from this NPC's stats"
                    >
                      <ArrowUpFromLine className="w-4 h-4 mr-1" />
                      {upgradingId === c.id ? 'Upgrading...' : 'Upgrade to Adventurer'}
                    </Button>
                  </div>
                </HoverLift>
              </StaggerItem>
            ))}
          </div>
        </Stagger>
      )}
    </div>
  );
}
