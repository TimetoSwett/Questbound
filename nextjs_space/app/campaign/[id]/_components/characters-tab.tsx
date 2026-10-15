'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Scroll, Trash2, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { FadeIn, Stagger, StaggerItem, HoverLift } from '@/components/ui/animate';
import { CharacterSheet } from './character-sheet';
import { CompanionNavProvider } from '@/components/characters/companion-nav';
import { groupCompanions } from '@/lib/companions';

interface CharSummary {
  id: string;
  name: string;
  race: string;
  classes: any;
  hpMax: number;
  hpCurrent: number;
  userId: string;
  ownerCharacterId?: string | null;
  companionType?: string;
  user?: { displayName: string };
}

export function CharactersTab({ campaignId, role, userId, initialCharacterId }: { campaignId: string; role: string; userId: string; initialCharacterId?: string }) {
  const [characters, setCharacters] = useState<CharSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialCharacterId ?? null);
  const [loading, setLoading] = useState(true);

  const request = useCallback(async () => {
    const res = await fetch(`/api/characters?campaignId=${campaignId}`);
    return res.ok ? (await res.json() ?? []) : null;
  }, [campaignId]);

  const applyResult = useCallback((result: CharSummary[] | null) => {
    if (result) setCharacters(result);
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

  const createChar = async () => {
    const res = await fetch('/api/characters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId, name: 'New Character' }),
    });
    if (res.ok) {
      const ch = await res.json();
      toast.success('Character created!');
      load();
      setSelectedId(ch.id);
    }
  };

  const deleteChar = async (id: string, name: string) => {
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
    const res = await fetch(`/api/characters?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('Character deleted');
      if (selectedId === id) setSelectedId(null);
      load();
    }
  };

  if (selectedId) {
    const ch = (characters ?? []).find((c: CharSummary) => c.id === selectedId);
    const isOwner = ch?.userId === userId;
    const canEdit = isOwner || role === 'dm';
    return (
      <div className="max-w-6xl mx-auto px-4 py-4">
        <Button variant="ghost" size="sm" onClick={() => { setSelectedId(null); load(); }} className="mb-4">
          <ChevronRight className="w-4 h-4 rotate-180 mr-1" /> Back to list
        </Button>
        <CompanionNavProvider onOpen={setSelectedId} onChanged={load}>
          <CharacterSheet key={selectedId} characterId={selectedId} editable={canEdit} />
        </CompanionNavProvider>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <FadeIn>
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">
            <Scroll className="w-6 h-6 text-primary" />
            {role === 'dm' ? 'All Characters' : 'Your Characters'}
          </h2>
          {role !== 'dm' && (
            <Button onClick={createChar}><Plus className="w-4 h-4 mr-1" /> New Character</Button>
          )}
          {role === 'dm' && (
            <Button onClick={createChar}><Plus className="w-4 h-4 mr-1" /> Create Adventurer</Button>
          )}
        </div>
      </FadeIn>

      {loading ? (
        <p className="text-muted-foreground py-10 text-center">Loading characters...</p>
      ) : (characters?.length ?? 0) === 0 ? (
        <FadeIn>
          <div className="text-center py-16">
            <Scroll className="w-14 h-14 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No characters yet. Create one to get started!</p>
          </div>
        </FadeIn>
      ) : (
        <Stagger staggerDelay={0.06}>
          <div className="grid gap-3">
            {groupCompanions(characters ?? []).map(({ item: ch, depth, isCompanion }) => {
              let classStr = '';
              try {
                const cls = typeof ch.classes === 'string' ? JSON.parse(ch.classes) : (ch.classes ?? []);
                classStr = (cls ?? []).map((c: any) => `${c?.name ?? '?'} ${c?.level ?? 0}`).join(' / ');
              } catch { classStr = ''; }
              const isOwner = ch.userId === userId;
              return (
                <StaggerItem key={ch.id}>
                  <HoverLift className={depth ? 'ml-6' : undefined}>
                    <div className="flex items-center gap-3 bg-card p-4 rounded-lg border border-border hover:border-primary/30 transition-colors cursor-pointer" style={{ boxShadow: 'var(--shadow-sm)' }} onClick={() => setSelectedId(ch.id)}>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-display font-semibold truncate">{ch.name ?? 'Unnamed'}{isCompanion && <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 align-middle text-xs font-normal text-muted-foreground">{ch.companionType || 'Companion'}</span>}</h3>
                        <p className="text-sm text-muted-foreground">{ch.race} {classStr ? `• ${classStr}` : ''}</p>
                        {role === 'dm' && <p className="text-xs text-muted-foreground mt-0.5">Player: {ch.user?.displayName ?? 'Unknown'}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-mono"><span className="text-success">{ch.hpCurrent ?? 0}</span>/{ch.hpMax ?? 0} HP</p>
                      </div>
                      {(isOwner || role === 'dm') && (
                        <Button variant="ghost" size="icon-sm" onClick={(e: React.MouseEvent) => { e.stopPropagation(); deleteChar(ch.id, ch.name); }}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
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
