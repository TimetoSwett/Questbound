'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Castle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface TownSummary {
  id: string;
  name: string;
  size: string;
  population: number | string | null;
  revealLevel: string;
  residentCount: number;
  placeCount: number;
}

const LEVEL_LABEL: Record<string, string> = { hidden: 'Hidden', unknown: 'Unknown', named: 'Named', full: 'Full' };

export function TownsTab({ campaignId, role }: { campaignId: string; role: string }) {
  const router = useRouter();
  const isDM = role === 'dm';
  const [towns, setTowns] = useState<TownSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');

  const fetchTowns = useCallback(async () => {
    const res = await fetch(`/api/towns?campaignId=${campaignId}`);
    return res.ok ? ((await res.json()) ?? []) as TownSummary[] : null;
  }, [campaignId]);

  useEffect(() => {
    let active = true;
    fetchTowns()
      .then((data) => { if (active && data) setTowns(data); })
      .catch(() => { /* ignore */ })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fetchTowns]);

  const createTown = async () => {
    const name = newName.trim();
    if (!name) return;
    const res = await fetch('/api/towns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId, name }),
    });
    if (!res.ok) { toast.error('Could not create town'); return; }
    const town = await res.json();
    router.push(`/campaign/${campaignId}/towns/${town.id}`);
  };

  return (
    <div className="space-y-4">
      {isDM && (
        <div className="flex gap-2">
          <Input placeholder="New town name" value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') createTown(); }} />
          <Button onClick={createTown} disabled={!newName.trim()}><Plus className="w-4 h-4 mr-1" />Add Town</Button>
        </div>
      )}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading towns…</p>
      ) : towns.length === 0 ? (
        <p className="text-sm text-muted-foreground">No towns yet.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {towns.map((t) => (
            <button key={t.id} type="button" onClick={() => router.push(`/campaign/${campaignId}/towns/${t.id}`)}
              className="text-left rounded-lg border border-border p-3 hover:bg-muted/50 flex items-start gap-3">
              <Castle className="w-5 h-5 mt-0.5 text-primary shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{t.name}</div>
                <div className="text-xs text-muted-foreground">
                  {t.size}{t.population != null ? ` · pop. ${t.population}` : ''}
                  {` · ${t.residentCount} residents · ${t.placeCount} places`}
                </div>
              </div>
              {isDM && <Badge variant="outline">{LEVEL_LABEL[t.revealLevel] ?? t.revealLevel}</Badge>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
