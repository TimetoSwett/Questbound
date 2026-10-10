'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { Shield, Swords, Globe, Users, BookOpen, LogOut, ChevronLeft, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { CharactersTab } from './characters-tab';
import { WorldTab } from './world-tab';
import { PlayersTab } from './players-tab';
import { BestiaryTab } from './bestiary-tab';

type TabKey = 'characters' | 'world' | 'bestiary' | 'players';

interface Props {
  campaignId: string;
  campaignName: string;
  inviteCode: string;
  role: string;
  userId: string;
  userName: string;
  initialTab?: string;
}

const VALID_TABS: TabKey[] = ['characters', 'world', 'bestiary', 'players'];

export function CampaignShell({ campaignId, campaignName, inviteCode, role, userId, userName, initialTab }: Props) {
  const router = useRouter();
  const startTab: TabKey = VALID_TABS.includes(initialTab as TabKey) && (initialTab !== 'players' || role === 'dm')
    ? (initialTab as TabKey)
    : 'characters';
  const [activeTab, setActiveTab] = useState<TabKey>(startTab);
  const [copied, setCopied] = useState(false);

  const copyCode = () => {
    navigator?.clipboard?.writeText?.(inviteCode);
    setCopied(true);
    toast.success('Invite code copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const tabs = [
    { key: 'characters' as const, label: 'Characters', icon: Swords },
    { key: 'world' as const, label: 'World', icon: Globe },
    { key: 'bestiary' as const, label: 'Bestiary', icon: BookOpen },
    ...(role === 'dm' ? [{ key: 'players' as const, label: 'Players', icon: Users }] : []),
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top navbar */}
      <header className="sticky top-0 z-50 bg-card/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 py-2">
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

      {/* Content */}
      <main className="flex-1">
        {activeTab === 'characters' && <CharactersTab campaignId={campaignId} role={role} userId={userId} />}
        {activeTab === 'world' && <WorldTab campaignId={campaignId} role={role} />}
        {activeTab === 'bestiary' && <BestiaryTab campaignId={campaignId} role={role} />}
        {activeTab === 'players' && role === 'dm' && <PlayersTab campaignId={campaignId} />}
      </main>
    </div>
  );
}
