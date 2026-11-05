import { DEFAULT_CAMPAIGN_SYSTEM, isCampaignSystem, type CampaignSystem } from '@/lib/campaign-system';

/** Client preference for the header Pathfinder / Cyberpunk toggle. Not a campaign field. */
export const RULES_SYSTEM_STORAGE_KEY = 'qb:rules-system';

const listeners = new Set<() => void>();

export function serverRulesSystem(): CampaignSystem {
  return DEFAULT_CAMPAIGN_SYSTEM;
}

export function readRulesSystem(): CampaignSystem {
  if (typeof window === 'undefined') return DEFAULT_CAMPAIGN_SYSTEM;
  try {
    const raw = window.localStorage.getItem(RULES_SYSTEM_STORAGE_KEY);
    return isCampaignSystem(raw) ? raw : DEFAULT_CAMPAIGN_SYSTEM;
  } catch {
    return DEFAULT_CAMPAIGN_SYSTEM;
  }
}

function emit() {
  listeners.forEach((listener) => listener());
}

export function setRulesSystem(system: CampaignSystem) {
  if (!isCampaignSystem(system) || readRulesSystem() === system) return;
  try {
    window.localStorage.setItem(RULES_SYSTEM_STORAGE_KEY, system);
  } catch {
    // Storage can be blocked. Listeners re-read and keep the previous value.
  }
  emit();
}

export function subscribeRulesSystem(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === RULES_SYSTEM_STORAGE_KEY || event.key === null) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}
