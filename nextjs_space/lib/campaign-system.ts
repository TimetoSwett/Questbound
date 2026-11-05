export const CAMPAIGN_SYSTEMS = ['pf1e', 'cyberpunk2020'] as const;

export type CampaignSystem = (typeof CAMPAIGN_SYSTEMS)[number];

export const DEFAULT_CAMPAIGN_SYSTEM: CampaignSystem = 'pf1e';

export function isCampaignSystem(value: unknown): value is CampaignSystem {
  return typeof value === 'string' && (CAMPAIGN_SYSTEMS as readonly string[]).includes(value);
}

export function isCyberpunkCampaign(system: unknown): boolean {
  return system === 'cyberpunk2020';
}

/** Display name for a rules system. */
export function campaignSystemLabel(system: unknown): string {
  if (system === 'cyberpunk2020') return 'Cyberpunk 2020';
  if (system === 'pf1e') return 'Pathfinder';
  return typeof system === 'string' && system.trim() ? system : 'Pathfinder';
}

/** Stored campaign system, with unknown values treated as Pathfinder. */
export function campaignRulesSystem(system: unknown): CampaignSystem {
  return isCampaignSystem(system) ? system : DEFAULT_CAMPAIGN_SYSTEM;
}

/**
 * Which sheet a character uses.
 * Assigned characters follow Campaign.system. Unassigned vault characters
 * follow the sheet stored at create time (a cyberpunk object means Cyberpunk 2020).
 */
export function characterRulesSystem(character: {
  campaign?: { system?: unknown } | null;
  cyberpunk?: unknown;
}): CampaignSystem {
  if (character.campaign) return campaignRulesSystem(character.campaign.system);
  return character.cyberpunk != null ? 'cyberpunk2020' : DEFAULT_CAMPAIGN_SYSTEM;
}
