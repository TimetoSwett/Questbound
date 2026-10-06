'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Save, Plus, Trash2, Eye, EyeOff, Settings, RefreshCw, ImagePlus, X, ListOrdered, ChevronDown, ChevronRight, SkipBack, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { DiceRoller } from './dice-roller';

interface Token { id: string; label: string; color: string; x: number; y: number; size: number; characterId?: string; characterName?: string; }
interface Highlight { id: string; x: number; y: number; w: number; h: number; color: string; label: string; }
interface TurnEntry { id: string; label: string; initiative: number; characterId?: string; }
interface BattleState { gridWidth: number; gridHeight: number; tokens: Token[]; highlights: Highlight[]; fog: string[]; backgroundImage: string | null; turnOrder: TurnEntry[]; activeId: string | null; }

const TOKEN_COLORS = ['#D4A547', '#E04040', '#40A040', '#60B5FF', '#C080D0', '#FF9149', '#FF6363', '#80D8C3'];

// PF1e creature footprints in grid squares (Tiny takes half a square)
const CREATURE_SIZES = [
  { label: 'Tiny or smaller', footprint: 0.5 },
  { label: 'Small', footprint: 1 },
  { label: 'Medium', footprint: 1 },
  { label: 'Large (2×2)', footprint: 2 },
  { label: 'Huge (3×3)', footprint: 3 },
  { label: 'Gargantuan (4×4)', footprint: 4 },
  { label: 'Colossal (6×6)', footprint: 6 },
];

const EMPTY_BATTLE: BattleState = { gridWidth: 20, gridHeight: 20, tokens: [], highlights: [], fog: [], backgroundImage: null, turnOrder: [], activeId: null };

function sortTurns(turns: TurnEntry[]): TurnEntry[] {
  return [...turns].sort((a, b) => (b.initiative - a.initiative) || a.label.localeCompare(b.label));
}

export function BattleMapView({ campaignId, isDM }: { campaignId: string; isDM: boolean }) {
  const [state, setState] = useState<BattleState>(EMPTY_BATTLE);
  const [dragging, setDragging] = useState<string | null>(null);
  const [fogMode, setFogMode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newToken, setNewToken] = useState({ label: '', color: TOKEN_COLORS[0], size: 'Medium', characterId: '', characterName: '' });
  const [newTokenOpen, setNewTokenOpen] = useState(false);
  const [chars, setChars] = useState<Array<{ id: string; name: string }>>([]);
  const [initOpen, setInitOpen] = useState(true);
  const [newEntry, setNewEntry] = useState({ label: '', initiative: '' });

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
        backgroundImage: d?.backgroundImage ?? null,
        turnOrder: d?.turnOrder ?? [],
        activeId: d?.activeId ?? null,
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

  // Character list for the "link character" dropdown (DM only)
  useEffect(() => {
    if (!newTokenOpen || !isDM) return;
    fetch(`/api/characters?campaignId=${campaignId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setChars(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [newTokenOpen, isDM, campaignId]);

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
      size: CREATURE_SIZES.find((cs) => cs.label === newToken.size)?.footprint ?? 1,
      ...(newToken.characterId ? { characterId: newToken.characterId, characterName: newToken.characterName } : {}),
    };
    const ns = { ...state, tokens: [...(state?.tokens ?? []), t] };
    setState(ns);
    save(ns);
    setNewTokenOpen(false);
    setNewToken({ label: '', color: TOKEN_COLORS[0], size: 'Medium', characterId: '', characterName: '' });
    toast.success('Token added');
  };

  const removeToken = (id: string) => {
    const ns = { ...state, tokens: (state?.tokens ?? []).filter((t: Token) => t.id !== id) };
    setState(ns);
    save(ns);
  };

  const uploadBackground = async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    const upRes = await fetch('/api/upload', { method: 'POST', body: form });
    if (!upRes.ok) { toast.error('Upload failed'); return; }
    const { cloud_storage_path } = await upRes.json();
    const ns = { ...state, backgroundImage: cloud_storage_path };
    setState(ns);
    save(ns);
    toast.success('Background uploaded!');
  };

  const removeBackground = () => {
    const ns = { ...state, backgroundImage: null };
    setState(ns);
    save(ns);
  };

  // ---- Initiative tracker ----
  const sortedTurns = sortTurns(state?.turnOrder ?? []);

  // Persist a turn order, guarding activeId against removed entries
  const commitTurns = (turnOrder: TurnEntry[], activeId: string | null) => {
    const sorted = sortTurns(turnOrder);
    const safeActive = sorted.some((e) => e.id === activeId) ? activeId : (sorted[0]?.id ?? null);
    const ns = { ...state, turnOrder, activeId: safeActive };
    setState(ns);
    save(ns);
  };

  const addManualEntry = () => {
    if (!newEntry.label.trim()) { toast.error('Enter a name'); return; }
    const e: TurnEntry = {
      id: `te_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      label: newEntry.label.trim(),
      initiative: parseInt(newEntry.initiative) || 0,
    };
    commitTurns([...(state?.turnOrder ?? []), e], state?.activeId ?? null);
    setNewEntry({ label: '', initiative: '' });
  };

  const addTokensToOrder = () => {
    const order = state?.turnOrder ?? [];
    const fresh: TurnEntry[] = (state?.tokens ?? [])
      .filter((t: Token) => {
        if (t.characterId) return !order.some((e) => e.characterId === t.characterId);
        return !order.some((e) => !e.characterId && e.label === t.label);
      })
      .map((t: Token) => ({
        id: `te_${Date.now()}_${t.id}`,
        label: t.characterName ?? t.label,
        initiative: 0,
        ...(t.characterId ? { characterId: t.characterId } : {}),
      }));
    if (!fresh.length) { toast.success('All tokens already in the order'); return; }
    commitTurns([...order, ...fresh], state?.activeId ?? null);
    toast.success(`Added ${fresh.length} to initiative`);
  };

  const removeEntry = (id: string) => {
    commitTurns((state?.turnOrder ?? []).filter((e) => e.id !== id), state?.activeId ?? null);
  };

  const stepTurn = (dir: 1 | -1) => {
    if (!sortedTurns.length) return;
    const idx = Math.max(0, sortedTurns.findIndex((e) => e.id === state?.activeId));
    const next = sortedTurns[(idx + dir + sortedTurns.length) % sortedTurns.length];
    const ns = { ...state, activeId: next.id };
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
                  <Label>Link character (optional)</Label>
                  <select value={newToken.characterId} onChange={(e) => {
                    const c = chars.find((x) => x.id === e.target.value);
                    setNewToken({ ...newToken, characterId: c?.id ?? '', characterName: c?.name ?? '', label: c ? c.name : newToken.label });
                  }} className="mt-1 h-8 w-full rounded-md bg-card border border-input px-2 text-sm">
                    <option value="">— none —</option>
                    {chars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
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
                <div><Label>Size</Label><select value={newToken.size} onChange={(e) => setNewToken({ ...newToken, size: e.target.value })} className="mt-1 h-8 w-full rounded-md bg-card border border-input px-2 text-sm">
                  {CREATURE_SIZES.map((s) => <option key={s.label} value={s.label}>{s.label}</option>)}
                </select></div>
                <Button onClick={addToken} className="w-full">Add</Button>
              </div>
            </DialogContent>
          </Dialog>
          <DiceRoller />
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
          <label className="cursor-pointer">
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target?.files?.[0]; if (f) uploadBackground(f); e.target.value = ''; }} />
            <Button variant="secondary" size="sm" asChild><span><ImagePlus className="w-4 h-4 mr-1" /> Background</span></Button>
          </label>
          {state?.backgroundImage && (
            <Button variant="secondary" size="sm" onClick={removeBackground}>
              <X className="w-4 h-4 mr-1" /> Remove bg
            </Button>
          )}
        </div>
      )}

      {/* Player live-update controls (DM view is always current) */}
      {!isDM && (
        <div className="flex items-center gap-2">
          <DiceRoller />
          <Button variant="secondary" size="sm" onClick={() => load()}>
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
          <span className="text-xs text-muted-foreground">Map updates live as the DM moves things</span>
        </div>
      )}

      {/* Initiative tracker */}
      {isDM ? (
        <div className="rounded-lg border border-border bg-card">
          <button onClick={() => setInitOpen((v) => !v)} className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium hover:bg-muted/40 rounded-lg">
            <span className="flex items-center gap-2"><ListOrdered className="w-4 h-4" /> Initiative{sortedTurns.length > 0 && <span className="text-xs text-muted-foreground">({sortedTurns.length})</span>}</span>
            {initOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          {initOpen && (
            <div className="px-3 pb-3 space-y-2">
              <div className="flex gap-2">
                <Input placeholder="Name" value={newEntry.label} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewEntry({ ...newEntry, label: e.target.value })} className="h-8 text-sm" />
                <Input type="number" placeholder="Init" value={newEntry.initiative} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewEntry({ ...newEntry, initiative: e.target.value })} className="h-8 text-sm w-20" />
                <Button size="sm" onClick={addManualEntry} title="Add entry"><Plus className="w-4 h-4" /></Button>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="secondary" onClick={addTokensToOrder}>Add tokens</Button>
                <Button size="sm" variant="secondary" onClick={() => stepTurn(-1)} disabled={!sortedTurns.length}><SkipBack className="w-4 h-4 mr-1" /> Prev</Button>
                <Button size="sm" variant="secondary" onClick={() => stepTurn(1)} disabled={!sortedTurns.length}>Next <SkipForward className="w-4 h-4 ml-1" /></Button>
                <Button size="sm" variant="ghost" onClick={() => commitTurns([], null)}>Clear</Button>
              </div>
              <div className="space-y-1">
                {sortedTurns.map((e) => (
                  <div key={e.id} className={`flex items-center gap-2 px-2 py-1 rounded text-sm ${e.id === state?.activeId ? 'bg-primary/20 font-semibold' : 'bg-muted/30'}`}>
                    <span className="font-mono w-8 text-center">{e.initiative}</span>
                    <span className="flex-1 truncate" title={e.label}>{e.label}</span>
                    {e.id === state?.activeId && <span className="text-[10px] uppercase tracking-wide text-primary">active</span>}
                    <button onClick={() => removeEntry(e.id)} className="text-destructive hover:text-red-400" title="Remove"><Trash2 className="w-3 h-3" /></button>
                  </div>
                ))}
                {!sortedTurns.length && <p className="text-xs text-muted-foreground">No entries yet — add combatants above.</p>}
              </div>
            </div>
          )}
        </div>
      ) : (
        sortedTurns.length > 0 && (
          <div className="rounded-lg border border-border bg-card px-3 py-2">
            <p className="text-sm font-medium flex items-center gap-2 mb-1"><ListOrdered className="w-4 h-4" /> Initiative</p>
            <div className="space-y-1">
              {sortedTurns.map((e) => (
                <div key={e.id} className={`flex items-center gap-2 px-2 py-1 rounded text-sm ${e.id === state?.activeId ? 'bg-primary/20 font-semibold' : ''}`}>
                  <span className="font-mono w-8 text-center">{e.initiative}</span>
                  <span className="flex-1 truncate">{e.label}</span>
                  {e.id === state?.activeId && <span className="text-[10px] uppercase tracking-wide text-primary">active</span>}
                </div>
              ))}
            </div>
          </div>
        )
      )}

      {/* Token list */}
      {isDM && (state?.tokens ?? []).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {(state?.tokens ?? []).map((t: Token) => (
            <div key={t.id} className="flex items-center gap-1 bg-card px-2 py-1 rounded border border-border text-xs">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: t.color }} />
              <span>{t?.characterName ?? t?.label ?? '?'}</span>
              <button onClick={() => removeToken(t.id)} className="text-destructive hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
      )}

      {/* Grid */}
      <div className="overflow-auto rounded-lg border border-border bg-card" style={{ boxShadow: 'var(--shadow-md)' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${gw}, ${cellSize}px)`,
          gap: '1px',
          padding: '4px',
          backgroundColor: 'hsl(33 26% 52%)',
          ...(state?.backgroundImage ? {
            backgroundImage: `url(/api/files/${state.backgroundImage})`,
            backgroundSize: `${gw * cellSize + (gw - 1)}px ${gh * cellSize + (gh - 1)}px`,
            backgroundPosition: '4px 4px',
            backgroundRepeat: 'no-repeat',
          } : {}),
        }}>
          {Array.from({ length: gh }, (_, row) =>
            Array.from({ length: gw }, (_, col) => {
              const fogged = isFogged(col, row);
              const tokensHere = (state?.tokens ?? []).filter((t: Token) => t.x === col && t.y === row);
              const showFog = !isDM && fogged;
              const hasBg = !!state?.backgroundImage;

              return (
                <div key={`${col}-${row}`}
                  onClick={() => handleCellClick(col, row)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(col, row)}
                  className={`relative flex items-center justify-center transition-colors ${
                    showFog
                      ? 'bg-background'
                      : isDM && fogged
                        ? 'bg-background/60'
                        : hasBg
                          ? 'bg-transparent hover:bg-white/10'
                          : 'bg-card hover:bg-muted/50'
                  }`}
                  style={{
                    width: cellSize,
                    height: cellSize,
                    cursor: isDM ? 'pointer' : 'default',
                    ...(hasBg ? { boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.35)' } : {}),
                  }}>
                  {!showFog && tokensHere.map((t: Token) => {
                    const fp = t.size || 1;
                    const dim = fp >= 1 ? fp * cellSize + (fp - 1) : cellSize / 2;
                    const off = fp >= 1 ? 0 : cellSize / 4;
                    return (
                      <div key={t.id}
                        draggable={isDM}
                        onDragStart={() => setDragging(t.id)}
                        title={t.characterName ?? undefined}
                        className="absolute z-10 rounded-full flex items-center justify-center font-bold text-white cursor-grab shadow-md"
                        style={{
                          backgroundColor: t.color,
                          width: dim,
                          height: dim,
                          left: off,
                          top: off,
                          fontSize: dim < 25 ? '8px' : dim < 48 ? '12px' : '16px',
                        }}>
                        {t?.label?.[0] ?? '?'}
                      </div>
                    );
                  })}
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
