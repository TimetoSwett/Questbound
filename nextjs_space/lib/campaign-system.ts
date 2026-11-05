export const CAMPAIGN_SYSTEMS = ['pf1e', 'cyberpunk2020'] as const;

export type CampaignSystem = (typeof CAMPAIGN_SYSTEMS)[number];

export const DEFAULT_CAMPAIGN_SYSTEM: CampaignSystem = 'pf1e';

export function isCampaignSystem(value: unknown): value is CampaignSystem {
  return typeof value === 'string' && (CAMPAIGN_SYSTEMS as readonly string[]).includes(value);
}

export function isCyberpunkCampaign(system: unknown): boolean {
  return system === 'cyberpunk2020';
}

/** Display name for a campaign's rules system. Per campaign, never a global switch. */
export function campaignSystemLabel(system: unknown): string {
  if (system === 'cyberpunk2020') return 'Cyberpunk 2020';
  if (system === 'pf1e') return 'Pathfinder';
  return typeof system === 'string' && system.trim() ? system : 'Pathfinder';
}
