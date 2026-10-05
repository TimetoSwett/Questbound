'use client';

import { useState } from 'react';
import { BookOpen, Map, Grid3X3, GitBranch } from 'lucide-react';
import { WikiView } from './wiki-view';
import { WorldMapView } from './world-map-view';
import { BattleMapView } from './battle-map-view';
import { RegionMapView } from './region-map-view';

export function WorldTab({ campaignId, role }: { campaignId: string; role: string }) {
  const [subTab, setSubTab] = useState<'wiki' | 'world-map' | 'battle-map' | 'region-map'>('wiki');
  const isDM = role === 'dm';

  const tabs = [
    { key: 'wiki' as const, label: 'Wiki', icon: BookOpen },
    { key: 'world-map' as const, label: 'World Map', icon: Map },
    { key: 'battle-map' as const, label: 'Battle Map', icon: Grid3X3 },
    { key: 'region-map' as const, label: 'Region Map', icon: GitBranch },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-4">
      <div className="flex gap-1 mb-4 bg-card/50 p-1 rounded-lg w-fit">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-md transition-colors ${
              subTab === t.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {subTab === 'wiki' && <WikiView campaignId={campaignId} isDM={isDM} />}
      {subTab === 'world-map' && <WorldMapView campaignId={campaignId} isDM={isDM} />}
      {subTab === 'battle-map' && <BattleMapView campaignId={campaignId} isDM={isDM} />}
      {subTab === 'region-map' && <RegionMapView campaignId={campaignId} isDM={isDM} />}
    </div>
  );
}
