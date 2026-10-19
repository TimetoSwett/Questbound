'use client';

import { useCallback, useEffect, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

// GM-only grid of per-player Bestiary unlocks for one creature. Each player
// sees only what they unlocked; the "Whole party" row grants or revokes a
// section for every player without touching their other unlocks.

const SECTIONS = [
  { key: 'name', label: 'Name' },
  { key: 'defense', label: 'Defense' },
  { key: 'offense', label: 'Offense' },
  { key: 'statistics', label: 'Stats' },
  { key: 'specialAbilities', label: 'Special' },
  { key: 'playerNotes', label: 'Notes' },
  { key: 'wiki', label: 'Wiki' },
] as const;

type PlayerUnlock = { userId: string; displayName: string; sections: string[]; full: boolean };
type Update = { userIds: string[]; sections?: string[]; grant?: string[]; revoke?: string[]; full?: boolean };

export function PlayerUnlocks({ creatureId, hidden }: { creatureId: string; hidden: boolean }) {
  const [players, setPlayers] = useState<PlayerUnlock[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/creatures/${creatureId}/reveals`)
      .then(async (res) => { if (active && res.ok) setPlayers((await res.json()).players ?? []); })
      .catch(() => { /* ignore */ });
    return () => { active = false; };
  }, [creatureId]);

  const send = useCallback(async (update: Update) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/creatures/${creatureId}/reveals`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      });
      if (!res.ok) { toast.error('Could not update unlocks'); return; }
      setPlayers((await res.json()).players ?? []);
    } catch {
      toast.error('Could not update unlocks');
    } finally {
      setBusy(false);
    }
  }, [creatureId]);

  if (!players) return <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">Loading player unlocks...</p>;
  if (players.length === 0) {
    return <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">No players in this campaign yet, so there is nothing to unlock.</p>;
  }

  const has = (p: PlayerUnlock, key: string) => p.full || p.sections.includes(key);
  const everyone = players.map((p) => p.userId);
  const partyState = (pred: (p: PlayerUnlock) => boolean): boolean | 'indeterminate' => {
    const n = players.filter(pred).length;
    return n === 0 ? false : n === players.length ? true : 'indeterminate';
  };

  return (
    <div className="mt-3 pt-3 border-t border-border">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Player unlocks</p>
      <p className="text-xs text-muted-foreground mb-2">
        Each player only sees what they unlocked (e.g. from their own Knowledge roll).
        {hidden && ' This creature is hidden, so no one sees it until you set Reveal to Visible.'}
      </p>
      <div className="overflow-x-auto -mx-1">
        <table className="text-xs min-w-full">
          <thead>
            <tr className="text-muted-foreground">
              <th className="text-left font-medium px-1 py-1">Player</th>
              {SECTIONS.map((s) => <th key={s.key} className="font-medium px-1.5 py-1">{s.label}</th>)}
              <th className="font-medium px-1.5 py-1">All</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border">
              <td className="px-1 py-1.5 italic text-muted-foreground whitespace-nowrap">Whole party</td>
              {SECTIONS.map((s) => {
                const state = partyState((p) => has(p, s.key));
                return (
                  <td key={s.key} className="text-center px-1.5">
                    <Checkbox
                      aria-label={`${s.label} for the whole party`}
                      checked={state}
                      disabled={busy}
                      onCheckedChange={() => void send(state === true ? { userIds: everyone, revoke: [s.key] } : { userIds: everyone, grant: [s.key] })}
                    />
                  </td>
                );
              })}
              <td className="text-center px-1.5">
                <Checkbox
                  aria-label="Everything for the whole party"
                  checked={partyState((p) => p.full)}
                  disabled={busy}
                  onCheckedChange={() => {
                    const all = players.every((p) => p.full);
                    void send({ userIds: everyone, full: !all });
                  }}
                />
              </td>
            </tr>
            {players.map((p) => (
              <tr key={p.userId}>
                <td className="px-1 py-1.5 whitespace-nowrap max-w-[10rem] truncate">{p.displayName}</td>
                {SECTIONS.map((s) => (
                  <td key={s.key} className="text-center px-1.5">
                    <Checkbox
                      aria-label={`${s.label} for ${p.displayName}`}
                      checked={has(p, s.key)}
                      disabled={busy}
                      onCheckedChange={() => void send(has(p, s.key) ? { userIds: [p.userId], revoke: [s.key] } : { userIds: [p.userId], grant: [s.key] })}
                    />
                  </td>
                ))}
                <td className="text-center px-1.5">
                  <Checkbox
                    aria-label={`Everything for ${p.displayName}`}
                    checked={p.full}
                    disabled={busy}
                    onCheckedChange={() => void send({ userIds: [p.userId], full: !p.full })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground mt-1">All = everything, including type, size, CR and alignment.</p>
    </div>
  );
}
