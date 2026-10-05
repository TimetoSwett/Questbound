'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Save, Plus, Trash2, Eye, EyeOff, Settings, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';

interface Token { id: string; label: string; color: string; x: number; y: number; size: number; }
interface Highlight { id: string; x: number; y: number; w: number; h: number; color: string; label: string; }
interface BattleState { gridWidth: number; gridHeight: number; tokens: Token[]; highlights: Highlight[]; fog: string[]; }

const TOKEN_COLORS = ['#D4A547', '#E04040', '#40A040', '#60B5FF', '#C080D0', '#FF9149', '#FF6363', '#80D8C3'];

export function BattleMapView({ campaignId, isDM }: { campaignId: string; isDM: boolean }) {
  const [state, setState] = useState<BattleState>({ gridWidth: 20, gridHeight: 20, tokens: [], highlights: [], fog: [] });
  const [dragging, setDragging] = useState<string | null>(null);
  const [fogMode, setFogMode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newToken, setNewToken] = useState({ label: '', color: TOKEN_COLORS[0], size: 1 });
  const [newTokenOpen, setNewTokenOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/maps/battle?campaignId=${campaignId}`);
    if (res.ok) {
      const d = await res.json();
      setState({
        gridWidth: d?.gridWidth ?? 20,
        gridHeight: d?.gridHeight ?? 20,
        tokens: d?.tokens ?? [],
        highlights: d?.highlights ?? [],
        fog: d?.fog ?? [],
      });
    }
  }, [campaignId]);

  useEffect(() => { load(); }, [load]);

  // Live updates for players: the DM's token moves and fog changes land
  // without a page refresh. The DM is the source of truth (every DM action
  // saves immediately), so only non-DM viewers poll.
  useEffect(() => {
    if (isDM) return;
    const id = setInterval(() => { load(); }, 3000);
    return () => clearInterval(id);
  }, [isDM, load]);

  const save = async (s: BattleState) => {
    await fetch('/api/maps/battle', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId, state: s }),
    });
  };

  const cellSize = Math.min(30, Math.floor(800 / (state?.gridWidth ?? 20)));
  const gw = state?.gridWidth ?? 20;
  const gh = state?.gridHeight ?? 20;

  const handleCellClick = (x: number, y: number) => {
    if (!isDM) return;
    if (fogMode) {
      const key = `${x},${y}`;
      const fog = [...(state?.fog ?? [])];
      const idx = fog.indexOf(key);
      if (idx >= 0) fog.splice(idx, 1);
      else fog.push(key);
      const ns = { ...state, fog };
      setState(ns);
      save(ns);
      return;
    }
  };

  const handleDrop = (x: number, y: number) => {
    if (!dragging || !isDM) return;
    const tokens = (state?.tokens ?? []).map((t: Token) => t.id === dragging ? { ...t, x, y } : t);
    const ns = { ...state, tokens };
    setState(ns);
    save(ns);
    setDragging(null);
  };

  const addToken = () => {
    if (!newToken.label) { toast.error('Enter a label'); return; }
    const t: Token = {
      id: `t_${Date.now()}`,
      label: newToken.label,
      color: newToken.color,
      x: 0, y: 0,
      size: newToken.size || 1,
    };
    const ns = { ...state, tokens: [...(state?.tokens ?? []), t] };
    setState(ns);
    save(ns);
    setNewTokenOpen(false);
    setNewToken({ label: '', color: TOKEN_COLORS[0], size: 1 });
    toast.success('Token added');
  };

  const removeToken = (id: string) => {
    const ns = { ...state, tokens: (state?.tokens ?? []).filter((t: Token) => t.id !== id) };
    setState(ns);
    save(ns);
  };

  const isFogged = (x: number, y: number) => (state?.fog ?? []).includes(`${x},${y}`);

  return (
    <div className="space-y-3">
      {isDM && (
        <div className="flex items-center gap-2 flex-wrap">
          <Dialog open={newTokenOpen} onOpenChange={setNewTokenOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" /> Add Token</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Token</DialogTitle></DialogHeader>
              <div className="space-y-3 mt-2">
                <div><Label>Label (initials or emoji)</Label><Input value={newToken.label} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewToken({ ...newToken, label: e.target.value })} className="mt-1" maxLength={4} /></div>
                <div>
                  <Label>Color</Label>
                  <div className="flex gap-2 mt-1">
                    {TOKEN_COLORS.map((c) => (
                      <button key={c} onClick={() => setNewToken({ ...newToken, color: c })}
                        className={`w-7 h-7 rounded-full border-2 transition-transform ${newToken.color === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                        style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </div>
                <div><Label>Size</Label><select value={newToken.size} onChange={(e) => setNewToken({ ...newToken, size: parseInt(e.target.value) })} className="mt-1 h-8 w-full rounded-md bg-card border border-input px-2 text-sm"><option value={1}>1×1</option><option value={2}>2×2</option><option value={3}>3×3</option></select></div>
                <Button onClick={addToken} className="w-full">Add</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Button variant={fogMode ? 'default' : 'secondary'} size="sm" onClick={() => setFogMode(!fogMode)}>
            {fogMode ? <Eye className="w-4 h-4 mr-1" /> : <EyeOff className="w-4 h-4 mr-1" />}
            {fogMode ? 'Fog: Click to toggle' : 'Toggle Fog'}
          </Button>
          <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
            <DialogTrigger asChild><Button variant="secondary" size="sm"><Settings className="w-4 h-4 mr-1" /> Grid Size</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Grid Settings</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div><Label>Width</Label><Input type="number" value={state.gridWidth} min={5} max={40} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const ns = { ...state, gridWidth: Math.min(40, Math.max(5, parseInt(e.target.value) || 20)) }; setState(ns); }} className="mt-1" /></div>
                <div><Label>Height</Label><Input type="number" value={state.gridHeight} min={5} max={40} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const ns = { ...state, gridHeight: Math.min(40, Math.max(5, parseInt(e.target.value) || 20)) }; setState(ns); }} className="mt-1" /></div>
              </div>
              <Button onClick={() => { save(state); setSettingsOpen(false); toast.success('Grid updated'); }} className="w-full mt-3">Save</Button>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* Player live-update controls (DM view is always current) */}
      {!isDM && (
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => load()}>
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
          <span className="text-xs text-muted-foreground">Map updates live as the DM moves things</span>
        </div>
      )}

      {/* Token list */}
      {isDM && (state?.tokens ?? []).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {(state?.tokens ?? []).map((t: Token) => (
            <div key={t.id} className="flex items-center gap-1 bg-card px-2 py-1 rounded border border-border text-xs">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: t.color }} />
              <span>{t?.label ?? '?'}</span>
              <button onClick={() => removeToken(t.id)} className="text-destructive hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
      )}

      {/* Grid */}
      <div className="overflow-auto rounded-lg border border-border bg-card" style={{ boxShadow: 'var(--shadow-md)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${gw}, ${cellSize}px)`, gap: '1px', padding: '4px', backgroundColor: 'hsl(33 26% 52%)' }}>
          {Array.from({ length: gh }, (_, row) =>
            Array.from({ length: gw }, (_, col) => {
              const fogged = isFogged(col, row);
              const tokensHere = (state?.tokens ?? []).filter((t: Token) => t.x === col && t.y === row);
              const showFog = !isDM && fogged;

              return (
                <div key={`${col}-${row}`}
                  onClick={() => handleCellClick(col, row)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(col, row)}
                  className={`relative flex items-center justify-center transition-colors ${
                    showFog ? 'bg-background' : 'bg-card hover:bg-muted/50'
                  } ${isDM && fogged ? 'bg-background/60' : ''}`}
                  style={{ width: cellSize, height: cellSize, cursor: isDM ? 'pointer' : 'default' }}>
                  {!showFog && tokensHere.map((t: Token) => (
                    <div key={t.id}
                      draggable={isDM}
                      onDragStart={() => setDragging(t.id)}
                      className="absolute inset-0.5 rounded-full flex items-center justify-center text-[10px] font-bold text-white cursor-grab shadow-md"
                      style={{ backgroundColor: t.color, fontSize: cellSize < 25 ? '8px' : '10px' }}>
                      {t?.label?.[0] ?? '?'}
                    </div>
                  ))}
                  {isDM && fogged && !showFog && (
                    <div className="absolute inset-0 bg-background/40 pointer-events-none" />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
