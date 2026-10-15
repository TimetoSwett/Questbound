'use client';

import { useState } from 'react';
import { Link2, Plus, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { COMPANIONS_CHANGED_EVENT, useCompanionNav } from './companion-nav';
import { useCompanions } from './use-companions';

interface Candidate { id: string; name: string; campaignId: string | null; isAssigned?: boolean; ownerCharacterId?: string | null }

// Companions of this sheet: open, create, link an existing character, unlink.
export function CompanionPanel({ characterId, campaignId, editable }: { characterId: string; campaignId: string | null; editable: boolean }) {
  const nav = useCompanionNav();
  const { data } = useCompanions(characterId);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<null | 'create' | 'link'>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [busy, setBusy] = useState(false);

  const companions = data?.companions ?? [];
  const changed = () => {
    window.dispatchEvent(new Event(COMPANIONS_CHANGED_EVENT));
    nav?.onChanged?.();
  };
  const send = async (method: 'POST' | 'PUT', body: object, okMessage: string) => {
    setBusy(true);
    try {
      const res = await fetch('/api/characters/companions', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(json?.error ?? 'Failed'); return false; }
      toast.success(okMessage);
      changed();
      return true;
    } finally { setBusy(false); }
  };

  const create = async () => {
    if (!name.trim()) return;
    if (await send('POST', { ownerId: characterId, name: name.trim(), companionType: type.trim() }, 'Companion created')) {
      setName(''); setType(''); setMode(null);
    }
  };

  // Characters the user can edit in the same campaign (the list endpoints only return those), not already owned.
  const startLink = async () => {
    setMode('link');
    const res = await fetch(campaignId ? `/api/characters?campaignId=${campaignId}` : '/api/characters');
    const rows: Candidate[] = res.ok ? await res.json() : [];
    setCandidates(rows.filter((c) => c.id !== characterId && !c.ownerCharacterId && (campaignId ? c.campaignId === campaignId : !c.isAssigned)));
  };
  const link = async (id: string) => {
    if (await send('PUT', { characterId: id, ownerId: characterId, companionType: type.trim() || undefined }, 'Companion linked')) { setMode(null); setType(''); }
  };
  const unlink = (id: string) => send('PUT', { characterId: id, ownerId: null }, 'Companion unlinked');

  return (
    <div className="rounded-lg border border-border bg-card/50 p-3 text-sm">
      <button type="button" className="font-medium" onClick={() => setOpen(!open)} aria-expanded={open}>
        Companions ({companions.length})
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {companions.length === 0 && <p className="text-muted-foreground">No companions yet.</p>}
          {companions.map((c) => (
            <div key={c.id} className="flex items-center gap-2">
              <span className="flex-1 truncate">{c.name}{c.companionType ? <span className="text-muted-foreground"> · {c.companionType}</span> : null}</span>
              {nav && <Button size="sm" variant="secondary" onClick={() => nav.onOpen(c.id)}>Open</Button>}
              {editable && <Button size="sm" variant="ghost" onClick={() => unlink(c.id)} disabled={busy} title="Unlink"><Unlink className="w-4 h-4" /></Button>}
            </div>
          ))}
          {editable && mode === null && (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setMode('create')}><Plus className="w-4 h-4 mr-1" /> Create companion</Button>
              <Button size="sm" variant="secondary" onClick={startLink}><Link2 className="w-4 h-4 mr-1" /> Link existing</Button>
            </div>
          )}
          {editable && mode === 'create' && (
            <div className="flex flex-wrap gap-2">
              <Input className="w-44" placeholder="Name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
              <Input className="w-44" placeholder="Type (e.g. familiar)" maxLength={60} value={type} onChange={(e) => setType(e.target.value)} />
              <Button size="sm" onClick={create} disabled={busy || !name.trim()}>Create</Button>
              <Button size="sm" variant="ghost" onClick={() => setMode(null)}>Cancel</Button>
            </div>
          )}
          {editable && mode === 'link' && (
            <div className="space-y-2">
              <Input className="w-56" placeholder="Type (optional)" maxLength={60} value={type} onChange={(e) => setType(e.target.value)} />
              {candidates.length === 0 && <p className="text-muted-foreground">No characters available to link.</p>}
              {candidates.map((c) => (
                <div key={c.id} className="flex items-center gap-2">
                  <span className="flex-1 truncate">{c.name}</span>
                  <Button size="sm" variant="secondary" onClick={() => link(c.id)} disabled={busy}>Link</Button>
                </div>
              ))}
              <Button size="sm" variant="ghost" onClick={() => setMode(null)}>Cancel</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
