export const CAMPAIGN_SYSTEMS = ['pf1e', 'cyberpunk2020'] as const;

export type CampaignSystem = (typeof CAMPAIGN_SYSTEMS)[number];

export const DEFAULT_CAMPAIGN_SYSTEM: CampaignSystem = 'pf1e';

export function isCampaignSystem(value: unknown): value is CampaignSystem {
  return typeof value === 'string' && (CAMPAIGN_SYSTEMS as readonly string[]).includes(value);
}

export function isCyberpunkCampaign(system: unknown): boolean {
  return system === 'cyberpunk2020';
}
