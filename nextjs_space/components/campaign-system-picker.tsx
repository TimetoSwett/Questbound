'use client';

import { useId } from 'react';
import { CAMPAIGN_SYSTEMS, campaignSystemLabel, type CampaignSystem } from '@/lib/campaign-system';

const SYSTEM_COPY: Record<CampaignSystem, { title: string; detail: string }> = {
  pf1e: { title: 'Pathfinder', detail: 'Pathfinder 1st edition' },
  cyberpunk2020: { title: 'Cyberpunk', detail: 'Cyberpunk 2020' },
};

export function CampaignSystemPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: CampaignSystem;
  onChange: (system: CampaignSystem) => void;
  disabled?: boolean;
}) {
  const labelId = useId();
  return (
    <div>
      <p id={labelId} className="text-sm font-medium">Rules system</p>
      <div
        className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2"
        role="radiogroup"
        aria-labelledby={labelId}
      >
        {CAMPAIGN_SYSTEMS.map((system) => {
          const selected = value === system;
          const copy = SYSTEM_COPY[system];
          return (
            <button
              key={system}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(system)}
              className={`rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                selected
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-card hover:border-primary/40'
              }`}
            >
              <span className="block font-display font-semibold">{copy.title}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{copy.detail}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Read-only per-campaign marker. Not a control — it never changes another campaign's sheets. */
export function CampaignSystemBadge({ system }: { system: unknown }) {
  const cyberpunk = system === 'cyberpunk2020';
  const label = campaignSystemLabel(system);
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-xs ${
        cyberpunk ? 'bg-accent/15 text-accent' : 'bg-muted text-muted-foreground'
      }`}
      title={`${label} — this campaign only`}
    >
      {label}
    </span>
  );
}
