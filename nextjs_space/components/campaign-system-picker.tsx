'use client';

import { campaignSystemLabel } from '@/lib/campaign-system';

/** Read-only marker for a campaign or character's rules system. */
export function CampaignSystemBadge({ system }: { system: unknown }) {
  const cyberpunk = system === 'cyberpunk2020';
  const label = campaignSystemLabel(system);
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-xs ${
        cyberpunk ? 'bg-accent/15 text-accent' : 'bg-muted text-muted-foreground'
      }`}
      title={label}
    >
      {label}
    </span>
  );
}
