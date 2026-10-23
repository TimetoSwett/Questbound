'use client';

import { useState } from 'react';
import { BookOpen, Map, Grid3X3, GitBranch, Castle } from 'lucide-react';
import { WikiView } from './wiki-view';
import { WorldMapView } from './world-map-view';
import { BattleMapView } from './battle-map-view';
import { RegionMapView } from './region-map-view';
import { TownsTab } from './towns-tab';

type WorldSubTab = 'wiki' | 'world-map' | 'battle-map' | 'region-map' | 'towns';

export function WorldTab({ campaignId, role, initialSubTab }: { campaignId: string; role: string; initialSubTab?: WorldSubTab }) {
  const [subTab, setSubTab] = useState<WorldSubTab>(initialSubTab ?? 'wiki');
  const [wikiPageId, setWikiPageId] = useState<string | null>(null);
  const isDM = role === 'dm';

  // Deep link from a world map pin: jump to the wiki tab with the article open.
  const openWikiPage = (pageId: string) => {
    setWikiPageId(pageId);
    setSubTab('wiki');
  };

  const tabs = [
    { key: 'wiki' as const, label: 'Wiki', icon: BookOpen },
    { key: 'world-map' as const, label: 'World Map', icon: Map },
    { key: 'battle-map' as const, label: 'Battle Map', icon: Grid3X3 },
    { key: 'region-map' as const, label: 'Region Map', icon: GitBranch },
    // Towns lives here for the GM (players keep their top-level Towns tab).
    ...(isDM ? [{ key: 'towns' as const, label: 'Towns', icon: Castle }] : []),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-4">
      <div className="flex gap-1 mb-4 bg-card/50 p-1 rounded-lg w-fit max-w-full overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            className={`flex shrink-0 items-center gap-1 whitespace-nowrap px-3 py-1.5 text-sm rounded-md transition-colors ${
              subTab === t.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {subTab === 'wiki' && <WikiView campaignId={campaignId} isDM={isDM} initialPageId={wikiPageId} />}
      {subTab === 'world-map' && <WorldMapView campaignId={campaignId} isDM={isDM} onOpenWikiPage={openWikiPage} />}
      {subTab === 'battle-map' && <BattleMapView campaignId={campaignId} isDM={isDM} onOpenWikiPage={openWikiPage} />}
      {subTab === 'region-map' && <RegionMapView campaignId={campaignId} isDM={isDM} />}
      {subTab === 'towns' && isDM && <TownsTab campaignId={campaignId} role={role} />}
    </div>
  );
}
