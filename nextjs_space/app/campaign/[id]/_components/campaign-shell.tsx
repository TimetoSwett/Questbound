'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { Shield, Swords, Globe, Users, BookOpen, LogOut, ChevronLeft, Copy, Check, Dices, Castle, Drama } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { CharactersTab } from './characters-tab';
import { WorldTab } from './world-tab';
import { PlayersTab } from './players-tab';
import { BestiaryTab } from './bestiary-tab';
import { TownsTab } from './towns-tab';
import { NpcsTab } from './npcs-tab';
import { RollLog } from './roll-log';

const DESKTOP_QUERY = '(min-width: 1024px)';
function subscribeDesktop(cb: () => void) {
  const mql = window.matchMedia(DESKTOP_QUERY);
  mql.addEventListener('change', cb);
  return () => mql.removeEventListener('change', cb);
}
function getIsDesktop() {
  return window.matchMedia(DESKTOP_QUERY).matches;
}

type TabKey = 'characters' | 'world' | 'bestiary' | 'towns' | 'npcs' | 'players';

interface Props {
  campaignId: string;
  campaignName: string;
  inviteCode: string;
  role: string;
  userId: string;
  userName: string;
  initialTab?: string;
}

// GM top-level tabs (Towns lives under World for the GM); players keep their
// existing tabs exactly as they were.
const GM_TABS: TabKey[] = ['world', 'bestiary', 'npcs', 'characters', 'players'];
const PLAYER_TABS: TabKey[] = ['characters', 'world', 'bestiary', 'towns'];

export function CampaignShell({ campaignId, campaignName, inviteCode, role, userId, userName, initialTab }: Props) {
  const router = useRouter();
  const isDM = role === 'dm';
  const allowedTabs = isDM ? GM_TABS : PLAYER_TABS;
  const startTab: TabKey = allowedTabs.includes(initialTab as TabKey)
    ? (initialTab as TabKey)
    : (isDM ? 'world' : 'characters');
  const [activeTab, setActiveTab] = useState<TabKey>(startTab);
  const [copied, setCopied] = useState(false);
  // Desktop keeps the side column open by default; on mobile the log is an
  // overlay that starts closed and only opens via the toggle.
  const isDesktop = useSyncExternalStore(subscribeDesktop, getIsDesktop, () => true);
  const [desktopLogOpen, setDesktopLogOpen] = useState(true);
  const [mobileLogOpen, setMobileLogOpen] = useState(false);
  const logOpen = isDesktop ? desktopLogOpen : mobileLogOpen;
  const setLogOpen = isDesktop ? setDesktopLogOpen : setMobileLogOpen;
  useEffect(() => {
    if (isDesktop || !mobileLogOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileLogOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isDesktop, mobileLogOpen]);

  const copyCode = () => {
    navigator?.clipboard?.writeText?.(inviteCode);
    setCopied(true);
    toast.success('Invite code copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  // GM tab order: World, Bestiary, NPCs, then the rest. Players keep their
  // existing order and tabs exactly as they were.
  const tabs = isDM
    ? [
        { key: 'world' as const, label: 'World', icon: Globe },
        { key: 'bestiary' as const, label: 'Bestiary', icon: BookOpen },
        { key: 'npcs' as const, label: 'NPCs', icon: Drama },
        { key: 'characters' as const, label: 'Characters', icon: Swords },
        { key: 'players' as const, label: 'Players', icon: Users },
      ]
    : [
        { key: 'characters' as const, label: 'Characters', icon: Swords },
        { key: 'world' as const, label: 'World', icon: Globe },
        { key: 'bestiary' as const, label: 'Bestiary', icon: BookOpen },
        { key: 'towns' as const, label: 'Towns', icon: Castle },
      ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top navbar */}
      <header className="sticky top-0 z-50 bg-card/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 px-4 py-2">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard')}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <div className="h-5 w-px bg-border" />
            <Shield className="w-5 h-5 text-primary" />
            <span className="font-display text-lg font-bold tracking-tight">{campaignName}</span>
            <button onClick={copyCode} className="flex items-center gap-1 text-xs font-mono bg-muted px-2 py-1 rounded hover:bg-muted/80 transition-colors" title="Copy invite code">
              {inviteCode}
              {copied ? <Check className="w-3 h-3 text-green-700" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${role === 'dm' ? 'bg-primary/20 text-primary' : 'bg-secondary text-secondary-foreground'}`}>{role === 'dm' ? 'Dungeon Master' : 'Player'}</span>
            <Button variant="ghost" size="sm" onClick={() => setLogOpen((o) => !o)} title={logOpen ? 'Hide roll log' : 'Show roll log'} aria-label={logOpen ? 'Hide roll log' : 'Show roll log'} aria-expanded={logOpen} aria-controls="campaign-roll-log">
              <Dices className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={async () => { await signOut({ redirect: false }); window.location.href = '/login'; }}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-4">
          <nav className="flex gap-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === t.key
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <t.icon className="w-4 h-4" />
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Content + roll log side column */}
      <div className="flex-1 flex items-stretch min-w-0">
        <main className="flex-1 min-w-0">
          {activeTab === 'characters' && <CharactersTab campaignId={campaignId} role={role} userId={userId} />}
          {activeTab === 'world' && <WorldTab campaignId={campaignId} role={role} />}
          {activeTab === 'bestiary' && <BestiaryTab campaignId={campaignId} role={role} />}
          {activeTab === 'towns' && !isDM && <TownsTab campaignId={campaignId} role={role} />}
          {activeTab === 'npcs' && isDM && <NpcsTab campaignId={campaignId} />}
          {activeTab === 'players' && isDM && <PlayersTab campaignId={campaignId} />}
        </main>
        {logOpen && (
          <aside id="campaign-roll-log" aria-label="Roll log" className="fixed inset-x-0 bottom-0 z-40 h-[min(70dvh,32rem)] overscroll-contain border-t border-border bg-card shadow-2xl lg:static lg:z-auto lg:h-auto lg:w-80 lg:shrink-0 lg:border-t-0 lg:border-l lg:bg-card/40 lg:shadow-none">
            <div className="h-full lg:sticky lg:top-[100px] lg:h-[calc(100vh-100px)]">
              <RollLog campaignId={campaignId} role={role} />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
