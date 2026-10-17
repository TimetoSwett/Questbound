'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { useCampaignEventsAvailable, useCampaignTopic } from '@/hooks/use-campaign-events';
import { breakdownCoins, formatCoins } from '@/lib/coins';

type Coins = { pp?: number; gp?: number; sp?: number; cp?: number };
const safeCoinInt = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : 0;
};

export function useSharedPurse(campaignId?: string | null) {
  const [purse, setPurse] = useState<{ campaignId: string; sharedPurse: boolean; partyCp: number } | null>(null);
  const events = useCampaignEventsAvailable();
  const idRef = useRef(campaignId);
  idRef.current = campaignId;
  const load = useCallback(async () => {
    if (!campaignId) return;
    const id = campaignId;
    try {
      const res = await fetch(`/api/loot?campaignId=${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (!res.ok || idRef.current !== id) return;
      const data = await res.json();
      if (idRef.current !== id) return;
      setPurse({ campaignId: id, sharedPurse: data.sharedPurse === true, partyCp: safeCoinInt(data.partyCp) });
    } catch { /* ignore */ }
  }, [campaignId]);
  useEffect(() => { void load(); }, [load]);
  // The shared-purse toggle publishes `loot`. Polling covers a dropped stream.
  // Outside the campaign shell there is no stream, so don't poll the dashboard.
  const onLive = useCallback(() => { void load(); }, [load]);
  const pollMs = useCampaignTopic(['loot'], onLive);
  useEffect(() => {
    if (!events || pollMs === null || !campaignId) return;
    const id = setInterval(() => { void load(); }, pollMs);
    return () => clearInterval(id);
  }, [events, pollMs, load, campaignId]);
  return purse?.campaignId === campaignId ? purse : null;
}

export function CoinsBox({ purse, coins = {}, editable, onChange }: {
  purse: ReturnType<typeof useSharedPurse>; coins?: Coins; editable: boolean; onChange: (coins: Coins) => void;
}) {
  const shared = purse?.sharedPurse === true;
  const party = breakdownCoins(purse?.partyCp ?? 0);
  const personalSmall = safeCoinInt(coins.sp) * 10 + safeCoinInt(coins.cp);
  const total = safeCoinInt(coins.pp) * 1000 + safeCoinInt(coins.gp) * 100 + personalSmall;
  return (
    <div className="flex flex-wrap items-center gap-2 mb-3 p-3 bg-muted/50 rounded-lg border border-border">
      <span className="text-xs font-semibold text-muted-foreground mr-1">Coins</span>
      {shared && <span className="text-xs rounded bg-muted px-2 py-1">Shared party purse (gp/pp)</span>}
      {(['pp', 'gp', 'sp', 'cp'] as const).map(k => {
        const isShared = shared && (k === 'pp' || k === 'gp');
        return (
          <label key={k} className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="font-mono">{k}{isShared && ' (shared purse)'}</span>
            <Input type="number" min="0" step="1"
              value={isShared ? party[k] : safeCoinInt(coins[k])}
              disabled={!editable || isShared} readOnly={isShared}
              onChange={e => {
                if (!editable || isShared) return;
                onChange({ pp: 0, gp: 0, sp: 0, cp: 0, ...coins, [k]: safeCoinInt(e.target.value) });
              }}
              className="w-20 h-7 text-xs text-center font-mono" />
          </label>
        );
      })}
      <span className="text-xs text-muted-foreground font-mono ml-auto">
        {shared ? `Your sp/cp: ${safeCoinInt(coins.sp)} sp, ${safeCoinInt(coins.cp)} cp · Party gp/pp: ${party.pp} pp, ${party.gp} gp` : `Total: ${formatCoins(total)}`}
      </span>
    </div>
  );
}
