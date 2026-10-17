'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Users, RefreshCw, UserMinus, Copy, Check, Shield, Scroll, Settings, Trash2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/animate';

interface Member {
  id: string;
  userId: string;
  role: string;
  user: { id: string; displayName: string };
}

interface CharData {
  id: string;
  name: string;
  race: string;
  classes: any;
  userId: string;
  user?: { displayName: string };
}

export function PlayersTab({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [characters, setCharacters] = useState<CharData[]>([]);
  const [campaign, setCampaign] = useState<any>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [copied, setCopied] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  const loadRequest = useCallback(async () => {
    const [campRes, charRes] = await Promise.all([
      fetch('/api/campaigns'),
      fetch(`/api/characters?campaignId=${campaignId}`),
    ]);
    const camps = campRes.ok ? await campRes.json() : [];
    return { campaign: (camps ?? []).find((c: any) => c?.id === campaignId), characters: charRes.ok ? (await charRes.json() ?? []) : null };
  }, [campaignId]);

  const loadResult = useCallback((result: Awaited<ReturnType<typeof loadRequest>>) => {
    if (result.campaign) {
      setCampaign(result.campaign);
      setMembers(result.campaign.memberships ?? []);
    }
    if (result.characters) setCharacters(result.characters);
  }, []);

  const load = useCallback(async () => {
    loadResult(await loadRequest());
  }, [loadRequest, loadResult]);

  useEffect(() => {
    let active = true;
    loadRequest().then((result) => { if (active) loadResult(result); });
    return () => { active = false; };
  }, [loadRequest, loadResult]);

  const regenCode = async () => {
    const res = await fetch('/api/campaigns', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId, regenerateCode: true }),
    });
    if (res.ok) { toast.success('Invite code regenerated'); load(); }
  };

  const removePlayer = async (userId: string, name: string) => {
    if (!confirm(`Remove ${name} from campaign? Their characters go back to their vault.`)) return;
    const res = await fetch('/api/campaigns', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId, removeUserId: userId }),
    });
    if (res.ok) { toast.success(`${name} removed`); load(); }
    else toast.error((await res.json().catch(() => null))?.error ?? 'Failed to remove player');
  };

  const deleteCampaign = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error((await res.json().catch(() => null))?.error ?? 'Failed to delete campaign');
        return;
      }
      toast.success('Campaign deleted');
      router.push('/dashboard');
    } finally {
      setDeleting(false);
    }
  };

  const rename = async () => {
    if (!newName.trim()) return;
    const res = await fetch('/api/campaigns', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId, name: newName }),
    });
    if (res.ok) { toast.success('Renamed!'); setRenameOpen(false); load(); }
  };

  const copyCode = () => {
    navigator?.clipboard?.writeText?.(campaign?.inviteCode ?? '');
    setCopied(true);
    toast.success('Copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <FadeIn>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2"><Settings className="w-6 h-6 text-primary" /> Campaign Management</h2>
          <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
            <DialogTrigger asChild><Button variant="secondary" size="sm">Rename Campaign</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Rename Campaign</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-2">
                <div><Label>New Name</Label><Input value={newName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)} className="mt-1" /></div>
                <Button onClick={rename} className="w-full">Save</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </FadeIn>

      {/* Invite Code */}
      <FadeIn delay={0.1}>
        <div className="bg-card rounded-lg p-4 border border-border" style={{ boxShadow: 'var(--shadow-md)' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Invite Code</p>
              <p className="font-mono text-2xl tracking-widest text-primary">{campaign?.inviteCode ?? '...'}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={copyCode}>
                {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
              </Button>
              <Button variant="secondary" size="sm" onClick={regenCode}>
                <RefreshCw className="w-4 h-4 mr-1" /> Regenerate
              </Button>
            </div>
          </div>
        </div>
      </FadeIn>

      {/* Members */}
      <FadeIn delay={0.2}>
        <h3 className="font-display text-lg font-semibold flex items-center gap-2"><Users className="w-5 h-5 text-primary" /> Members</h3>
        <Stagger staggerDelay={0.05}>
          <div className="space-y-2 mt-2">
            {(members ?? []).map((m: Member) => (
              <StaggerItem key={m.id}>
                <div className="flex items-center justify-between bg-card p-3 rounded-lg border border-border">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${m.role === 'dm' ? 'bg-primary/20 text-primary' : 'bg-secondary text-secondary-foreground'}`}>
                      {m.role === 'dm' ? <Shield className="w-4 h-4" /> : m.user?.displayName?.[0]?.toUpperCase?.() ?? '?'}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{m.user?.displayName ?? 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground">{m.role === 'dm' ? 'Dungeon Master' : 'Player'}</p>
                    </div>
                  </div>
                  {m.role !== 'dm' && (
                    <Button variant="ghost" size="sm" onClick={() => removePlayer(m.userId, m.user?.displayName ?? 'player')}>
                      <UserMinus className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </StaggerItem>
            ))}
          </div>
        </Stagger>
      </FadeIn>

      {/* Character Overview */}
      <FadeIn delay={0.3}>
        <h3 className="font-display text-lg font-semibold flex items-center gap-2"><Scroll className="w-5 h-5 text-primary" /> All Characters</h3>
        <div className="grid gap-2 mt-2">
          {(characters ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm py-4">No characters created yet.</p>
          ) : (
            (characters ?? []).map((ch: CharData) => {
              let classStr = '';
              try {
                const cls = typeof ch.classes === 'string' ? JSON.parse(ch.classes) : (ch.classes ?? []);
                classStr = (cls ?? []).map((c: any) => `${c?.name ?? '?'} ${c?.level ?? 0}`).join(' / ');
              } catch { classStr = ''; }
              return (
                <div key={ch.id} className="bg-card p-3 rounded-lg border border-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{ch.name ?? 'Unnamed'}</p>
                      <p className="text-xs text-muted-foreground">{ch.race} {classStr ? `• ${classStr}` : ''}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{ch.user?.displayName ?? 'Unknown'}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </FadeIn>

      {/* Danger zone */}
      <FadeIn delay={0.4}>
        <div className="rounded-lg border border-destructive/40 p-4">
          <h3 className="font-display text-lg font-semibold flex items-center gap-2 text-destructive"><AlertTriangle className="w-5 h-5" /> Danger Zone</h3>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Delete this campaign and its maps, wiki, bestiary, towns, loot and roll log. Characters are kept in their owners&apos; vaults.
            </p>
            <Dialog open={deleteOpen} onOpenChange={(o) => { setDeleteOpen(o); if (!o) setDeleteConfirm(''); }}>
              <DialogTrigger asChild>
                <Button variant="destructive" size="sm" className="shrink-0"><Trash2 className="w-4 h-4 mr-1" /> Delete Campaign</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Delete Campaign</DialogTitle></DialogHeader>
                <div className="space-y-4 mt-2">
                  <p className="text-sm text-muted-foreground">
                    This cannot be undone. Type <span className="font-mono font-medium text-foreground">{campaign?.name}</span> to confirm.
                  </p>
                  <Input value={deleteConfirm} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDeleteConfirm(e.target.value)} placeholder={campaign?.name ?? ''} />
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={deleteCampaign}
                    disabled={deleting || !campaign?.name || deleteConfirm.trim() !== campaign.name.trim()}
                  >
                    {deleting ? 'Deleting...' : 'Delete forever'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </FadeIn>
    </div>
  );
}
