'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { Shield, Plus, LogOut, Scroll, Swords, Users, ArrowRight, ChevronRight, Trash2, FolderPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { FadeIn, Stagger, StaggerItem, HoverLift } from '@/components/ui/animate';
import { CharacterSheet } from '@/app/campaign/[id]/_components/character-sheet';
import { HallNav } from '@/components/library/hall-nav';

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  inviteCode: string;
  myRole: string;
  playerCount: number;
  _count?: { characters: number };
}

interface VaultChar {
  id: string;
  campaignId: string | null;
  campaign: { id: string; name: string } | null;
  isAssigned: boolean;
  name: string;
  race: string;
  classes: any;
  hpMax: number;
  hpCurrent: number;
  createdAt: string;
}

function Header({ userName, current }: { userName: string; current: string }) {
  return (
    <header className="sticky top-0 z-50 bg-card/80 backdrop-blur-md border-b border-border">
      <div className="max-w-5xl mx-auto flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 cursor-pointer" onClick={ () => window.location.href = '/dashboard'}>
          <Shield className="w-7 h-7 text-primary" />
          <span className="font-display text-xl font-bold text-primary tracking-tight">Questbound</span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <HallNav current={current} />
          <span className="text-sm text-muted-foreground hidden sm:block">Welcome, <span className="text-foreground font-medium">{userName}</span></span>
          <Button variant="ghost" size="sm" onClick={async () => { await signOut({ redirect: false }); window.location.href = '/login'; }}>
            <LogOut className="w-4 h-4 mr-1" /> Sign Out
          </Button>
        </div>
      </div>
    </header>
  );
}

function classSummary(classes: any): string {
  try {
    const cls = typeof classes === 'string' ? JSON.parse(classes) : (classes ?? []);
    return (cls ?? []).map((c: any) => `${c?.name ?? '?'} ${c?.level ?? 0}`).join(' / ');
  } catch { return ''; }
}

export function DashboardClient({ userId, userName }: { userId: string; userName: string }) {
  const router = useRouter();
  const view = useSearchParams().get('view') === 'vault' ? 'vault' : 'campaigns';
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [joinCode, setJoinCode] = useState('');

  const [vault, setVault] = useState<VaultChar[]>([]);
  const [vaultLoading, setVaultLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const navCurrent = editingId || view === 'vault' ? '/dashboard?view=vault' : '/dashboard';
  const [attachChar, setAttachChar] = useState<VaultChar | null>(null);

  const requestCampaigns = useCallback(async () => {
    const res = await fetch('/api/campaigns');
    return res.ok ? (await res.json() ?? []) : null;
  }, []);
  const requestVault = useCallback(async () => {
    const res = await fetch('/api/characters');
    return res.ok ? (await res.json() ?? []) : null;
  }, []);

  const fetchCampaigns = useCallback(async () => {
    try {
      const result = await requestCampaigns();
      if (result) setCampaigns(result);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [requestCampaigns]);

  const fetchVault = useCallback(async () => {
    try {
      const result = await requestVault();
      if (result) setVault(result);
    } catch { /* ignore */ } finally { setVaultLoading(false); }
  }, [requestVault]);

  useEffect(() => {
    let active = true;
    requestCampaigns().then((result) => {
      if (active && result) setCampaigns(result);
    }).catch(() => { /* ignore */ }).finally(() => {
      if (active) setLoading(false);
    });
    requestVault().then((result) => {
      if (active && result) setVault(result);
    }).catch(() => { /* ignore */ }).finally(() => {
      if (active) setVaultLoading(false);
    });
    return () => { active = false; };
  }, [requestCampaigns, requestVault]);

  const handleCreate = async () => {
    if (!newName.trim()) { toast.error('Enter a campaign name'); return; }
    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, description: newDesc }),
    });
    if (res.ok) {
      toast.success('Campaign created!');
      setCreateOpen(false);
      setNewName('');
      setNewDesc('');
      fetchCampaigns();
    } else {
      const data = await res.json();
      toast.error(data?.error ?? 'Failed');
    }
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) { toast.error('Enter an invite code'); return; }
    const res = await fetch('/api/campaigns/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: joinCode }),
    });
    const data = await res.json();
    if (res.ok) {
      toast.success(`Joined ${data?.name ?? 'campaign'}!`);
      setJoinOpen(false);
      setJoinCode('');
      fetchCampaigns();
    } else {
      toast.error(data?.error ?? 'Invalid code');
    }
  };

  const makeCharacter = async () => {
    const res = await fetch('/api/characters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Character' }),
    });
    if (res.ok) {
      const ch = await res.json();
      toast.success('Character created!');
      fetchVault();
      setEditingId(ch.id);
    } else {
      toast.error('Failed to create character');
    }
  };

  const deleteVaultChar = async (ch: VaultChar) => {
    const { id, name } = ch;
    const warning = ch.isAssigned
      ? `Delete ${name}? They are in the campaign "${ch.campaign?.name ?? 'another campaign'}" and will be removed from it. This cannot be undone.`
      : `Delete ${name}? This cannot be undone.`;
    if (!confirm(warning)) return;
    const res = await fetch(`/api/characters?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('Character deleted');
      if (editingId === id) setEditingId(null);
      fetchVault();
    } else {
      toast.error('Failed to delete');
    }
  };

  const attachToCampaign = async (campaignId: string) => {
    if (!attachChar || attachChar.isAssigned) return;
    const res = await fetch('/api/characters', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: attachChar.id, campaignId }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      toast.success(`"${attachChar.name}" added to campaign!`);
      setAttachChar(null);
      fetchVault();
      fetchCampaigns();
    } else {
      toast.error(data?.error ?? 'Failed');
    }
  };

  // Character editor view
  if (editingId) {
    return (
      <div className="min-h-screen bg-background">
        <Header userName={userName} current={navCurrent} />
        <main className="max-w-6xl mx-auto px-4 py-4">
          <Button variant="ghost" size="sm" onClick={() => { setEditingId(null); fetchVault(); }} className="mb-4">
            <ChevronRight className="w-4 h-4 rotate-180 mr-1" /> Back to vault
          </Button>
          <CharacterSheet characterId={editingId} editable={true} />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header userName={userName} current={navCurrent} />

      <main className="max-w-5xl mx-auto px-4 py-8">
        <FadeIn>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="font-display text-3xl tracking-tight font-bold">Dashboard</h1>
              <p className="text-muted-foreground mt-1">Your campaigns and characters</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger asChild>
                  <Button><Plus className="w-4 h-4 mr-1" /> Start a campaign</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Create a Campaign</DialogTitle></DialogHeader>
                  <div className="space-y-4 mt-2">
                    <div><Label>Campaign Name</Label><Input value={newName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)} placeholder="The Lost Mines" className="mt-1" /></div>
                    <div><Label>Description (optional)</Label><Input value={newDesc} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewDesc(e.target.value)} placeholder="A grand adventure..." className="mt-1" /></div>
                    <Button onClick={handleCreate} className="w-full">Create Campaign</Button>
                  </div>
                </DialogContent>
              </Dialog>
              <Button variant="secondary" onClick={makeCharacter}>
                <Scroll className="w-4 h-4 mr-1" /> Make a character
              </Button>
              <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
                <DialogTrigger asChild>
                  <Button variant="secondary"><Users className="w-4 h-4 mr-1" /> Join Campaign</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Join a Campaign</DialogTitle></DialogHeader>
                  <div className="space-y-4 mt-2">
                    <div><Label>Invite Code</Label><Input value={joinCode} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setJoinCode(e.target.value.toUpperCase())} placeholder="ABC12" maxLength={6} className="mt-1 font-mono text-lg tracking-widest text-center" /></div>
                    <Button onClick={handleJoin} className="w-full">Join</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </FadeIn>

        {view === 'campaigns' ? (
          loading ? (
            <div className="text-center py-20 text-muted-foreground">Loading campaigns...</div>
          ) : (campaigns?.length ?? 0) === 0 ? (
            <FadeIn>
              <div className="text-center py-20">
                <Scroll className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <h2 className="text-xl font-display font-semibold mb-2">No campaigns yet</h2>
                <p className="text-muted-foreground">Start a new campaign or join one with an invite code</p>
              </div>
            </FadeIn>
          ) : (
            <Stagger key="campaigns" staggerDelay={0.08}>
              <div className="grid gap-4 sm:grid-cols-2">
                {(campaigns ?? []).map((c: Campaign) => (
                  <StaggerItem key={c.id}>
                    <HoverLift>
                      <button
                        onClick={() => router.push(`/campaign/${c.id}`)}
                        className="w-full text-left p-5 rounded-lg bg-card parchment-bg border border-border hover:border-primary/40 transition-colors"
                        style={{ boxShadow: 'var(--shadow-md)' }}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-display text-lg font-semibold">{c.name}</h3>
                            {c.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{c.description}</p>}
                          </div>
                          <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${
                            c.myRole === 'dm' ? 'bg-primary/20 text-primary' : 'bg-secondary text-secondary-foreground'
                          }`}>
                            {c.myRole === 'dm' ? 'DM' : 'Player'}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {c.playerCount} members</span>
                          <span className="flex items-center gap-1"><Swords className="w-3 h-3" /> {c._count?.characters ?? 0} characters</span>
                          <ArrowRight className="w-4 h-4 ml-auto text-primary" />
                        </div>
                      </button>
                    </HoverLift>
                  </StaggerItem>
                ))}
              </div>
            </Stagger>
          )
        ) : (
          vaultLoading ? (
            <div className="text-center py-20 text-muted-foreground">Loading vault...</div>
          ) : (vault?.length ?? 0) === 0 ? (
            <FadeIn>
              <div className="text-center py-20">
                <Scroll className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <h2 className="text-xl font-display font-semibold mb-2">No characters yet</h2>
                <p className="text-muted-foreground mb-4">Make a character now — no campaign needed.</p>
                <Button onClick={makeCharacter}><Plus className="w-4 h-4 mr-1" /> Make a character</Button>
              </div>
            </FadeIn>
          ) : (
            <Stagger key="vault" staggerDelay={0.06}>
              <div className="grid gap-3">
                {(vault ?? []).map((ch: VaultChar) => {
                  const cls = classSummary(ch.classes);
                  return (
                    <StaggerItem key={ch.id}>
                      <HoverLift>
                        <div className="flex items-center gap-3 bg-card p-4 rounded-lg border border-border hover:border-primary/30 transition-colors" style={{ boxShadow: 'var(--shadow-sm)' }}>
                          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setEditingId(ch.id)}>
                            <h3 className="font-display font-semibold truncate">{ch.name ?? 'Unnamed'}</h3>
                            {ch.campaign ? (
                              <Link
                                href={`/campaign/${ch.campaign.id}`}
                                onClick={(event) => event.stopPropagation()}
                                className="inline-block max-w-full truncate rounded-full bg-primary/20 px-2 py-0.5 text-xs text-primary hover:underline"
                              >
                                {ch.campaign.name}
                              </Link>
                            ) : ch.isAssigned ? (
                              <span className="inline-block rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">Assigned to a campaign</span>
                            ) : null}
                            <p className="text-sm text-muted-foreground">{ch.race}{cls ? ` • ${cls}` : ''}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Created {ch.createdAt ? new Date(ch.createdAt).toLocaleDateString() : ''}</p>
                          </div>
                          <div className="text-right shrink-0 hidden sm:block">
                            <p className="text-sm font-mono"><span className="text-green-700">{ch.hpCurrent ?? 0}</span>/{ch.hpMax ?? 0} HP</p>
                          </div>
                          {!ch.isAssigned && (
                            <Button variant="secondary" size="sm" onClick={() => setAttachChar(ch)} disabled={(campaigns?.length ?? 0) === 0} title={(campaigns?.length ?? 0) === 0 ? 'Join a campaign first' : 'Add to a campaign'}>
                              <FolderPlus className="w-4 h-4 mr-1" /> Add to campaign
                            </Button>
                          )}
                          <Button variant="ghost" size="icon-sm" onClick={() => deleteVaultChar(ch)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </HoverLift>
                    </StaggerItem>
                  );
                })}
              </div>
            </Stagger>
          )
        )}
      </main>

      {/* Add-to-campaign dialog */}
      <Dialog open={!!attachChar} onOpenChange={(o) => { if (!o) setAttachChar(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add to campaign</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Choose a campaign for <span className="font-medium text-foreground">{attachChar?.name}</span>.</p>
          <div className="space-y-2 mt-2">
            {(campaigns ?? []).map((c: Campaign) => (
              <button
                key={c.id}
                onClick={() => attachToCampaign(c.id)}
                className="w-full text-left p-3 rounded-lg bg-card border border-border hover:border-primary/40 transition-colors"
              >
                <span className="font-medium">{c.name}</span>
                <span className={`text-xs font-mono px-2 py-0.5 rounded-full ml-2 ${c.myRole === 'dm' ? 'bg-primary/20 text-primary' : 'bg-secondary text-secondary-foreground'}`}>
                  {c.myRole === 'dm' ? 'DM' : 'Player'}
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
