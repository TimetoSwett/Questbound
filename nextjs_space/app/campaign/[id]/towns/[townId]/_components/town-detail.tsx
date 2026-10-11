'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Castle, ChevronLeft, Pencil, Trash2, Plus, Users, MapPin, BookOpen,
  Store, EyeOff, Eye, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

const TOWN_SIZES = [
  'thorp', 'hamlet', 'village', 'small town',
  'large town', 'small city', 'large city', 'metropolis',
];
const TOWN_SECTION_DEFS = [
  { key: 'name', label: 'Name' },
  { key: 'description', label: 'Description' },
  { key: 'details', label: 'Details' },
  { key: 'residents', label: 'Residents' },
  { key: 'places', label: 'Places' },
  { key: 'wiki', label: 'Wiki' },
];
const LEVEL_LABEL: Record<string, string> = { hidden: 'Hidden', unknown: 'Unknown', named: 'Named', full: 'Full' };
const LEVEL_CLASS: Record<string, string> = {
  hidden: 'text-muted-foreground',
  unknown: 'text-amber-600 border-amber-600/40',
  named: 'text-blue-600 border-blue-600/40',
  full: 'text-green-700 border-green-700/40',
};

interface Resident {
  id: string;
  role: string;
  disposition: string;
  creature: any;
}
interface Place {
  id: string;
  name: string;
  type: string;
  description: string;
  revealLevel: string;
  shopkeeper: any;
}
interface TownData {
  id: string;
  name: string;
  size: string;
  population: number | string | null;
  government: string;
  description: string;
  gmNotes?: string;
  revealLevel: string;
  unlockedSections: string[];
  wikiPage?: { id: string; title: string } | null;
  wikiPageId?: string | null;
  mapPin?: { id: string; label: string } | null;
  mapPinId?: string | null;
  residents?: Resident[];
  places?: Place[];
}

function creatureName(c: any): string {
  return c?.name ?? 'Unnamed';
}
function creaturePortrait(c: any): string | null {
  if (!c) return null;
  if (c.portraitUrl) return c.portraitUrl;
  if (c.portraitPath) return `/api/files/${c.portraitPath}`;
  return null;
}

export function TownDetail({ campaignId, townId, role }: { campaignId: string; townId: string; role: string }) {
  const router = useRouter();
  const isDM = role === 'dm';
  const [town, setTown] = useState<TownData | null>(null);
  const [loading, setLoading] = useState(true);
  const [npcs, setNpcs] = useState<any[]>([]);
  const [wikiPages, setWikiPages] = useState<any[]>([]);
  const [pins, setPins] = useState<any[]>([]);

  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', size: 'village', population: '', government: '',
    description: '', gmNotes: '', wikiPageId: '', mapPinId: '',
  });

  const [resOpen, setResOpen] = useState(false);
  const [resForm, setResForm] = useState({ creatureId: '', role: '', disposition: '' });
  const [editingRes, setEditingRes] = useState<Resident | null>(null);

  const [placeOpen, setPlaceOpen] = useState(false);
  const [editingPlace, setEditingPlace] = useState<Place | null>(null);
  const [placeForm, setPlaceForm] = useState({
    name: '', type: '', description: '', shopkeeperId: '', gmNotes: '', revealLevel: 'hidden',
  });

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/towns/${townId}`);
      if (res.status === 404) { router.push(`/campaign/${campaignId}?tab=towns`); return; }
      if (res.ok) setTown(await res.json());
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [townId, campaignId, router]);

  useEffect(() => { load(); }, [load]);

  const loadPickers = useCallback(async () => {
    try {
      const [cr, wr, pr] = await Promise.all([
        fetch(`/api/creatures?campaignId=${campaignId}`),
        fetch(`/api/wiki?campaignId=${campaignId}`),
        fetch(`/api/maps/world-pins?campaignId=${campaignId}`),
      ]);
      if (cr.ok) {
        const all = (await cr.json()) ?? [];
        setNpcs(all.filter((c: any) => c.isNpc));
      }
      if (wr.ok) setWikiPages((await wr.json()) ?? []);
      if (pr.ok) setPins((await pr.json()) ?? []);
    } catch { /* ignore */ }
  }, [campaignId]);

  useEffect(() => { if (isDM) loadPickers(); }, [isDM, loadPickers]);

  const openEdit = () => {
    if (!town) return;
    setForm({
      name: town.name ?? '',
      size: town.size ?? 'village',
      population: town.population != null && typeof town.population === 'number' ? String(town.population) : '',
      government: town.government ?? '',
      description: town.description ?? '',
      gmNotes: town.gmNotes ?? '',
      wikiPageId: (town as any).wikiPageId ?? '',
      mapPinId: (town as any).mapPinId ?? '',
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/towns/${townId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          size: form.size,
          population: form.population === '' ? null : parseInt(form.population, 10),
          government: form.government.trim(),
          description: form.description.trim(),
          gmNotes: form.gmNotes,
          wikiPageId: form.wikiPageId || null,
          mapPinId: form.mapPinId || null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { toast.error(data?.error ?? 'Could not save town'); return; }
      setEditOpen(false);
      load();
      toast.success('Town updated');
    } finally {
      setSaving(false);
    }
  };

  const saveReveal = async (patch: Record<string, unknown>) => {
    const res = await fetch(`/api/towns/${townId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: town?.name ?? '',
        size: town?.size ?? 'village',
        population: typeof town?.population === 'number' ? town.population : null,
        government: town?.government ?? '',
        description: town?.description ?? '',
        gmNotes: town?.gmNotes ?? '',
        ...patch,
      }),
    });
    if (res.ok) load();
    else toast.error('Could not update reveal settings');
  };

  const deleteTown = async () => {
    if (!confirm(`Delete ${town?.name}? This cannot be undone.`)) return;
    const res = await fetch(`/api/towns/${townId}`, { method: 'DELETE' });
    if (res.ok) router.push(`/campaign/${campaignId}?tab=towns`);
    else toast.error('Could not delete town');
  };

  // --- Residents ---
  const openAddResident = () => {
    setEditingRes(null);
    setResForm({ creatureId: '', role: '', disposition: '' });
    setResOpen(true);
  };
  const openEditResident = (r: Resident) => {
    setEditingRes(r);
    setResForm({ creatureId: r.creature?.id ?? '', role: r.role ?? '', disposition: r.disposition ?? '' });
    setResOpen(true);
  };
  const saveResident = async () => {
    if (editingRes) {
      const res = await fetch(`/api/towns/${townId}/residents?creatureId=${editingRes.creature?.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: resForm.role.trim(), disposition: resForm.disposition.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { toast.error(data?.error ?? 'Could not update resident'); return; }
    } else {
      if (!resForm.creatureId) { toast.error('Choose an NPC'); return; }
      const res = await fetch(`/api/towns/${townId}/residents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creatureId: resForm.creatureId,
          role: resForm.role.trim(),
          disposition: resForm.disposition.trim(),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { toast.error(data?.error ?? 'Could not add resident'); return; }
    }
    setResOpen(false);
    load();
  };
  const removeResident = async (r: Resident) => {
    if (!confirm(`Remove ${creatureName(r.creature)} from ${town?.name}?`)) return;
    await fetch(`/api/towns/${townId}/residents?creatureId=${r.creature?.id}`, { method: 'DELETE' });
    load();
  };

  // --- Places ---
  const openAddPlace = () => {
    setEditingPlace(null);
    setPlaceForm({ name: '', type: '', description: '', shopkeeperId: '', gmNotes: '', revealLevel: 'hidden' });
    setPlaceOpen(true);
  };
  const openEditPlace = (p: Place) => {
    setEditingPlace(p);
    setPlaceForm({
      name: p.name ?? '',
      type: p.type ?? '',
      description: p.description ?? '',
      shopkeeperId: (p.shopkeeper as any)?.id ?? '',
      gmNotes: (p as any).gmNotes ?? '',
      revealLevel: p.revealLevel ?? 'hidden',
    });
    setPlaceOpen(true);
  };
  const savePlace = async () => {
    if (!placeForm.name.trim()) { toast.error('Name the place'); return; }
    const body = {
      name: placeForm.name.trim(),
      type: placeForm.type.trim(),
      description: placeForm.description.trim(),
      shopkeeperId: placeForm.shopkeeperId || null,
      gmNotes: placeForm.gmNotes,
      revealLevel: placeForm.revealLevel,
    };
    const url = editingPlace
      ? `/api/towns/${townId}/places?placeId=${editingPlace.id}`
      : `/api/towns/${townId}/places`;
    const res = await fetch(url, {
      method: editingPlace ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) { toast.error(data?.error ?? 'Could not save place'); return; }
    setPlaceOpen(false);
    load();
    toast.success(editingPlace ? 'Place updated' : 'Place added');
  };
  const deletePlace = async (p: Place) => {
    if (!confirm(`Delete ${p.name}?`)) return;
    await fetch(`/api/towns/${townId}/places?placeId=${p.id}`, { method: 'DELETE' });
    load();
  };
  const togglePlaceReveal = async (p: Place) => {
    const next = p.revealLevel === 'revealed' ? 'hidden' : 'revealed';
    const res = await fetch(`/api/towns/${townId}/places?placeId=${p.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: p.name, type: p.type ?? '', description: p.description ?? '',
        shopkeeperId: (p.shopkeeper as any)?.id ?? null,
        gmNotes: (p as any).gmNotes ?? '', revealLevel: next,
      }),
    });
    if (res.ok) load();
  };

  if (loading) return <div className="max-w-5xl mx-auto px-4 py-6 text-sm text-muted-foreground">Loading town...</div>;
  if (!town) return <div className="max-w-5xl mx-auto px-4 py-6 text-sm text-muted-foreground">Town not found.</div>;

  const nameLocked = !isDM && town.revealLevel !== 'full' && !(town.unlockedSections ?? []).includes('name');

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/campaign/${campaignId}?tab=towns`)}>
          <ChevronLeft className="w-4 h-4 mr-1" /> Towns
        </Button>
        {isDM && (
          <div className="ml-auto flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={openEdit}><Pencil className="w-3.5 h-3.5 mr-1" /> Edit</Button>
            <Button variant="destructive" size="sm" onClick={deleteTown}><Trash2 className="w-3.5 h-3.5 mr-1" /> Delete</Button>
          </div>
        )}
      </div>

      {/* Header */}
      <div className="bg-card border border-border rounded-lg p-5" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-md bg-muted flex items-center justify-center shrink-0">
            <Castle className="w-6 h-6 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className={`font-display text-2xl font-bold ${nameLocked ? 'tracking-[0.2em] text-muted-foreground/70' : ''}`}>
              {town.name}
            </h1>
            <p className="text-sm text-muted-foreground capitalize">
              {town.size}
              {town.population != null && town.population !== '' ? ` • population ${town.population}` : ''}
              {town.government ? ` • ${town.government}` : ''}
            </p>
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {isDM && (
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${LEVEL_CLASS[town.revealLevel] ?? ''}`}>
                  {LEVEL_LABEL[town.revealLevel] ?? town.revealLevel}
                </Badge>
              )}
              {town.wikiPage && (
                <Button
                  variant="outline" size="sm" className="h-6 text-xs"
                  onClick={() => router.push(`/campaign/${campaignId}?tab=world`)}
                  title="Open linked wiki article"
                >
                  <BookOpen className="w-3 h-3 mr-1" /> {town.wikiPage.title}
                </Button>
              )}
              {town.mapPin && (
                <Button
                  variant="outline" size="sm" className="h-6 text-xs"
                  onClick={() => router.push(`/campaign/${campaignId}?tab=world`)}
                  title="View on the world map"
                >
                  <MapPin className="w-3 h-3 mr-1" /> {town.mapPin.label || 'World map'}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* GM reveal controls */}
        {isDM && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Reveal</span>
              <Select value={town.revealLevel} onValueChange={(v: string) => saveReveal({ revealLevel: v })}>
                <SelectTrigger className="h-7 w-[110px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hidden">Hidden</SelectItem>
                  <SelectItem value="unknown">Unknown</SelectItem>
                  <SelectItem value="named">Named</SelectItem>
                  <SelectItem value="full">Full</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(town.revealLevel === 'unknown' || town.revealLevel === 'named') && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Unlock sections:</span>
                {TOWN_SECTION_DEFS.map((s) => {
                  const on = (town.unlockedSections ?? []).includes(s.key);
                  return (
                    <label key={s.key} className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <Switch
                        checked={on}
                        onCheckedChange={() => {
                          const cur: string[] = town.unlockedSections ?? [];
                          const next = on ? cur.filter((k) => k !== s.key) : [...cur, s.key];
                          setTown({ ...town, unlockedSections: next });
                          void saveReveal({ unlockedSections: next });
                        }}
                      />
                      {s.label}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Description */}
      {town.description ? (
        <div className="bg-card border border-border rounded-lg p-5" style={{ boxShadow: 'var(--shadow-sm)' }}>
          <h2 className="font-display text-sm font-bold uppercase tracking-widest text-muted-foreground mb-2">Description</h2>
          <p className="text-sm whitespace-pre-wrap">{town.description}</p>
        </div>
      ) : null}

      {/* GM notes */}
      {isDM && town.gmNotes ? (
        <div className="bg-card border border-dashed border-primary/40 rounded-lg p-5">
          <h2 className="font-display text-sm font-bold uppercase tracking-widest text-muted-foreground mb-2">GM Notes</h2>
          <p className="text-sm whitespace-pre-wrap">{town.gmNotes}</p>
        </div>
      ) : null}

      {/* Residents */}
      <div className="bg-card border border-border rounded-lg p-5" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-primary" />
          <h2 className="font-display text-sm font-bold uppercase tracking-widest">Residents</h2>
          <span className="text-xs text-muted-foreground">({(town.residents ?? []).length})</span>
          {isDM && (
            <Button size="sm" variant="secondary" className="ml-auto h-7 text-xs" onClick={openAddResident}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Add NPC
            </Button>
          )}
        </div>
        {(town.residents ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{isDM ? 'No residents yet.' : 'No known residents.'}</p>
        ) : (
          <div className="space-y-2">
            {(town.residents ?? []).map((r) => {
              const c = r.creature;
              const portrait = creaturePortrait(c);
              return (
                <div key={r.id} className="flex items-center gap-3 rounded border border-border px-3 py-2">
                  {portrait ? (
                    <img src={portrait} alt="" className="w-9 h-9 rounded-full object-cover shrink-0 border border-border" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <Users className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <button
                      className="font-medium text-sm hover:text-primary hover:underline truncate"
                      onClick={() => c?.id && router.push(`/campaign/${campaignId}/bestiary/${c.id}`)}
                    >
                      {creatureName(c)}
                    </button>
                    <p className="text-xs text-muted-foreground truncate">
                      {[r.role, r.disposition].filter(Boolean).join(' • ') || 'Resident'}
                    </p>
                  </div>
                  {isDM && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => openEditResident(r)} className="text-muted-foreground hover:text-foreground p-1" title="Edit role/disposition">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => removeResident(r)} className="text-muted-foreground hover:text-destructive p-1" title="Remove resident">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Places */}
      <div className="bg-card border border-border rounded-lg p-5" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Store className="w-4 h-4 text-primary" />
          <h2 className="font-display text-sm font-bold uppercase tracking-widest">Shops & Notable Places</h2>
          <span className="text-xs text-muted-foreground">({(town.places ?? []).length})</span>
          {isDM && (
            <Button size="sm" variant="secondary" className="ml-auto h-7 text-xs" onClick={openAddPlace}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Place
            </Button>
          )}
        </div>
        {(town.places ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{isDM ? 'No places yet.' : 'No known places.'}</p>
        ) : (
          <div className="space-y-2">
            {(town.places ?? []).map((p) => (
              <div key={p.id} className="rounded border border-border px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-sm">{p.name}</span>
                    {p.type ? <span className="text-xs text-muted-foreground ml-2">{p.type}</span> : null}
                  </div>
                  {p.shopkeeper && (
                    <button
                      className="text-xs text-muted-foreground hover:text-primary hover:underline truncate"
                      onClick={() => (p.shopkeeper as any)?.id && router.push(`/campaign/${campaignId}/bestiary/${(p.shopkeeper as any).id}`)}
                      title="Open shopkeeper"
                    >
                      {creatureName(p.shopkeeper)}
                    </button>
                  )}
                  {isDM && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => togglePlaceReveal(p)}
                        className="text-muted-foreground hover:text-foreground p-1"
                        title={p.revealLevel === 'revealed' ? 'Hide from players' : 'Reveal to players'}
                      >
                        {p.revealLevel === 'revealed' ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => openEditPlace(p)} className="text-muted-foreground hover:text-foreground p-1" title="Edit place">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => deletePlace(p)} className="text-muted-foreground hover:text-destructive p-1" title="Delete place">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                {p.description ? <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{p.description}</p> : null}
                {isDM && (p as any).gmNotes ? (
                  <p className="text-xs text-muted-foreground/80 mt-1 border-l-2 border-primary/40 pl-2 whitespace-pre-wrap">{(p as any).gmNotes}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit town dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Town</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={form.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, name: e.target.value })} maxLength={200} className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Size</Label>
                <Select value={form.size} onValueChange={(v) => setForm({ ...form, size: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TOWN_SIZES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Population</Label><Input type="number" min={0} value={form.population} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, population: e.target.value })} className="mt-1" placeholder="—" /></div>
            </div>
            <div><Label>Government</Label><Input value={form.government} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, government: e.target.value })} maxLength={200} className="mt-1" /></div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, description: e.target.value })} className="mt-1" rows={4} /></div>
            <div><Label>GM Notes (never shown to players)</Label><Textarea value={form.gmNotes} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, gmNotes: e.target.value })} className="mt-1" rows={3} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Wiki page</Label>
                <Select value={form.wikiPageId || 'none'} onValueChange={(v) => setForm({ ...form, wikiPageId: v === 'none' ? '' : v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {wikiPages.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>World map pin</Label>
                <Select value={form.mapPinId || 'none'} onValueChange={(v) => setForm({ ...form, mapPinId: v === 'none' ? '' : v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {pins.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.label || 'Unlabeled pin'}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={saveEdit} disabled={saving} className="w-full">{saving ? 'Saving...' : 'Save Town'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Resident dialog */}
      <Dialog open={resOpen} onOpenChange={setResOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingRes ? 'Edit Resident' : 'Add Resident NPC'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {!editingRes && (
              <div>
                <Label>NPC</Label>
                <Select value={resForm.creatureId} onValueChange={(v) => setResForm({ ...resForm, creatureId: v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Choose an NPC from the Bestiary" /></SelectTrigger>
                  <SelectContent>
                    {npcs.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name || 'Unnamed'}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Role</Label><Input value={resForm.role} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setResForm({ ...resForm, role: e.target.value })} maxLength={200} className="mt-1" placeholder="e.g. Innkeeper" /></div>
              <div><Label>Disposition</Label><Input value={resForm.disposition} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setResForm({ ...resForm, disposition: e.target.value })} maxLength={200} className="mt-1" placeholder="e.g. Friendly" /></div>
            </div>
            <Button onClick={saveResident} className="w-full">{editingRes ? 'Save Resident' : 'Add Resident'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Place dialog */}
      <Dialog open={placeOpen} onOpenChange={setPlaceOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingPlace ? 'Edit Place' : 'Add Shop / Place'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Name</Label><Input value={placeForm.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPlaceForm({ ...placeForm, name: e.target.value })} maxLength={200} className="mt-1" /></div>
              <div><Label>Type</Label><Input value={placeForm.type} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPlaceForm({ ...placeForm, type: e.target.value })} maxLength={100} className="mt-1" placeholder="e.g. Tavern, Blacksmith" /></div>
            </div>
            <div><Label>Description</Label><Textarea value={placeForm.description} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPlaceForm({ ...placeForm, description: e.target.value })} className="mt-1" rows={3} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Shopkeeper (NPC)</Label>
                <Select value={placeForm.shopkeeperId || 'none'} onValueChange={(v) => setPlaceForm({ ...placeForm, shopkeeperId: v === 'none' ? '' : v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {npcs.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name || 'Unnamed'}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Visibility</Label>
                <Select value={placeForm.revealLevel} onValueChange={(v) => setPlaceForm({ ...placeForm, revealLevel: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hidden">Hidden</SelectItem>
                    <SelectItem value="revealed">Revealed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>GM Notes (never shown to players)</Label><Textarea value={placeForm.gmNotes} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPlaceForm({ ...placeForm, gmNotes: e.target.value })} className="mt-1" rows={2} /></div>
            <Button onClick={savePlace} className="w-full">{editingPlace ? 'Save Place' : 'Add Place'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
