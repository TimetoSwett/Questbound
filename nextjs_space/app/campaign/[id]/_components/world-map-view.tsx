'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Upload, MapPin, Eye, EyeOff, Trash2, Plus, X, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import Image from 'next/image';

interface Pin {
  id: string;
  x: number;
  y: number;
  label: string;
  description: string;
  category: string;
  visibility: string;
  wikiPageId: string | null;
  wikiPage?: { id: string; title: string; visibility: string } | null;
}

interface WikiPageOption {
  id: string;
  title: string;
}

const PIN_CATEGORIES = ['City', 'Dungeon', 'Wilderness', 'POI', 'Town', 'Fort'];
const PIN_COLORS: Record<string, string> = {
  City: '#D4A547', Dungeon: '#E04040', Wilderness: '#40A040', POI: '#60B5FF', Town: '#C080D0', Fort: '#FF9149',
};

export function WorldMapView({ campaignId, isDM, onOpenWikiPage }: { campaignId: string; isDM: boolean; onOpenWikiPage?: (pageId: string) => void }) {
  const [mapUrl, setMapUrl] = useState<string | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [placing, setPlacing] = useState(false);
  const [editPin, setEditPin] = useState<Pin | null>(null);
  const [pinForm, setPinForm] = useState({ label: '', description: '', category: 'POI', visibility: 'dm_only', wikiPageId: '' });
  const [wikiPages, setWikiPages] = useState<WikiPageOption[]>([]);
  const [newPinPos, setNewPinPos] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const loadMapRequest = useCallback(async () => {
    const res = await fetch(`/api/maps/world-image?campaignId=${campaignId}`);
    if (!res.ok) return null;
    const data = await res.json();
    return { url: data?.url ?? null };
  }, [campaignId]);

  const loadMapResult = useCallback((result: Awaited<ReturnType<typeof loadMapRequest>>) => {
    if (result) setMapUrl(result.url ?? null);
  }, []);

  const loadMap = useCallback(async () => {
    loadMapResult(await loadMapRequest());
  }, [loadMapRequest, loadMapResult]);

  const loadPinsRequest = useCallback(async () => {
    const res = await fetch(`/api/maps/world-pins?campaignId=${campaignId}`);
    return res.ok ? (await res.json() ?? []) : null;
  }, [campaignId]);

  const loadPinsResult = useCallback((result: Awaited<ReturnType<typeof loadPinsRequest>>) => {
    if (result) setPins(result);
  }, []);

  const loadPins = useCallback(async () => {
    loadPinsResult(await loadPinsRequest());
  }, [loadPinsRequest, loadPinsResult]);

  const loadWikiPagesRequest = useCallback(async () => {
    if (!isDM) return null;
    const res = await fetch(`/api/wiki?campaignId=${campaignId}`);
    return res.ok ? (await res.json() ?? []) : null;
  }, [campaignId, isDM]);

  const loadWikiPagesResult = useCallback((result: Awaited<ReturnType<typeof loadWikiPagesRequest>>) => {
    if (result) setWikiPages(result.map((pg: any) => ({ id: pg.id, title: pg.title ?? 'Untitled' })));
  }, []);

  useEffect(() => {
    let active = true;
    loadMapRequest().then((result) => { if (active) loadMapResult(result); });
    loadPinsRequest().then((result) => { if (active) loadPinsResult(result); });
    loadWikiPagesRequest().then((result) => { if (active) loadWikiPagesResult(result); });
    return () => { active = false; };
  }, [loadMapRequest, loadMapResult, loadPinsRequest, loadPinsResult, loadWikiPagesRequest, loadWikiPagesResult]);

  const uploadMap = async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    const upRes = await fetch('/api/upload', { method: 'POST', body: form });
    if (!upRes.ok) { toast.error('Upload failed'); return; }
    const { cloud_storage_path } = await upRes.json();
    await fetch('/api/maps/world-image', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId, cloud_storage_path, isPublic: true }),
    });
    toast.success('Map uploaded!');
    loadMap();
  };

  const handleMapClick = (e: React.MouseEvent) => {
    if (!placing || !isDM) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setNewPinPos({ x, y });
    setPinForm({ label: '', description: '', category: 'POI', visibility: 'dm_only', wikiPageId: '' });
    setPlacing(false);
  };

  const saveNewPin = async () => {
    if (!newPinPos || !pinForm.label) { toast.error('Enter a label'); return; }
    await fetch('/api/maps/world-pins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId, x: newPinPos.x, y: newPinPos.y, ...pinForm }),
    });
    toast.success('Pin added!');
    setNewPinPos(null);
    loadPins();
  };

  const updatePin = async () => {
    if (!editPin) return;
    await fetch('/api/maps/world-pins', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editPin.id, label: editPin.label, description: editPin.description, category: editPin.category, visibility: editPin.visibility, wikiPageId: editPin.wikiPageId || null }),
    });
    toast.success('Updated!');
    setEditPin(null);
    loadPins();
  };

  const deletePin = async (id: string) => {
    await fetch(`/api/maps/world-pins?id=${id}`, { method: 'DELETE' });
    toast.success('Pin removed');
    setEditPin(null);
    loadPins();
  };

  return (
    <div className="space-y-3">
      {isDM && (
        <div className="flex items-center gap-2">
          <label className="cursor-pointer">
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target?.files?.[0]; if (f) uploadMap(f); }} />
            <Button variant="secondary" size="sm" asChild><span><Upload className="w-4 h-4 mr-1" /> Upload Map Image</span></Button>
          </label>
          <Button variant={placing ? 'default' : 'secondary'} size="sm" onClick={() => setPlacing(!placing)}>
            <MapPin className="w-4 h-4 mr-1" /> {placing ? 'Click map to place pin...' : 'Add Pin'}
          </Button>
        </div>
      )}

      {!mapUrl ? (
        <div className="text-center py-20 text-muted-foreground border-2 border-dashed border-border rounded-lg">
          <MapPin className="w-10 h-10 mx-auto mb-2" />
          <p>{isDM ? 'Upload a world map image to get started' : 'No world map uploaded yet'}</p>
        </div>
      ) : (
        <div ref={containerRef} className="relative rounded-lg overflow-hidden border border-border cursor-crosshair" onClick={handleMapClick}>
          <div className="relative w-full" style={{ paddingBottom: '66.67%' }}>
            <Image src={mapUrl} alt="World Map" fill className="object-contain" unoptimized />
          </div>
          {/* Pins */}
          {(pins ?? []).map((pin: Pin) => (
            <button key={pin.id} onClick={(e) => { e.stopPropagation(); setEditPin(pin); }}
              className="absolute w-6 h-6 -translate-x-1/2 -translate-y-full flex items-center justify-center group"
              style={{ left: `${pin.x}%`, top: `${pin.y}%` }}>
              <MapPin className="w-5 h-5 drop-shadow-lg" style={{ color: PIN_COLORS[pin?.category ?? 'POI'] ?? '#60B5FF' }} />
              <span className="absolute bottom-full mb-1 text-[10px] bg-card/90 px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity" style={{ boxShadow: 'var(--shadow-md)' }}>
                {pin?.label ?? 'Pin'}
                {isDM && pin?.visibility === 'dm_only' && <EyeOff className="w-2.5 h-2.5 inline ml-1" />}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* New pin form */}
      <Dialog open={!!newPinPos} onOpenChange={() => setNewPinPos(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Map Pin</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div><Label>Label</Label><Input value={pinForm.label} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPinForm({ ...pinForm, label: e.target.value })} className="mt-1" /></div>
            <div><Label>Description</Label><textarea value={pinForm.description} onChange={(e) => setPinForm({ ...pinForm, description: e.target.value })} className="w-full mt-1 bg-muted rounded-md p-2 text-sm border border-border min-h-[60px]" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Category</Label><select value={pinForm.category} onChange={(e) => setPinForm({ ...pinForm, category: e.target.value })} className="mt-1 h-8 w-full rounded-md bg-card border border-input px-2 text-sm">{PIN_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
              <div><Label>Visibility</Label><select value={pinForm.visibility} onChange={(e) => setPinForm({ ...pinForm, visibility: e.target.value })} className="mt-1 h-8 w-full rounded-md bg-card border border-input px-2 text-sm"><option value="dm_only">DM Only</option><option value="shared">Shared</option></select></div>
            </div>
            <div><Label>Linked wiki article (optional)</Label><select value={pinForm.wikiPageId} onChange={(e) => setPinForm({ ...pinForm, wikiPageId: e.target.value })} className="mt-1 h-8 w-full rounded-md bg-card border border-input px-2 text-sm"><option value="">None</option>{wikiPages.map((pg) => <option key={pg.id} value={pg.id}>{pg.title}</option>)}</select></div>
            <Button onClick={saveNewPin} className="w-full">Place Pin</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit pin */}
      <Dialog open={!!editPin} onOpenChange={() => setEditPin(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Pin</DialogTitle></DialogHeader>
          {editPin && (
            <div className="space-y-3 mt-2">
              <div><Label>Label</Label><Input value={editPin.label ?? ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditPin({ ...editPin, label: e.target.value })} className="mt-1" /></div>
              <div><Label>Description</Label><textarea value={editPin.description ?? ''} onChange={(e) => setEditPin({ ...editPin, description: e.target.value })} className="w-full mt-1 bg-muted rounded-md p-2 text-sm border border-border min-h-[60px]" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Category</Label><select value={editPin.category ?? 'POI'} onChange={(e) => setEditPin({ ...editPin, category: e.target.value })} className="mt-1 h-8 w-full rounded-md bg-card border border-input px-2 text-sm">{PIN_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
                <div><Label>Visibility</Label><select value={editPin.visibility ?? 'dm_only'} onChange={(e) => setEditPin({ ...editPin, visibility: e.target.value })} className="mt-1 h-8 w-full rounded-md bg-card border border-input px-2 text-sm"><option value="dm_only">DM Only</option><option value="shared">Shared</option></select></div>
              </div>
              {isDM && (
                <div><Label>Linked wiki article (optional)</Label><select value={editPin.wikiPageId ?? ''} onChange={(e) => setEditPin({ ...editPin, wikiPageId: e.target.value || null })} className="mt-1 h-8 w-full rounded-md bg-card border border-input px-2 text-sm"><option value="">None</option>{wikiPages.map((pg) => <option key={pg.id} value={pg.id}>{pg.title}</option>)}</select></div>
              )}
              {editPin.wikiPage && onOpenWikiPage && (
                <button
                  onClick={() => {
                    const pid = editPin.wikiPageId;
                    setEditPin(null);
                    if (pid && onOpenWikiPage) onOpenWikiPage(pid);
                  }}
                  className="flex items-center gap-1.5 text-sm text-primary hover:underline w-fit"
                >
                  <BookOpen className="w-4 h-4" /> Read article: {editPin.wikiPage.title}
                </button>
              )}
              <div className="flex gap-2">
                {isDM && <Button onClick={updatePin} className="flex-1">Save</Button>}
                {isDM && <Button variant="destructive" onClick={() => deletePin(editPin.id)}>Delete</Button>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
