'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { CAMPAIGN_SYSTEMS, campaignSystemLabel, isCampaignSystem, type CampaignSystem } from '@/lib/campaign-system';
import { readRulesSystem, serverRulesSystem, setRulesSystem, subscribeRulesSystem } from '@/lib/rules-preference';

export { setRulesSystem };

export function useRulesSystem(): CampaignSystem {
  return useSyncExternalStore(subscribeRulesSystem, readRulesSystem, serverRulesSystem);
}

const OPTION_LABEL: Record<CampaignSystem, string> = {
  pf1e: 'Pathfinder',
  cyberpunk2020: 'Cyberpunk 2020',
};

/** Header control. Persists in localStorage and defaults to Pathfinder. */
export function RulesSystemToggle({ className }: { className?: string }) {
  const system = useRulesSystem();
  return (
    <div
      role="radiogroup"
      aria-label="Rules system"
      className={`inline-flex shrink-0 items-center rounded-md border border-border bg-card p-0.5 ${className ?? ''}`}
    >
      {CAMPAIGN_SYSTEMS.map((option) => {
        const selected = system === option;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            title={campaignSystemLabel(option)}
            onClick={() => setRulesSystem(option)}
            className={`rounded px-2 py-1 text-xs font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              selected ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted'
            }`}
          >
            {OPTION_LABEL[option]}
          </button>
        );
      })}
    </div>
  );
}

/** Snap the header toggle to a campaign's system when that campaign is opened. */
export function SyncRulesSystem({ system }: { system: string }) {
  useEffect(() => {
    if (isCampaignSystem(system)) setRulesSystem(system);
  }, [system]);
  return null;
}
