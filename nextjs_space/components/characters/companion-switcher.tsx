'use client';

import { useCompanionNav } from './companion-nav';
import { useCompanions, type CompanionSummary } from './use-companions';

// Compact jump control: the owner (when visible) plus its visible companions.
// Renders nothing for a sheet with no visible owner or companions.
export function CompanionSwitcher({ characterId }: { characterId: string }) {
  const nav = useCompanionNav();
  const { data } = useCompanions(characterId);
  if (!data) return null;
  const { owner, companions, siblings } = data;
  const group: CompanionSummary[] = owner ? siblings : companions;
  if (!owner && group.length === 0) return null;

  const chip = (c: CompanionSummary, current: boolean, label?: string) => (
    <button
      key={c.id}
      type="button"
      disabled={current || !nav}
      onClick={() => nav?.onOpen(c.id)}
      className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
        current ? 'bg-primary text-primary-foreground border-transparent' : 'bg-card hover:border-primary/40 disabled:opacity-60'
      }`}
    >
      {label ?? c.name}{c.companionType && !label ? ` (${c.companionType})` : ''}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm" aria-label="Companion switcher">
      {owner && <span className="text-muted-foreground">Companion of</span>}
      {owner && chip(owner, false)}
      {owner && group.length > 0 && <span className="text-muted-foreground">·</span>}
      {!owner && <span className="text-muted-foreground">Companions:</span>}
      {group.map((c) => chip(c, c.id === characterId))}
    </div>
  );
}
