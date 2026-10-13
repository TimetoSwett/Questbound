'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Plus, Trash2, Eye, EyeOff, Settings, RefreshCw, ImagePlus, X, ListOrdered, SkipBack, SkipForward, Ruler, MonitorUp, Skull, Heart, Minus, Check, Tag, ChevronDown, ChevronRight, Undo2, Redo2, Pencil, Eraser, Type, MapPin, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { DiceRoller } from './dice-roller';
import { useCampaignTopic, type CampaignEvent } from '@/hooks/use-campaign-events';

interface Token { hidden?: boolean; id: string; label: string; color: string; x: number; y: number; size: number; characterId?: string; characterName?: string; portraitKey?: string; hp?: number; maxHp?: number; conditions?: string[]; creatureId?: string; }
interface Highlight { id: string; x: number; y: number; w: number; h: number; color: string; label: string; }
interface TurnEntry { id: string; label: string; initiative: number; characterId?: string; tokenId?: string; }
interface Encounter { id: string; name: string; tokens: Token[]; }
interface DrawStroke { id: string; color: string; points: Array<{ x: number; y: number }>; }
interface MapText { id: string; x: number; y: number; text: string; color: string; }
interface BattlePin { id: string; x: number; y: number; label?: string; wikiArticleId?: string; wikiArticle?: { id: string; title: string } | null; }
interface SnapshotState { gridWidth: number; gridHeight: number; tokens: Token[]; highlights: Highlight[]; fog: string[]; backgroundImage: string | null; turnOrder: TurnEntry[]; activeId: string | null; feetPerSquare: number; cellNumbers: boolean; handout: { key: string; pushedAt: number } | null; drawings: DrawStroke[]; texts: MapText[]; pins: BattlePin[]; }
interface Snapshot { id: string; name: string; createdAt: number; state: SnapshotState; }
interface BattleState { gridWidth: number; gridHeight: number; tokens: Token[]; highlights: Highlight[]; fog: string[]; backgroundImage: string | null; turnOrder: TurnEntry[]; activeId: string | null; feetPerSquare: number; cellNumbers: boolean; handout: { key: string; pushedAt: number } | null; encounters: Encounter[]; snapshots: Snapshot[]; drawings: DrawStroke[]; texts: MapText[]; pins: BattlePin[]; }

const TOKEN_COLORS = ['#D4A547', '#E04040', '#40A040', '#60B5FF', '#C080D0', '#FF9149', '#FF6363', '#80D8C3'];

// Preset colors for freehand drawing / text annotations
const DRAW_COLORS = [
  { name: 'Red', value: '#ef4444' },
  { name: 'White', value: '#ffffff' },
  { name: 'Yellow', value: '#fbbf24' },
  { name: 'Blue', value: '#60a5fa' },
];

// Undo/redo history depth for DM map edits (client-side only).
const MAX_HISTORY = 50;

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

// Parse optional HP inputs from the Add Token dialog. Returns {} when Max HP is blank/invalid (no tracking).
function parseTokenHp(hpStr: string, maxHpStr: string): Partial<Pick<Token, 'hp' | 'maxHp'>> {
  const maxHp = parseInt(maxHpStr, 10);
  if (!Number.isFinite(maxHp) || maxHp <= 0) return {};
  const hpRaw = parseInt(hpStr, 10);
  const hp = Number.isFinite(hpRaw) ? Math.max(0, Math.min(maxHp, hpRaw)) : maxHp;
  return { hp, maxHp };
}

// PF1e: feet per 5-ft square (v1.1 step 3 will make this a per-map setting)
const DEFAULT_FEET_PER_SQUARE = 5;

// PF1e diagonal movement: 1-2-1-2 counting (first diagonal 5 ft, second 10 ft, alternating)
function measureDistance(sx: number, sy: number, ex: number, ey: number, feetPerSquare: number = DEFAULT_FEET_PER_SQUARE): { squares: number; feet: number } {
  const dx = Math.abs(ex - sx);
  const dy = Math.abs(ey - sy);
  const diag = Math.min(dx, dy);
  const straight = Math.abs(dx - dy);
  const squares = straight + diag + Math.floor(diag / 2);
  return { squares, feet: squares * feetPerSquare };
}

// Standard PF1e combat conditions (Energy Drained / Incorporeal omitted — rarely tracked at the table)
const PF1E_CONDITIONS = [
  'Bleed', 'Blinded', 'Confused', 'Cowering', 'Dazed', 'Dazzled', 'Dead', 'Deafened',
  'Disabled', 'Dying', 'Entangled', 'Exhausted', 'Fascinated', 'Fatigued', 'Frightened',
  'Grappled', 'Helpless', 'Invisible', 'Nauseated', 'Panicked', 'Paralyzed', 'Petrified',
  'Pinned', 'Prone', 'Shaken', 'Sickened', 'Stable', 'Staggered', 'Stunned', 'Unconscious',
];

// Recognizable short labels for the tiny on-token badges
const COND_SHORT: Record<string, string> = {
  Bleed: 'Bld', Blinded: 'Blind', Confused: 'Conf', Cowering: 'Cow', Dazed: 'Daze',
  Dazzled: 'Dazz', Dead: 'Dead', Deafened: 'Deaf', Disabled: 'Dis', Dying: 'Dyng',
  Entangled: 'Ent', Exhausted: 'Exh', Fascinated: 'Fasc', Fatigued: 'Fatg',
  Frightened: 'Fright', Grappled: 'Grap', Helpless: 'Help', Invisible: 'Inv',
  Nauseated: 'Nau', Panicked: 'Panic', Paralyzed: 'Par', Petrified: 'Petr',
  Pinned: 'Pin', Prone: 'Prone', Shaken: 'Shak', Sickened: 'Sick', Stable: 'Stbl',
  Staggered: 'Stag', Stunned: 'Stun', Unconscious: 'Unc',
};

// Spreadsheet-style column letters: 0 -> A, 25 -> Z, 26 -> AA, 27 -> AB, ...
function colLabel(col: number): string {
  let label = '';
  let n = col;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

const EMPTY_BATTLE: BattleState = { gridWidth: 20, gridHeight: 20, tokens: [], highlights: [], fog: [], backgroundImage: null, turnOrder: [], activeId: null, feetPerSquare: 5, cellNumbers: true, handout: null, encounters: [], snapshots: [], drawings: [], texts: [], pins: [] };

function sortTurns(turns: TurnEntry[]): TurnEntry[] {
  return [...turns].sort((a, b) => (b.initiative - a.initiative) || a.label.localeCompare(b.label));
}

interface PaletteCreature { id: string; name: string; size: string; portraitPath: string | null; hpMax: number; }

// Creature size label -> grid footprint.
function creatureFootprint(size: string): number {
  switch ((size || '').toLowerCase()) {
    case 'tiny': return 0.5;
    case 'small': return 1;
    case 'medium': return 1;
    case 'large': return 2;
    case 'huge': return 3;
    case 'gargantuan': return 4;
    case 'colossal': return 6;
    default: return 1;
  }
}

// Build a fresh token linked to a bestiary creature. HP is per-token: every
// token tracks its own current HP independently of the creature (so three
// goblins get three separate health bars).
function tokenFromCreature(c: PaletteCreature, x: number, y: number): Token {
  const t: Token = {
    id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    label: c.name || 'Creature',
    color: TOKEN_COLORS[Math.floor(Math.random() * TOKEN_COLORS.length)],
    x, y,
    size: creatureFootprint(c.size),
    creatureId: c.id,
  };
  if (c.portraitPath) t.portraitKey = c.portraitPath;
  if (Number.isFinite(c.hpMax) && c.hpMax > 0) { t.hp = c.hpMax; t.maxHp = c.hpMax; }
  return t;
}

// Allocate persisted IDs only when an edit creates a new map entity.
function createBattleId(prefix: string, randomLength?: number): string {
  const id = `${prefix}_${Date.now()}`;
  return randomLength ? `${id}_${Math.random().toString(36).slice(2, 2 + randomLength)}` : id;
}

function createSnapshot(name: string, state: SnapshotState): Snapshot {
  return { id: createBattleId('snap'), name, createdAt: Date.now(), state };
}

function createHandout(key: string): NonNullable<BattleState['handout']> {
  return { key, pushedAt: Date.now() };
}

function cloneEncounterTokens(tokens: Token[]): Token[] {
  const batchId = createBattleId('t');
  // Each spawn resets HP and conditions and drops PC links.
  return tokens.map((t, i) => ({
    id: `${batchId}_${i}`, label: t.label, color: t.color,
    x: t.x, y: t.y, size: t.size,
    hp: t.maxHp != null ? t.maxHp : t.hp, maxHp: t.maxHp, conditions: [],
    ...(t.portraitKey ? { portraitKey: t.portraitKey } : {}),
    ...(t.creatureId ? { creatureId: t.creatureId } : {}),
  }));
}

export function BattleMapView({ campaignId, isDM, onOpenWikiPage }: { campaignId: string; isDM: boolean; onOpenWikiPage?: (pageId: string) => void }) {
  const router = useRouter();
  const [state, setState] = useState<BattleState>(EMPTY_BATTLE);
  const [dragging, setDragging] = useState<string | null>(null);
  const [fogMode, setFogMode] = useState(false);
  const [rulerMode, setRulerMode] = useState(false);
  const [pinMode, setPinMode] = useState(false);
  const [pinDialog, setPinDialog] = useState<{ pin: BattlePin; mode: 'edit' | 'view'; isNew: boolean } | null>(null);
  const [pinLabel, setPinLabel] = useState('');
  const [pinArticleId, setPinArticleId] = useState('');
  const [wikiPages, setWikiPages] = useState<Array<{ id: string; title: string; visibility: string }>>([]);
  const [drawTool, setDrawTool] = useState<'pen' | 'eraser' | 'text' | null>(null);
  const [drawColor, setDrawColor] = useState('#ef4444');
  const [drawing, setDrawing] = useState<Array<{ x: number; y: number }> | null>(null);
  const [eraseIds, setEraseIds] = useState<string[]>([]);
  const [textDraft, setTextDraft] = useState<{ id?: string; x: number; y: number; text: string; color: string } | null>(null);
  const penDownRef = useRef(false);
  const drawingPtsRef = useRef<Array<{ x: number; y: number }>>([]);
  const erasingRef = useRef(false);
  const eraseIdsRef = useRef<Set<string>>(new Set());
  const [ruler, setRuler] = useState<{ sx: number; sy: number; ex: number; ey: number } | null>(null);
  const [dragRuler, setDragRuler] = useState<{ sx: number; sy: number; ex: number; ey: number } | null>(null);
  const measuringRef = useRef(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newToken, setNewToken] = useState({ label: '', color: TOKEN_COLORS[0], size: 'Medium', characterId: '', characterName: '', hp: '', maxHp: '' });
  const [hpEditId, setHpEditId] = useState<string | null>(null);
  const justDraggedRef = useRef(false);

  // --- Creature linking (bestiary -> battle map) ---
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteCreatures, setPaletteCreatures] = useState<PaletteCreature[]>([]);
  const [paletteLoaded, setPaletteLoaded] = useState(false);
  const [encCreatureId, setEncCreatureId] = useState('');
  const [encCreatureCount, setEncCreatureCount] = useState(3);

  const ensurePalette = async () => {
    if (paletteLoaded) return;
    try {
      const res = await fetch(`/api/creatures?campaignId=${campaignId}`);
      if (!res.ok) return;
      const data = await res.json();
      setPaletteCreatures(Array.isArray(data) ? data : []);
      setPaletteLoaded(true);
    } catch { /* ignore */ }
  };

  const dropCreatureToken = async (c: PaletteCreature, x: number, y: number) => {
    if (!isDM || !c?.id) return;
    const ns = { ...state, tokens: [...(state?.tokens ?? []), tokenFromCreature(c, x, y)] };
    await commitState(ns);
    toast.success(`Added ${c.name || 'creature'} to the map`);
  };

  // Encounter builder: spawn N linked tokens straight from the Bestiary.
  const spawnCreaturesFromBestiary = async () => {
    if (!isDM) return;
    const c = paletteCreatures.find((p) => p.id === encCreatureId);
    if (!c) { toast.error('Choose a creature'); return; }
    const n = Math.max(1, Math.min(12, parseInt(String(encCreatureCount), 10) || 1));
    const gw = state?.gridWidth ?? 20;
    const tokens: Token[] = [];
    for (let i = 0; i < n; i++) {
      const t = tokenFromCreature(c, (i * 2) % gw, Math.floor((i * 2) / gw) % (state?.gridHeight ?? 20));
      t.id = `${t.id}_${i}`;
      tokens.push(t);
    }
    const ns = { ...state, tokens: [...(state?.tokens ?? []), ...tokens] };
    await commitState(ns);
    toast.success(`Spawned ${n} × ${c.name || 'creature'}`);
  };

  // Clicking a linked token: GMs get the stat block; players get the same
  // reveal-level card as the Bestiary (server-enforced; hidden creatures 404).
  const openLinkedCreature = async (t: Token) => {
    const cid = t.creatureId;
    if (!cid || justDraggedRef.current) return;
    if (isDM) {
      router.push(`/campaign/${campaignId}/bestiary/${cid}`);
      return;
    }
    try {
      const res = await fetch(`/api/creatures?id=${cid}`);
      if (!res.ok) { toast.error('That creature is unknown to the party'); return; }
      router.push(`/campaign/${campaignId}/bestiary/${cid}`);
    } catch {
      toast.error('Could not open creature');
    }
  };
  const [newTokenOpen, setNewTokenOpen] = useState(false);
  const [chars, setChars] = useState<Array<{ id: string; name: string }>>([]);
  const [newEntry, setNewEntry] = useState({ label: '', initiative: '' });
  const [myCharIds, setMyCharIds] = useState<string[]>([]);
  const [encOpen, setEncOpen] = useState(false);
  const [encNameOpen, setEncNameOpen] = useState(false);
  const [encName, setEncName] = useState('');
  const [snapOpen, setSnapOpen] = useState(false);
  const [snapNameOpen, setSnapNameOpen] = useState(false);
  const [snapName, setSnapName] = useState('');
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const [past, setPast] = useState<string[]>([]);
  const [future, setFuture] = useState<string[]>([]);
  const settingsBeforeRef = useRef<string | null>(null);

  // Optimistic-concurrency bookkeeping for DM saves: the server version we
  // last saw, the tokens as of that version (merge base), and a queue so
  // saves go out one at a time.
  const versionRef = useRef(0);
  const baseTokensRef = useRef<Token[]>([]);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingSavesRef = useRef(0);
  // DM only: while a dialog/popover is open on the map, live refetches are
  // deferred (flag only; on close we refetch, which yields the latest state).
  const dmDialogOpenRef = useRef(false);
  const deferredLiveRef = useRef(false);
  const liveLoadRef = useRef<() => void>(() => {});

  const fetchBattle = useCallback(async () => {
    const res = await fetch(`/api/maps/battle?campaignId=${campaignId}`);
    return res.ok ? res.json() : null;
  }, [campaignId]);

  const applyBattle = useCallback((d: any) => {
    if (!d) return;
    versionRef.current = Number.isInteger(d?.version) ? d.version : 0;
    baseTokensRef.current = d?.tokens ?? [];
    setState({
      gridWidth: d?.gridWidth ?? 20,
      gridHeight: d?.gridHeight ?? 20,
      tokens: d?.tokens ?? [],
      highlights: d?.highlights ?? [],
      fog: d?.fog ?? [],
      backgroundImage: d?.backgroundImage ?? null,
      turnOrder: d?.turnOrder ?? [],
      activeId: d?.activeId ?? null,
      feetPerSquare: d?.feetPerSquare ?? 5,
      cellNumbers: d?.cellNumbers ?? true,
      handout: d?.handout ?? null,
      encounters: d?.encounters ?? [],
      snapshots: d?.snapshots ?? [],
      drawings: d?.drawings ?? [],
      texts: d?.texts ?? [],
      pins: d?.pins ?? [],
    });
  }, []);

  const load = useCallback(() => fetchBattle().then(applyBattle), [fetchBattle, applyBattle]);

  useEffect(() => {
    let active = true;
    fetchBattle().then((d) => { if (active) applyBattle(d); });
    return () => { active = false; };
  }, [fetchBattle, applyBattle]);

  // Live updates for players: the DM's token moves and fog changes land
  // without a page refresh. The DM is the source of truth (every DM action
  // saves immediately), so only non-DM viewers poll.
  // Live refresh (SSE invalidation + fallback poll). Ignores stale versions;
  // the DM only adopts strictly newer server state and never while one of
  // their own saves is in flight (so queued saves keep their 409 merge path).
  // Players always re-apply: creature reveals change their filtered view
  // without bumping battleMapVersion.
  const liveLoad = useCallback(async (evt?: CampaignEvent) => {
    if (evt?.version !== undefined && evt.version <= versionRef.current) return;
    // Deferred (not dropped) while a DM save is in flight; replayed when saves settle.
    if (isDM && pendingSavesRef.current > 0) { deferredLiveRef.current = true; return; }
    if (isDM && dmDialogOpenRef.current) { deferredLiveRef.current = true; return; }
    const d = await fetchBattle();
    if (!d) return;
    if (isDM && dmDialogOpenRef.current) { deferredLiveRef.current = true; return; }
    const v = Number.isInteger(d?.version) ? d.version : 0;
    if (v < versionRef.current) return;
    if (isDM && pendingSavesRef.current > 0) { deferredLiveRef.current = true; return; }
    if (isDM && v === versionRef.current) return;
    applyBattle(d);
  }, [isDM, fetchBattle, applyBattle]);
  useEffect(() => { liveLoadRef.current = () => { void liveLoad(); }; }, [liveLoad]);
  const pollMs = useCampaignTopic(['battle'], liveLoad);
  useEffect(() => {
    if (pollMs === null) return; // stream paused (signed out / removed): no polling
    const id = setInterval(() => { liveLoad(); }, pollMs);
    return () => clearInterval(id);
  }, [pollMs, liveLoad]);

  // The player's own characters in this campaign (server scopes to owner
  // for non-DM), used to decide which tokens they may drag.
  useEffect(() => {
    if (isDM) return;
    fetch(`/api/characters?campaignId=${campaignId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setMyCharIds(Array.isArray(d) ? d.map((c: any) => c.id) : []))
      .catch(() => setMyCharIds([]));
  }, [isDM, campaignId]);

  // Escape exits ruler/draw/pin modes and cancels any in-progress annotation.
  useEffect(() => {
    if (!rulerMode && !drawTool && !pinMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setRulerMode(false); setRuler(null);
        setDrawTool(null); setDrawing(null);
        penDownRef.current = false; drawingPtsRef.current = [];
        erasingRef.current = false; eraseIdsRef.current = new Set(); setEraseIds([]);
        setTextDraft(null);
        setPinMode(false); setPinDialog(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rulerMode, drawTool, pinMode]);

  // Character list for the "link character" dropdown (DM only)
  useEffect(() => {
    if (!newTokenOpen || !isDM) return;
    fetch(`/api/characters?campaignId=${campaignId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setChars(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [newTokenOpen, isDM, campaignId]);

  const save = async (s: BattleState) => {
    // Strip server-resolved article titles: the blob stores id refs only; titles re-resolve on GET.
    const clean: BattleState = { ...s, pins: (s.pins ?? []).map((p) => { const { wikiArticle, ...rest } = p; return rest; }) };
    const run = async () => {
      let body = clean;
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await fetch('/api/maps/battle', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campaignId, state: body, version: versionRef.current }),
        });
        if (res.ok) {
          const d = await res.json().catch(() => ({}));
          if (Number.isInteger(d?.version)) versionRef.current = d.version;
          baseTokensRef.current = body.tokens ?? [];
          return;
        }
        if (res.status !== 409) { toast.error('Failed to save battle map'); return; }
        // Someone (usually a player moving their token) saved in between.
        // Refetch and keep their token moves for any token the DM didn't move.
        const cur = await fetch(`/api/maps/battle?campaignId=${campaignId}`);
        if (!cur.ok) { toast.error('Failed to save battle map'); return; }
        const d = await cur.json();
        const serverTokens: Token[] = d?.tokens ?? [];
        const base = new Map(baseTokensRef.current.map((t) => [t.id, t]));
        const srv = new Map(serverTokens.map((t) => [t.id, t]));
        const adopted = new Map<string, { x: number; y: number }>();
        const tokens = (body.tokens ?? []).map((t) => {
          const b = base.get(t.id); const sv = srv.get(t.id);
          if (b && sv && b.x === t.x && b.y === t.y && (sv.x !== t.x || sv.y !== t.y)) {
            adopted.set(t.id, { x: sv.x, y: sv.y });
            return { ...t, x: sv.x, y: sv.y };
          }
          return t;
        });
        body = { ...body, tokens };
        versionRef.current = Number.isInteger(d?.version) ? d.version : versionRef.current;
        baseTokensRef.current = serverTokens;
        if (adopted.size) setState((prev: BattleState) => ({ ...prev, tokens: (prev?.tokens ?? []).map((t) => (adopted.has(t.id) ? { ...t, ...adopted.get(t.id)! } : t)) }));
      }
      toast.error('Battle map is busy, please try again');
    };
    pendingSavesRef.current++;
    const tracked = async () => {
      try { await run(); } finally {
        pendingSavesRef.current--;
        // Replay a refetch deferred during the save, unless a dialog is still open
        // (then the dialog-close effect replays it).
        if (pendingSavesRef.current === 0 && deferredLiveRef.current && !dmDialogOpenRef.current) {
          deferredLiveRef.current = false;
          liveLoadRef.current();
        }
      }
    };
    saveQueueRef.current = saveQueueRef.current.then(tracked, tracked);
    await saveQueueRef.current;
  };

  // ---- Undo/redo for DM map edits (client-side only, DM-only) ----
  // Push a serialized "before" image onto the undo stack: deduped, capped, clears redo.
  const pushHistory = (snap: string) => {
    setPast((p) => {
      if (p.length && p[p.length - 1] === snap) return p;
      const np = [...p, snap];
      return np.length > MAX_HISTORY ? np.slice(np.length - MAX_HISTORY) : np;
    });
    setFuture([]);
  };

  // Central choke point for ALL DM mutations: record history, then apply + persist.
  // persistFirst: wait for the save before rendering, used when ns references
  // a freshly uploaded image (the file route only serves keys saved on a map).
  const commitState = async (ns: BattleState, opts?: { persistFirst?: boolean }) => {
    if (state) pushHistory(JSON.stringify(state));
    if (opts?.persistFirst) { await save(ns); setState(ns); return; }
    setState(ns);
    save(ns);
  };

  // The grid settings dialog live-edits state without saving; capture the
  // "before" image when the dialog opens so Save is a single undo unit.
  const commitSettings = () => {
    const before = settingsBeforeRef.current;
    const now = state ? JSON.stringify(state) : null;
    if (before && now && before !== now) pushHistory(before);
    if (state) save(state);
    setSettingsOpen(false);
    toast.success('Grid updated');
  };

  const undo = () => {
    if (!isDM || !past.length || !state) return;
    const snap = past[past.length - 1];
    setPast(past.slice(0, -1));
    setFuture((f) => [...f, JSON.stringify(state)]);
    const ns = JSON.parse(snap) as BattleState;
    setState(ns);
    save(ns);
  };

  const redo = () => {
    if (!isDM || !future.length || !state) return;
    const snap = future[future.length - 1];
    setFuture(future.slice(0, -1));
    setPast((p) => [...p, JSON.stringify(state)]);
    const ns = JSON.parse(snap) as BattleState;
    setState(ns);
    save(ns);
  };

  // Undo/redo deliberately bypass commitState (no history push) so redo keeps working.
  const undoRef = useRef<(() => void) | null>(null);
  const redoRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    undoRef.current = undo;
    redoRef.current = redo;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return;
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undoRef.current?.(); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redoRef.current?.(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const cellSize = Math.min(30, Math.floor(800 / (state?.gridWidth ?? 20)));
  const gw = state?.gridWidth ?? 20;
  const gh = state?.gridHeight ?? 20;

  const handleCellClick = (x: number, y: number) => {
    if (!isDM) return;
    if (rulerMode || drawTool) return;
    if (pinMode) { openPinEditor({ id: createBattleId('p'), x, y }, true); return; }
    if (fogMode) {
      const key = `${x},${y}`;
      const fog = [...(state?.fog ?? [])];
      const idx = fog.indexOf(key);
      if (idx >= 0) fog.splice(idx, 1);
      else fog.push(key);
      const ns = { ...state, fog };
      commitState(ns);
      return;
    }
  };

  const toggleFog = () => {
    if (!fogMode) { setRulerMode(false); setRuler(null); setDrawTool(null); setPinMode(false); }
    setFogMode(!fogMode);
  };

  const toggleRuler = () => {
    if (rulerMode) { setRulerMode(false); setRuler(null); }
    else { setFogMode(false); setDrawTool(null); setPinMode(false); setRulerMode(true); }
  };

  const toggleDrawTool = (tool: 'pen' | 'eraser' | 'text') => {
    if (drawTool === tool) {
      setDrawTool(null);
    } else {
      setFogMode(false);
      setRulerMode(false); setRuler(null);
      penDownRef.current = false; drawingPtsRef.current = []; setDrawing(null);
      erasingRef.current = false; eraseIdsRef.current = new Set(); setEraseIds([]);
      setTextDraft(null);
      setPinMode(false); setPinDialog(null);
      setDrawTool(tool);
    }
  };

  const togglePin = () => {
    if (pinMode) { setPinMode(false); setPinDialog(null); }
    else { setFogMode(false); setRulerMode(false); setRuler(null); setDrawTool(null); setPinMode(true); }
  };

  // ---- Battle-map note pins (DM only, all mutations undo/redo aware) ----
  const openPinEditor = (pin: BattlePin, isNew: boolean) => {
    setPinLabel(pin.label ?? '');
    setPinArticleId(pin.wikiArticleId ?? '');
    setPinDialog({ pin, mode: 'edit', isNew });
    if (isDM) {
      fetch(`/api/wiki?campaignId=${campaignId}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => setWikiPages((Array.isArray(d) ? d : []).map((pg: any) => ({ id: pg.id, title: pg.title ?? 'Untitled', visibility: pg.visibility ?? 'dm_only' }))))
        .catch(() => {});
    }
  };

  const savePin = () => {
    if (!pinDialog || !isDM || !state) return;
    const { pin, isNew } = pinDialog;
    const updated: BattlePin = { ...pin, label: pinLabel.trim(), wikiArticleId: pinArticleId || undefined };
    const pg = wikiPages.find((w) => w.id === updated.wikiArticleId);
    updated.wikiArticle = pg ? { id: pg.id, title: pg.title } : null;
    const pins = isNew ? [...(state.pins ?? []), updated] : (state.pins ?? []).map((p) => (p.id === updated.id ? updated : p));
    commitState({ ...state, pins });
    setPinDialog(null);
  };

  const deletePin = () => {
    if (!pinDialog || !isDM || !state) return;
    commitState({ ...state, pins: (state.pins ?? []).filter((p) => p.id !== pinDialog.pin.id) });
    setPinDialog(null);
  };

  const onPinMarkerClick = (p: BattlePin, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDM && pinMode) openPinEditor(p, false);
    else setPinDialog({ pin: p, mode: 'view', isNew: false });
  };

  // Cell under a pointer event on the grid container (4px padding, 1px gaps).
  const cellFromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const col = Math.max(0, Math.min(gw - 1, Math.floor((e.clientX - rect.left - 4) / (cellSize + 1))));
    const row = Math.max(0, Math.min(gh - 1, Math.floor((e.clientY - rect.top - 4) / (cellSize + 1))));
    return { col, row };
  };

  const onRulerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!rulerMode) return;
    const { col, row } = cellFromPointer(e);
    measuringRef.current = true;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    setRuler({ sx: col, sy: row, ex: col, ey: row });
  };

  const onRulerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!rulerMode || !measuringRef.current) return;
    const { col, row } = cellFromPointer(e);
    setRuler((r) => (r && (r.ex !== col || r.ey !== row) ? { ...r, ex: col, ey: row } : r));
  };

  const onRulerUp = () => { measuringRef.current = false; };

  // ---- Freehand drawing + text annotations (DM-only) ----
  // Pointer position in cell units (floats), so strokes stay correct at any cellSize.
  const drawPointFromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(gw, (e.clientX - rect.left - 4) / (cellSize + 1)));
    const y = Math.max(0, Math.min(gh, (e.clientY - rect.top - 4) / (cellSize + 1)));
    return { x, y };
  };

  // Eraser: collect ids of strokes with any point within ~0.5 cell of the pointer.
  const eraseAt = (pt: { x: number; y: number }) => {
    const hits: string[] = [];
    for (const s of state?.drawings ?? []) {
      if (eraseIdsRef.current.has(s.id)) continue;
      for (const p of s.points) {
        if (Math.hypot(p.x - pt.x, p.y - pt.y) < 0.55) { hits.push(s.id); break; }
      }
    }
    if (hits.length > 0) {
      hits.forEach((id) => eraseIdsRef.current.add(id));
      setEraseIds([...eraseIdsRef.current]);
    }
  };

  const onDrawDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drawTool || !isDM) return;
    if (drawTool === 'text') {
      const { x, y } = drawPointFromPointer(e);
      setTextDraft({ x, y, text: '', color: drawColor });
      return;
    }
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    if (drawTool === 'pen') {
      penDownRef.current = true;
      const pt = drawPointFromPointer(e);
      drawingPtsRef.current = [pt];
      setDrawing([pt]);
    } else if (drawTool === 'eraser') {
      erasingRef.current = true;
      eraseIdsRef.current = new Set();
      setEraseIds([]);
      eraseAt(drawPointFromPointer(e));
    }
  };

  const onDrawMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drawTool || !isDM) return;
    if (drawTool === 'pen' && penDownRef.current) {
      const pt = drawPointFromPointer(e);
      const pts = drawingPtsRef.current;
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(pt.x - last.x, pt.y - last.y) > 0.08) {
        drawingPtsRef.current = [...pts, pt];
        setDrawing(drawingPtsRef.current);
      }
    } else if (drawTool === 'eraser' && erasingRef.current) {
      eraseAt(drawPointFromPointer(e));
    }
  };

  // One undo unit per finished stroke (not per point).
  const onDrawUp = () => {
    if (drawTool === 'pen' && penDownRef.current) {
      penDownRef.current = false;
      const pts = drawingPtsRef.current;
      drawingPtsRef.current = [];
      setDrawing(null);
      if (pts.length > 0 && state) {
        const ns = { ...state, drawings: [...(state.drawings ?? []), { id: createBattleId('d'), color: drawColor, points: pts }] };
        commitState(ns);
      }
    }
    if (drawTool === 'eraser' && erasingRef.current) {
      erasingRef.current = false;
      const ids = eraseIdsRef.current;
      eraseIdsRef.current = new Set();
      setEraseIds([]);
      if (ids.size > 0 && state) {
        const ns = { ...state, drawings: (state.drawings ?? []).filter((s) => !ids.has(s.id)) };
        commitState(ns);
        toast.success(`Erased ${ids.size} ${ids.size === 1 ? 'stroke' : 'strokes'}`);
      }
    }
  };

  const onDrawCancel = () => {
    penDownRef.current = false;
    erasingRef.current = false;
    eraseIdsRef.current = new Set();
    setEraseIds([]);
    drawingPtsRef.current = [];
    setDrawing(null);
  };

  const saveTextDraft = () => {
    const td = textDraft;
    if (!td || !state) { setTextDraft(null); return; }
    const text = td.text.trim().slice(0, 60);
    if (!text) { setTextDraft(null); return; }
    let texts = [...(state.texts ?? [])];
    if (td.id) {
      texts = texts.map((t) => (t.id === td.id ? { ...t, text, color: td.color } : t));
    } else {
      texts.push({ id: createBattleId('txt'), x: td.x, y: td.y, text, color: td.color });
    }
    commitState({ ...state, texts });
    setTextDraft(null);
  };

  const deleteTextDraft = () => {
    const td = textDraft;
    if (!td?.id || !state) { setTextDraft(null); return; }
    commitState({ ...state, texts: (state.texts ?? []).filter((t) => t.id !== td.id) });
    setTextDraft(null);
    toast.success('Annotation deleted');
  };

  const isMyToken = (t: Token) => !!t.characterId && myCharIds.includes(t.characterId);

  // Foundry-style: show the ruler live while a token is being dragged.
  const onTokenDragStart = (t: Token) => {
    setDragging(t.id);
    setDragRuler({ sx: t.x, sy: t.y, ex: t.x, ey: t.y });
  };
  const onTokenDragEnd = () => {
    setDragging(null);
    setDragRuler(null);
    // Suppress the click that some browsers fire after a real drag.
    justDraggedRef.current = true;
    setTimeout(() => { justDraggedRef.current = false; }, 150);
  };

  const handleDrop = (x: number, y: number, e?: React.DragEvent) => {
    // Creature drop from the Bestiary palette (DM only).
    const cdata = e?.dataTransfer?.getData('application/x-questbound-creature');
    if (cdata) {
      if (!isDM) return;
      try {
        const c = JSON.parse(cdata) as PaletteCreature;
        if (c?.id) void dropCreatureToken(c, x, y);
      } catch { /* ignore malformed drops */ }
      return;
    }
    if (!dragging) return;
    const id = dragging;
    setDragging(null);
    setDragRuler(null);
    const token = (state?.tokens ?? []).find((t: Token) => t.id === id);
    if (!token) return;

    if (isDM) {
      const tokens = (state?.tokens ?? []).map((t: Token) => t.id === id ? { ...t, x, y } : t);
      const ns = { ...state, tokens };
      commitState(ns);
      return;
    }

    // Player: only their own character-linked tokens, via the move endpoint.
    if (!isMyToken(token)) { toast.error('You can only move your own token'); return; }
    const prev = { x: token.x, y: token.y };
    const revert = () => setState((s: BattleState) => ({
      ...s,
      tokens: (s?.tokens ?? []).map((t: Token) => t.id === id ? { ...t, ...prev } : t),
    }));
    setState((s: BattleState) => ({
      ...s,
      tokens: (s?.tokens ?? []).map((t: Token) => t.id === id ? { ...t, x, y } : t),
    }));
    fetch('/api/maps/battle/tokens', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId, tokenId: id, x, y }),
    }).then(async (r) => {
      if (!r.ok) {
        revert();
        const d = await r.json().catch(() => ({}));
        toast.error(d?.error ?? 'Move rejected');
      }
    }).catch(() => { revert(); toast.error('Move failed'); });
  };

  const [addingToken, setAddingToken] = useState(false);

  const addToken = async () => {
    if (!newToken.label) { toast.error('Enter a label'); return; }
    setAddingToken(true);
    let portraitKey: string | undefined;
    try {
      const el = document.getElementById('tokenPortraitFile') as HTMLInputElement | null;
      const file = el?.files?.[0];
      if (file) {
        const form = new FormData();
        form.append('file', file);
        const upRes = await fetch('/api/upload', { method: 'POST', body: form });
        if (!upRes.ok) { toast.error('Portrait upload failed'); setAddingToken(false); return; }
        const { cloud_storage_path } = await upRes.json();
        portraitKey = cloud_storage_path;
      }
    } catch {
      toast.error('Portrait upload failed'); setAddingToken(false); return;
    }
    const t: Token = {
      id: createBattleId('t'),
      label: newToken.label,
      color: newToken.color,
      x: 0, y: 0,
      size: CREATURE_SIZES.find((cs) => cs.label === newToken.size)?.footprint ?? 1,
      ...(newToken.characterId ? { characterId: newToken.characterId, characterName: newToken.characterName } : {}),
      ...(portraitKey ? { portraitKey } : {}),
      ...parseTokenHp(newToken.hp, newToken.maxHp),
    };
    const ns = { ...state, tokens: [...(state?.tokens ?? []), t] };
    await commitState(ns, { persistFirst: !!portraitKey });
    setNewTokenOpen(false);
    setNewToken({ label: '', color: TOKEN_COLORS[0], size: 'Medium', characterId: '', characterName: '', hp: '', maxHp: '' });
    setAddingToken(false);
    toast.success('Token added');
  };

  const removeToken = (id: string) => {
    const ns = { ...state, tokens: (state?.tokens ?? []).filter((t: Token) => t.id !== id) };
    commitState(ns);
  };

  const saveEncounter = () => {
    const tokens = state?.tokens ?? [];
    if (tokens.length === 0) { toast.error('No tokens on the map to save'); return; }
    const name = encName.trim();
    if (!name) { toast.error('Name the encounter first'); return; }
    const enc: Encounter = {
      id: createBattleId('enc'),
      name,
      tokens: JSON.parse(JSON.stringify(tokens)),
    };
    const ns = { ...state, encounters: [...(state?.encounters ?? []), enc] };
    commitState(ns);
    setEncName('');
    setEncNameOpen(false);
    toast.success(`Encounter "${name}" saved`);
  };

  const spawnEncounter = (id: string) => {
    const enc = (state?.encounters ?? []).find((e: Encounter) => e.id === id);
    if (!enc) { toast.error('Encounter not found'); return; }
    const clones = cloneEncounterTokens(enc.tokens);
    const ns = { ...state, tokens: [...(state?.tokens ?? []), ...clones] };
    commitState(ns);
    toast.success(`Spawned "${enc.name}" (${clones.length} token${clones.length === 1 ? '' : 's'})`);
  };

  const deleteEncounter = (id: string) => {
    const ns = { ...state, encounters: (state?.encounters ?? []).filter((e: Encounter) => e.id !== id) };
    commitState(ns);
    toast.success('Encounter deleted');
  };

  const SNAPSHOT_FIELDS = ['gridWidth', 'gridHeight', 'tokens', 'highlights', 'fog', 'backgroundImage', 'turnOrder', 'activeId', 'feetPerSquare', 'cellNumbers', 'handout', 'drawings', 'texts', 'pins'] as const;

  const saveSnapshot = () => {
    const name = snapName.trim();
    if (!name) { toast.error('Name the snapshot first'); return; }
    const s = state ?? EMPTY_BATTLE;
    const snapState: SnapshotState = JSON.parse(JSON.stringify(
      Object.fromEntries(SNAPSHOT_FIELDS.map((f) => [f, (s as any)[f]]))
    ));
    const snap: Snapshot = createSnapshot(name, snapState);
    const ns = { ...s, snapshots: [...(s.snapshots ?? []), snap] };
    commitState(ns);
    setSnapName('');
    setSnapNameOpen(false);
    toast.success(`Snapshot "${name}" saved`);
  };

  const restoreSnapshot = (id: string) => {
    const snap = (state?.snapshots ?? []).find((x: Snapshot) => x.id === id);
    if (!snap) { toast.error('Snapshot not found'); return; }
    if (confirmRestore !== id) {
      setConfirmRestore(id);
      toast('Click Restore again to confirm — this replaces the current map');
      return;
    }
    setConfirmRestore(null);
    const restored: SnapshotState = JSON.parse(JSON.stringify(snap.state));
    // Encounters and the snapshot library itself survive the restore untouched.
    const ns: BattleState = { ...EMPTY_BATTLE, ...restored, encounters: state?.encounters ?? [], snapshots: state?.snapshots ?? [] };
    commitState(ns);
    toast.success(`Restored snapshot "${snap.name}"`);
  };

  const deleteSnapshot = (id: string) => {
    const ns = { ...state, snapshots: (state?.snapshots ?? []).filter((x: Snapshot) => x.id !== id) };
    commitState(ns);
    if (confirmRestore === id) setConfirmRestore(null);
    toast.success('Snapshot deleted');
  };

  const setTokenPortrait = async (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    const upRes = await fetch('/api/upload', { method: 'POST', body: form });
    if (!upRes.ok) { toast.error('Portrait upload failed'); return; }
    const { cloud_storage_path } = await upRes.json();
    const ns = { ...state, tokens: (state?.tokens ?? []).map((tok: Token) => (tok.id === id ? { ...tok, portraitKey: cloud_storage_path } : tok)) };
    await commitState(ns, { persistFirst: true });
    toast.success('Portrait updated');
  };

  const clearTokenPortrait = (id: string) => {
    const ns = { ...state, tokens: (state?.tokens ?? []).map((tok: Token) => {
      if (tok.id !== id) return tok;
      const nt: Token = { ...tok };
      delete nt.portraitKey;
      return nt;
    }) };
    commitState(ns);
    toast.success('Portrait removed');
  };

  const setTokenHp = (id: string, hp: number, maxHp: number) => {
    const m = Math.max(0, Math.round(maxHp) || 0);
    const ns = {
      ...state,
      tokens: (state?.tokens ?? []).map((tok: Token) => {
        if (tok.id !== id) return tok;
        if (m <= 0) {
          const nt: Token = { ...tok };
          delete nt.hp;
          delete nt.maxHp;
          return nt;
        }
        return { ...tok, hp: Math.max(0, Math.min(m, Math.round(hp))), maxHp: m };
      }),
    };
    commitState(ns);
  };

  const adjustTokenHp = (id: string, delta: number) => {
    const t = (state?.tokens ?? []).find((tok: Token) => tok.id === id);
    if (!t || !(t.maxHp && t.maxHp > 0)) return;
    setTokenHp(id, (t.hp ?? t.maxHp) + delta, t.maxHp);
  };

  const [condOpenId, setCondOpenId] = useState<string | null>(null);

  const toggleTokenCondition = (id: string, cond: string) => {
    const ns = {
      ...state,
      tokens: (state?.tokens ?? []).map((tok: Token) => {
        if (tok.id !== id) return tok;
        const cur = tok.conditions ?? [];
        const next = cur.includes(cond) ? cur.filter((c) => c !== cond) : [...cur, cond];
        const nt: Token = { ...tok };
        if (next.length === 0) delete nt.conditions;
        else nt.conditions = next;
        return nt;
      }),
    };
    commitState(ns);
  };

  const uploadBackground = async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    const upRes = await fetch('/api/upload', { method: 'POST', body: form });
    if (!upRes.ok) { toast.error('Upload failed'); return; }
    const { cloud_storage_path } = await upRes.json();
    const ns = { ...state, backgroundImage: cloud_storage_path };
    await commitState(ns, { persistFirst: true });
    toast.success('Background uploaded!');
  };

  const removeBackground = () => {
    const ns = { ...state, backgroundImage: null };
    commitState(ns);
  };

  // ---- "Show to players" handout push (DM-only; persisted in battle state) ----
  const [handoutOpen, setHandoutOpen] = useState(false);
  const [pushingHandout, setPushingHandout] = useState(false);
  const [dismissedHandout, setDismissedHandout] = useState<number | null>(null);

  // Any DM dialog / popover / inline editor open on the map defers live updates.
  // The Bestiary, Encounters and Snapshots panels are side panels GMs leave expanded, not
  // editors; counting them held every player move until they were collapsed.
  const dmDialogOpen = isDM && !!(
    newTokenOpen || settingsOpen || handoutOpen || pinDialog ||
    encNameOpen || snapNameOpen || confirmRestore ||
    hpEditId || condOpenId || textDraft
  );
  useEffect(() => {
    dmDialogOpenRef.current = dmDialogOpen;
    if (!dmDialogOpen && deferredLiveRef.current) {
      deferredLiveRef.current = false;
      liveLoad();
    }
  }, [dmDialogOpen, liveLoad]);

  const pushHandoutKey = async (key: string) => {
    setPushingHandout(true);
    const ns = { ...state, handout: createHandout(key) };
    commitState(ns);
    setPushingHandout(false);
    setHandoutOpen(false);
    toast.success('Handout pushed to players!');
  };

  const pushUploadHandout = async () => {
    const el = document.getElementById('handoutFile') as HTMLInputElement | null;
    const file = el?.files?.[0];
    if (!file) { toast.error('Choose an image first'); return; }
    const form = new FormData();
    form.append('file', file);
    const upRes = await fetch('/api/upload', { method: 'POST', body: form });
    if (!upRes.ok) { toast.error('Upload failed'); return; }
    const { cloud_storage_path } = await upRes.json();
    await pushHandoutKey(cloud_storage_path);
  };

  const pushBackgroundHandout = async () => {
    if (!state?.backgroundImage) { toast.error('No background image set'); return; }
    await pushHandoutKey(state.backgroundImage);
  };

  const clearHandout = async () => {
    const ns = { ...state, handout: null };
    commitState(ns);
    setHandoutOpen(false);
    toast.success('Handout cleared');
  };

  const dismissHandout = () => setDismissedHandout(state?.handout?.pushedAt ?? null);

  // ---- Initiative tracker ----
  const playerTurns = (state?.turnOrder ?? []).filter((entry) => {
    if (isDM) return true;
    const tokens = state?.tokens ?? [];
    const token = entry.tokenId
      ? tokens.find((t) => t.id === entry.tokenId)
      : tokens.find((t) => entry.id.endsWith(`_${t.id}`));
    // The server only sends tokens this player may see (incl. their own hidden
    // character), so hide entries whose token isn't in the player's view.
    if (entry.tokenId && !token) return false;
    return true;
  });
  const sortedTurns = sortTurns(playerTurns);

  // Persist a turn order, guarding activeId against removed entries
  const commitTurns = (turnOrder: TurnEntry[], activeId: string | null) => {
    const sorted = sortTurns(turnOrder);
    const safeActive = sorted.some((e) => e.id === activeId) ? activeId : (sorted[0]?.id ?? null);
    const ns = { ...state, turnOrder, activeId: safeActive };
    commitState(ns);
  };

  const addManualEntry = () => {
    if (!newEntry.label.trim()) { toast.error('Enter a name'); return; }
    const e: TurnEntry = {
      id: createBattleId('te', 5),
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
        tokenId: t.id,
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
    commitState(ns);
  };

  const isFogged = (x: number, y: number) => (state?.fog ?? []).includes(`${x},${y}`);

  // Shared ruler overlay: red line + endpoint dots + distance pill.
  // Used by the free-measure ruler mode and by the live drag-ruler.
  const renderRulerOverlay = (r: { sx: number; sy: number; ex: number; ey: number }) => {
    const m = measureDistance(r.sx, r.sy, r.ex, r.ey, state?.feetPerSquare ?? DEFAULT_FEET_PER_SQUARE);
    const cc = (c: number) => c * (cellSize + 1) + cellSize / 2;
    const x1 = cc(r.sx), y1 = cc(r.sy), x2 = cc(r.ex), y2 = cc(r.ey);
    return (
      <div className="absolute pointer-events-none z-20" style={{ left: 4, top: 4, width: gw * cellSize + (gw - 1), height: gh * cellSize + (gh - 1) }}>
        <svg width="100%" height="100%">
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#f87171" strokeWidth={3} strokeLinecap="round" />
          <circle cx={x1} cy={y1} r={5} fill="#f87171" />
          <circle cx={x2} cy={y2} r={5} fill="#f87171" />
        </svg>
        <div className="absolute whitespace-nowrap rounded bg-black/80 px-2 py-0.5 font-mono text-xs text-white"
          style={{ left: (x1 + x2) / 2, top: (y1 + y2) / 2, transform: 'translate(-50%, -140%)' }}>
          {m.feet} ft ({m.squares} {m.squares === 1 ? 'square' : 'squares'})
        </div>
      </div>
    );
  };

  // Freehand drawings + text annotations. Points are stored in cell units and
  // scaled to px at render so strokes stay correct regardless of cellSize.
  // DM annotations — read-only for players via the normal state sync.
  const renderAnnotationLayer = () => {
    const W = gw * cellSize + (gw - 1);
    const H = gh * cellSize + (gh - 1);
    const px = (v: number) => v * (cellSize + 1);
    const hidden = new Set(eraseIds);
    const strokes = (state?.drawings ?? []).filter((d) => !hidden.has(d.id));
    const draft = drawing && drawing.length > 0 ? [{ id: '__draft', color: drawColor, points: drawing }] : [];
    return (
      <div className="absolute pointer-events-none" style={{ left: 4, top: 4, width: W, height: H, zIndex: 5 }}>
        <svg width={W} height={H} style={{ overflow: 'visible', display: 'block' }}>
          {[...strokes, ...draft].map((d) => d.points.length === 1 ? (
            <circle key={d.id} cx={px(d.points[0].x)} cy={px(d.points[0].y)} r={3} fill={d.color} />
          ) : (
            <polyline key={d.id} points={d.points.map((p) => `${px(p.x).toFixed(1)},${px(p.y).toFixed(1)}`).join(' ')}
              fill="none" stroke={d.color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {(state?.texts ?? []).map((t) => (
            <text key={t.id} x={px(t.x)} y={px(t.y)} textAnchor="middle" dominantBaseline="central"
              fontSize={14} fontWeight={700} fill={t.color}
              style={{
                paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.85)', strokeWidth: 3,
                pointerEvents: drawTool === 'text' && isDM ? 'auto' : 'none',
                cursor: drawTool === 'text' ? 'pointer' : 'default',
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); if (drawTool === 'text' && isDM) setTextDraft({ id: t.id, x: t.x, y: t.y, text: t.text, color: t.color }); }}>
              {t.text}
            </text>
          ))}
        </svg>
        {textDraft && isDM && (
          <div className="absolute z-30 w-52 rounded-lg border border-border bg-card p-2 shadow-lg space-y-2 pointer-events-auto"
            style={{
              left: Math.max(0, Math.min(W - 208, px(textDraft.x) - 104)),
              top: Math.max(0, Math.min(H - 160, px(textDraft.y) + 14)),
            }}
            onPointerDown={(e) => e.stopPropagation()}>
            <Input autoFocus value={textDraft.text} maxLength={60} placeholder="Annotation…"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTextDraft({ ...textDraft, text: e.target.value })}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') saveTextDraft(); else if (e.key === 'Escape') setTextDraft(null); }} />
            <div className="flex gap-1.5">
              {DRAW_COLORS.map((c) => (
                <button key={c.value} title={c.name} onClick={() => setTextDraft({ ...textDraft, color: c.value })}
                  className={`w-6 h-6 rounded-full border-2 transition-transform ${textDraft.color === c.value ? 'border-foreground scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c.value }} />
              ))}
            </div>
            <div className="flex gap-1">
              <Button size="sm" onClick={saveTextDraft}>Save</Button>
              {textDraft.id && <Button size="sm" variant="destructive" onClick={deleteTextDraft} title="Delete annotation"><Trash2 className="w-4 h-4" /></Button>}
              <Button size="sm" variant="secondary" onClick={() => setTextDraft(null)}>Cancel</Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {isDM && (
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="secondary" size="sm" onClick={undo} disabled={!past.length} title="Undo (Ctrl+Z)">
            <Undo2 className="w-4 h-4" />
          </Button>
          <Button variant="secondary" size="sm" onClick={redo} disabled={!future.length} title="Redo (Ctrl+Shift+Z)">
            <Redo2 className="w-4 h-4" />
          </Button>
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
                <div><Label>Portrait (optional)</Label><Input id="tokenPortraitFile" type="file" accept="image/*" className="mt-1" /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>HP (optional)</Label><Input type="number" min={0} value={newToken.hp} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewToken({ ...newToken, hp: e.target.value })} className="mt-1" placeholder="—" /></div>
                  <div><Label>Max HP (optional)</Label><Input type="number" min={1} value={newToken.maxHp} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewToken({ ...newToken, maxHp: e.target.value })} className="mt-1" placeholder="—" /></div>
                </div>
                <Button onClick={addToken} disabled={addingToken} className="w-full">{addingToken ? 'Adding...' : 'Add'}</Button>
              </div>
            </DialogContent>
          </Dialog>
          <DiceRoller campaignId={campaignId} isDM={isDM} />
          <Button variant={rulerMode ? 'default' : 'secondary'} size="sm" onClick={toggleRuler}>
            <Ruler className="w-4 h-4 mr-1" /> Ruler
          </Button>
          <div className="flex items-center gap-1 rounded-md border border-border px-1 py-0.5">
            <Button variant={drawTool === 'pen' ? 'default' : 'ghost'} size="sm" onClick={() => toggleDrawTool('pen')} title="Freehand draw">
              <Pencil className="w-4 h-4" />
            </Button>
            <Button variant={drawTool === 'eraser' ? 'default' : 'ghost'} size="sm" onClick={() => toggleDrawTool('eraser')} title="Eraser — drag over strokes to delete them">
              <Eraser className="w-4 h-4" />
            </Button>
            <Button variant={drawTool === 'text' ? 'default' : 'ghost'} size="sm" onClick={() => toggleDrawTool('text')} title="Text annotation — click the map">
              <Type className="w-4 h-4" />
            </Button>
            {(drawTool === 'pen' || drawTool === 'text') && DRAW_COLORS.map((c) => (
              <button key={c.value} title={c.name} onClick={() => setDrawColor(c.value)}
                className={`w-6 h-6 rounded-full border-2 transition-transform ${drawColor === c.value ? 'border-foreground scale-110' : 'border-transparent'}`}
                style={{ backgroundColor: c.value }} />
            ))}
          </div>
          <Button variant={pinMode ? 'default' : 'secondary'} size="sm" onClick={togglePin} title="Note pins — click the map to drop a pin">
            <MapPin className="w-4 h-4 mr-1" /> Pin
          </Button>
          <Button variant={fogMode ? 'default' : 'secondary'} size="sm" onClick={toggleFog}>
            {fogMode ? <Eye className="w-4 h-4 mr-1" /> : <EyeOff className="w-4 h-4 mr-1" />}
            {fogMode ? 'Fog: Click to toggle' : 'Toggle Fog'}
          </Button>
          <Dialog open={settingsOpen} onOpenChange={(open) => { if (open && state) settingsBeforeRef.current = JSON.stringify(state); setSettingsOpen(open); }}>
            <DialogTrigger asChild><Button variant="secondary" size="sm"><Settings className="w-4 h-4 mr-1" /> Grid Size</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Grid Settings</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div><Label>Width</Label><Input type="number" value={state.gridWidth} min={5} max={40} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const ns = { ...state, gridWidth: Math.min(40, Math.max(5, parseInt(e.target.value) || 20)) }; setState(ns); }} className="mt-1" /></div>
                <div><Label>Height</Label><Input type="number" value={state.gridHeight} min={5} max={40} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const ns = { ...state, gridHeight: Math.min(40, Math.max(5, parseInt(e.target.value) || 20)) }; setState(ns); }} className="mt-1" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div><Label>Feet per square</Label><Input type="number" value={state.feetPerSquare} min={1} max={100} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const ns = { ...state, feetPerSquare: Math.min(100, Math.max(1, parseInt(e.target.value) || 5)) }; setState(ns); }} className="mt-1" /></div>
                <div className="flex items-end gap-2 pb-2"><input id="cellNumbers" type="checkbox" checked={state.cellNumbers} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setState({ ...state, cellNumbers: e.target.checked })} className="h-4 w-4 accent-primary" /><Label htmlFor="cellNumbers">Cell labels (A1, B2&hellip;)</Label></div>
              </div>
              <Button onClick={commitSettings} className="w-full mt-3">Save</Button>
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
          <Dialog open={handoutOpen} onOpenChange={setHandoutOpen}>
            <DialogTrigger asChild>
              <Button variant="secondary" size="sm">
                <MonitorUp className="w-4 h-4 mr-1" /> Show to players
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Show image to players</DialogTitle></DialogHeader>
              <div className="space-y-3 mt-2">
                <div>
                  <Label>Upload an image</Label>
                  <Input id="handoutFile" type="file" accept="image/*" className="mt-1" />
                </div>
                <div className="flex gap-2">
                  <Button disabled={pushingHandout} onClick={pushUploadHandout} className="flex-1">
                    {pushingHandout ? 'Pushing...' : 'Push upload'}
                  </Button>
                  {state?.backgroundImage && (
                    <Button disabled={pushingHandout} variant="secondary" onClick={pushBackgroundHandout} className="flex-1">
                      Push background
                    </Button>
                  )}
                </div>
                {state?.handout && (
                  <button onClick={clearHandout} className="text-xs text-muted-foreground underline hover:text-foreground">
                    Clear current handout
                  </button>
                )}
                <p className="text-xs text-muted-foreground">Players see it in a popup within seconds. They can dismiss it; it comes back for them on reload.</p>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* Player live-update controls (DM view is always current) */}
      {!isDM && (
        <div className="flex items-center gap-2">
          <DiceRoller campaignId={campaignId} isDM={isDM} />
          <Button variant={rulerMode ? 'default' : 'secondary'} size="sm" onClick={toggleRuler}>
            <Ruler className="w-4 h-4 mr-1" /> Ruler
          </Button>
          <Button variant="secondary" size="sm" onClick={() => load()}>
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
          <span className="text-xs text-muted-foreground">Map updates live as the DM moves things</span>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        <div className="flex-1 min-w-0 w-full space-y-3">
          {/* Token list */}
          {isDM && (state?.tokens ?? []).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {(state?.tokens ?? []).map((t: Token) => (
                <div key={t.id} className="relative flex items-center gap-1 bg-card px-2 py-1 rounded border border-border text-xs">
                  {t.portraitKey ? (
                    <img src={`/api/files/${t.portraitKey}`} alt="" draggable={false} className="w-4 h-4 rounded-full object-cover" />
                  ) : (
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: t.color }} />
                  )}
                  <span>{t?.characterName ?? t?.label ?? '?'}</span>
                  {t.maxHp != null && t.maxHp > 0 ? (
                    <span className="flex items-center gap-0.5 ml-1">
                      <button onClick={(e) => adjustTokenHp(t.id, e.shiftKey ? -5 : -1)} className="px-0.5 text-muted-foreground hover:text-foreground" title="Damage 1 (Shift-click: 5)"><Minus className="w-3 h-3" /></button>
                      <button onClick={() => setHpEditId(hpEditId === t.id ? null : t.id)} className="font-mono tabular-nums" title="Edit HP">{t.hp ?? t.maxHp}/{t.maxHp}</button>
                      <button onClick={(e) => adjustTokenHp(t.id, e.shiftKey ? 5 : 1)} className="px-0.5 text-muted-foreground hover:text-foreground" title="Heal 1 (Shift-click: 5)"><Plus className="w-3 h-3" /></button>
                    </span>
                  ) : (
                    <button onClick={() => setHpEditId(t.id)} className="text-muted-foreground hover:text-foreground ml-1" title="Track HP"><Heart className="w-3 h-3" /></button>
                  )}
                  {hpEditId === t.id && (
                    <span className="flex items-center gap-1 ml-1">
                      <input id={`hpEdit-${t.id}`} type="number" min={0} defaultValue={t.hp ?? t.maxHp ?? ''} className="h-6 w-12 rounded border border-input bg-background px-1 text-xs" aria-label="Current HP" />
                      <span className="text-muted-foreground">/</span>
                      <input id={`maxHpEdit-${t.id}`} type="number" min={0} defaultValue={t.maxHp ?? ''} className="h-6 w-12 rounded border border-input bg-background px-1 text-xs" aria-label="Max HP" />
                      <button onClick={() => {
                        const hpEl = document.getElementById(`hpEdit-${t.id}`) as HTMLInputElement | null;
                        const maxEl = document.getElementById(`maxHpEdit-${t.id}`) as HTMLInputElement | null;
                        setTokenHp(t.id, parseInt(hpEl?.value ?? '', 10) || 0, parseInt(maxEl?.value ?? '', 10) || 0);
                        setHpEditId(null);
                      }} className="text-muted-foreground hover:text-foreground" title="Save HP"><Check className="w-3 h-3" /></button>
                    </span>
                  )}
                  <button onClick={() => setCondOpenId(condOpenId === t.id ? null : t.id)} className="text-muted-foreground hover:text-foreground" title="Conditions"><Tag className="w-3 h-3" /></button>
                  {(t.conditions ?? []).map((c) => (
                    <button key={c} onClick={() => toggleTokenCondition(t.id, c)} title={`Remove ${c}`} className="rounded bg-amber-500/20 px-1 text-[10px] leading-4 text-amber-200 hover:bg-amber-500/40">{COND_SHORT[c] ?? c.slice(0, 4)}</button>
                  ))}
                  {condOpenId === t.id && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setCondOpenId(null)} />
                      <div className="absolute z-40 top-full left-0 mt-1 w-44 max-h-52 overflow-auto rounded-md border border-border bg-card p-1.5 shadow-lg">
                        <p className="px-1 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Conditions</p>
                        {PF1E_CONDITIONS.map((c) => (
                          <label key={c} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-muted/60">
                            <input type="checkbox" checked={(t.conditions ?? []).includes(c)} onChange={() => toggleTokenCondition(t.id, c)} className="h-3 w-3 accent-amber-500" />
                            <span>{c}</span>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                  <label className="cursor-pointer text-muted-foreground hover:text-foreground" title={t.portraitKey ? 'Change portrait' : 'Add portrait'}>
                    <ImagePlus className="w-3 h-3" />
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target?.files?.[0]; if (f) setTokenPortrait(t.id, f); e.target.value = ''; }} />
                  </label>
                  {t.portraitKey && (
                    <button onClick={() => clearTokenPortrait(t.id)} className="text-muted-foreground hover:text-foreground" title="Remove portrait"><X className="w-3 h-3" /></button>
                  )}
                  {t.creatureId && (
                    <button onClick={() => void openLinkedCreature(t)} className="text-muted-foreground hover:text-foreground" title="Open linked creature"><BookOpen className="w-3 h-3" /></button>
                  )}
                  <button onClick={() => removeToken(t.id)} className="text-destructive hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
          )}

          {/* Bestiary palette (DM-only): drag creatures onto the map as linked tokens */}
          {isDM && (
            <div className="rounded-lg border border-border bg-card p-2">
              <button
                onClick={() => { setPaletteOpen((o) => !o); void ensurePalette(); }}
                className="flex w-full items-center gap-1 text-sm font-medium"
              >
                {paletteOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                <BookOpen className="w-4 h-4" />
                Bestiary
                {paletteCreatures.length > 0 && (
                  <span className="text-xs text-muted-foreground">({paletteCreatures.length})</span>
                )}
              </button>
              {paletteOpen && (
                <div className="mt-2 space-y-1 max-h-64 overflow-y-auto">
                  <p className="text-[11px] text-muted-foreground px-1">Drag a creature onto the map to place a linked token.</p>
                  {paletteCreatures.map((c) => (
                    <div
                      key={c.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/x-questbound-creature', JSON.stringify(c));
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      className="flex items-center gap-2 rounded border border-border px-2 py-1 text-xs cursor-grab hover:border-primary/40 bg-background"
                      title={`Drag onto the map — ${c.name}`}
                    >
                      {c.portraitPath ? (
                        <img src={`/api/files/${c.portraitPath}`} alt="" draggable={false} className="w-6 h-6 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                          <BookOpen className="w-3 h-3 text-muted-foreground" />
                        </div>
                      )}
                      <span className="font-medium truncate">{c.name || 'Unnamed'}</span>
                      <span className="text-muted-foreground ml-auto shrink-0">{c.size}</span>
                    </div>
                  ))}
                  {paletteCreatures.length === 0 && (
                    <p className="text-xs text-muted-foreground px-1">No creatures in the Bestiary yet.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Encounters (DM-only) */}
          {isDM && (
            <div className="rounded-lg border border-border bg-card p-2">
              <button onClick={() => setEncOpen(!encOpen)} className="flex w-full items-center gap-1 text-sm font-medium">
                {encOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                Encounters
                {(state?.encounters ?? []).length > 0 && (
                  <span className="text-xs text-muted-foreground">({(state?.encounters ?? []).length})</span>
                )}
              </button>
              {encOpen && (
                <div className="mt-2 space-y-2">
                  {encNameOpen ? (
                    <div className="flex gap-1">
                      <Input
                        value={encName}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEncName(e.target.value)}
                        placeholder="Encounter name"
                        maxLength={40}
                        className="h-8 text-sm"
                      />
                      <Button size="sm" onClick={saveEncounter}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => { setEncNameOpen(false); setEncName(''); }}>Cancel</Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => setEncNameOpen(true)}>
                      <Save className="w-4 h-4 mr-1" /> Save encounter
                    </Button>
                  )}
                  {/* Pull creatures straight from the Bestiary */}
                  <div className="flex gap-1 items-center">
                    <select
                      value={encCreatureId}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { setEncCreatureId(e.target.value); void ensurePalette(); }}
                      onFocus={() => void ensurePalette()}
                      className="h-8 text-xs rounded border border-input bg-background px-1 flex-1 min-w-0"
                      title="Spawn creature from Bestiary"
                    >
                      <option value="">Bestiary...</option>
                      {paletteCreatures.map((c) => (
                        <option key={c.id} value={c.id}>{c.name || 'Unnamed'}</option>
                      ))}
                    </select>
                    <Input
                      type="number" min={1} max={12}
                      value={encCreatureCount}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEncCreatureCount(parseInt(e.target.value) || 1)}
                      className="h-8 w-14 text-xs"
                      aria-label="Count"
                    />
                    <Button size="sm" variant="secondary" onClick={() => void spawnCreaturesFromBestiary()}>Spawn</Button>
                  </div>
                  {(state?.encounters ?? []).map((enc: Encounter) => (
                    <div key={enc.id} className="flex items-center gap-2 rounded border border-border px-2 py-1 text-xs">
                      <span className="font-medium truncate">{enc.name}</span>
                      <span className="text-muted-foreground whitespace-nowrap">{enc.tokens.length} token{enc.tokens.length === 1 ? '' : 's'}</span>
                      <span className="ml-auto flex items-center gap-1">
                        <Button size="sm" variant="secondary" onClick={() => spawnEncounter(enc.id)}>Spawn</Button>
                        <button onClick={() => deleteEncounter(enc.id)} className="text-destructive hover:text-red-400 p-1" title="Delete encounter">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </span>
                    </div>
                  ))}
                  {(state?.encounters ?? []).length === 0 && (
                    <p className="text-xs text-muted-foreground">No saved encounters yet. Arrange tokens on the map, then save them here to reuse later.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Snapshots (DM-only) */}
          {isDM && (
            <div className="rounded-lg border border-border bg-card p-2">
              <button onClick={() => setSnapOpen(!snapOpen)} className="flex w-full items-center gap-1 text-sm font-medium">
                {snapOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                Snapshots
                {(state?.snapshots ?? []).length > 0 && (
                  <span className="text-xs text-muted-foreground">({(state?.snapshots ?? []).length})</span>
                )}
              </button>
              {snapOpen && (
                <div className="mt-2 space-y-2">
                  {snapNameOpen ? (
                    <div className="flex gap-1">
                      <Input
                        value={snapName}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSnapName(e.target.value)}
                        placeholder="Snapshot name"
                        maxLength={40}
                        className="h-8 text-sm"
                      />
                      <Button size="sm" onClick={saveSnapshot}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => { setSnapNameOpen(false); setSnapName(''); }}>Cancel</Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => setSnapNameOpen(true)}>
                      <Save className="w-4 h-4 mr-1" /> Save snapshot
                    </Button>
                  )}
                  {(state?.snapshots ?? []).map((snap: Snapshot) => (
                    <div key={snap.id} className="flex items-center gap-2 rounded border border-border px-2 py-1 text-xs">
                      <span className="font-medium truncate">{snap.name}</span>
                      <span className="text-muted-foreground whitespace-nowrap">{new Date(snap.createdAt).toLocaleString()}</span>
                      <span className="ml-auto flex items-center gap-1">
                        <Button
                          size="sm"
                          variant={confirmRestore === snap.id ? 'destructive' : 'secondary'}
                          onClick={() => restoreSnapshot(snap.id)}
                        >
                          {confirmRestore === snap.id ? 'Confirm restore' : 'Restore'}
                        </Button>
                        <button onClick={() => deleteSnapshot(snap.id)} className="text-destructive hover:text-red-400 p-1" title="Delete snapshot">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </span>
                    </div>
                  ))}
                  {(state?.snapshots ?? []).length === 0 && (
                    <p className="text-xs text-muted-foreground">No snapshots yet. Save the full map state to restore it later.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Grid */}
          <div className="overflow-auto rounded-lg border border-border bg-card" style={{ boxShadow: 'var(--shadow-md)' }}>
            <div style={{
              display: 'grid',
              position: 'relative',
              gridTemplateColumns: `repeat(${gw}, ${cellSize}px)`,
              gridTemplateRows: `repeat(${gh}, ${cellSize}px)`,
              gap: '1px',
              padding: '4px',
              backgroundColor: 'hsl(33 26% 52%)',
              ...((rulerMode || drawTool === 'pen' || drawTool === 'eraser') ? { touchAction: 'none' } : {}),
              ...(state?.backgroundImage ? {
                backgroundImage: `url(/api/files/${state.backgroundImage})`,
                backgroundSize: `${gw * cellSize + (gw - 1)}px ${gh * cellSize + (gh - 1)}px`,
                backgroundPosition: '4px 4px',
                backgroundRepeat: 'no-repeat',
              } : {}),
            }}
              onPointerDown={(e) => { onRulerDown(e); onDrawDown(e); }}
              onPointerMove={(e) => { onRulerMove(e); onDrawMove(e); }}
              onPointerUp={() => { onRulerUp(); onDrawUp(); }}
              onPointerCancel={() => { onRulerUp(); onDrawCancel(); }}>
              {Array.from({ length: gh }, (_, row) =>
                Array.from({ length: gw }, (_, col) => {
                  const fogged = isFogged(col, row);
                  const tokensHere = (state?.tokens ?? []).filter((t: Token) => t.x === col && t.y === row);
                  const showFog = !isDM && fogged;
                  const hasBg = !!state?.backgroundImage;

                  return (
                    <div key={`${col}-${row}`}
                      onClick={() => handleCellClick(col, row)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (dragging && dragRuler && !rulerMode) {
                          setDragRuler((r) => (r && (r.ex !== col || r.ey !== row) ? { ...r, ex: col, ey: row } : r));
                        }
                      }}
                      onDrop={(e) => handleDrop(col, row, e)}
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
                      }}>
                      {(state?.cellNumbers ?? true) && (
                        <span className="absolute top-0 left-0.5 pointer-events-none select-none font-mono" style={{ fontSize: '8px', lineHeight: 1.3, color: 'rgba(140,140,140,0.9)', textShadow: '0 1px 2px rgba(0,0,0,0.6)', zIndex: 1 }}>
                          {colLabel(col)}{row + 1}
                        </span>
                      )}
                      {!showFog && (state?.pins ?? []).filter((p: BattlePin) => p.x === col && p.y === row).map((p: BattlePin) => (
                        <button
                          key={p.id}
                          onClick={(e) => onPinMarkerClick(p, e)}
                          title={p.label || 'Note pin'}
                          aria-label={p.label || 'Note pin'}
                          className="absolute z-[6] p-1 cursor-pointer"
                          style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
                        >
                          <MapPin className="w-4 h-4 text-amber-300" fill="currentColor" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.8))' }} />
                        </button>
                      ))}
                      {!showFog && tokensHere.map((t: Token) => {
                        const fp = t.size || 1;
                        const dim = fp >= 1 ? fp * cellSize + (fp - 1) : cellSize / 2;
                        const off = fp >= 1 ? 0 : cellSize / 4;
                        const maxHp = t.maxHp ?? 0;
                        const hpTracked = maxHp > 0;
                        const curHp = hpTracked ? Math.max(0, Math.min(maxHp, t.hp ?? maxHp)) : 0;
                        const hpPct = hpTracked ? Math.max(0, Math.min(100, (curHp / maxHp) * 100)) : 0;
                        const hpColor = hpPct > 50 ? '#4ade80' : hpPct >= 25 ? '#fbbf24' : '#ef4444';
                        const isDead = hpTracked && curHp <= 0;
                        const barH = Math.max(3, Math.round(dim * 0.09));
                        return (
                          <div key={t.id}
                            draggable={!rulerMode && !drawTool && !pinMode && (isDM || isMyToken(t))}
                            onDragStart={() => onTokenDragStart(t)}
                            onDragEnd={onTokenDragEnd}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (rulerMode || drawTool || pinMode || fogMode) return;
                              void openLinkedCreature(t);
                            }}
                            title={`${t.characterName ?? t.label ?? '?'}${hpTracked ? ` — ${curHp}/${maxHp} HP` : ''}`}
                            className={`absolute z-10 rounded-full flex items-center justify-center font-bold text-white cursor-grab shadow-md ${!isDM && isMyToken(t) ? 'ring-2 ring-white/70' : ''}`}
                            style={{
                              backgroundColor: t.portraitKey ? 'transparent' : t.color,
                              ...(t.portraitKey ? { boxShadow: `0 0 0 2px ${t.color}, 0 4px 6px -1px rgb(0 0 0 / 0.3)` } : {}),
                              width: dim,
                              height: dim,
                              left: off,
                              top: off,
                              fontSize: dim < 25 ? '8px' : dim < 48 ? '12px' : '16px',
                              ...(isDead ? { filter: 'grayscale(1)' } : {}),
                            }}>
                            {t.portraitKey ? (
                              <img src={`/api/files/${t.portraitKey}`} alt="" draggable={false} className="rounded-full object-cover w-full h-full pointer-events-none" />
                            ) : (t?.label?.[0] ?? '?')}
                            {hpTracked && (
                              <div className="absolute pointer-events-none" style={{ bottom: Math.max(1, barH * 0.4), left: '10%', right: '10%', height: barH, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: barH / 2, overflow: 'hidden' }}>
                                <div style={{ width: `${hpPct}%`, height: '100%', backgroundColor: hpColor }} />
                              </div>
                            )}
                            {(t.conditions ?? []).length > 0 && (() => {
                              const conds = t.conditions ?? [];
                              const vis = conds.slice(0, 4);
                              const extra = conds.length - vis.length;
                              const fs = Math.max(6, Math.round(dim * 0.16));
                              return (
                                <div className="absolute pointer-events-none" style={{ left: '50%', top: 0, transform: 'translate(-50%, calc(-100% - 2px))', zIndex: 20 }} title={conds.join(', ')}>
                                  <div className="flex gap-0.5 justify-center">
                                    {vis.map((c) => (
                                      <span key={c} className="rounded px-1 font-mono whitespace-nowrap" style={{ fontSize: fs, lineHeight: 1.5, backgroundColor: 'rgba(120, 53, 15, 0.92)', color: '#fde68a' }}>{COND_SHORT[c] ?? c.slice(0, 4)}</span>
                                    ))}
                                    {extra > 0 && (
                                      <span className="rounded px-1 font-mono" style={{ fontSize: fs, lineHeight: 1.5, backgroundColor: 'rgba(0,0,0,0.75)', color: '#fff' }}>+{extra}</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}
                            {isDead && (
                              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <Skull style={{ width: dim * 0.45, height: dim * 0.45, color: '#fff', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.85))' }} />
                              </div>
                            )}
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
              {/* Draw each boundary once in the existing gap. crispEdges snaps
                  lines to display pixels even when browser zoom is fractional. */}
              <svg
                aria-hidden="true"
                className="absolute pointer-events-none"
                style={{ left: 4, top: 4 }}
                width={gw * cellSize + (gw - 1)}
                height={gh * cellSize + (gh - 1)}
                shapeRendering="crispEdges"
                fill={state?.backgroundImage ? 'rgba(255, 255, 255, 0.35)' : 'hsl(33 26% 52%)'}
              >
                {/* One filled path also keeps intersections from doubling opacity. */}
                <path d={[
                  ...Array.from({ length: gw - 1 }, (_, col) =>
                    `M${(col + 1) * (cellSize + 1) - 1} 0h1v${gh * cellSize + (gh - 1)}h-1Z`),
                  ...Array.from({ length: gh - 1 }, (_, row) =>
                    `M0 ${(row + 1) * (cellSize + 1) - 1}h${gw * cellSize + (gw - 1)}v1H0Z`),
                ].join(' ')} />
              </svg>
              {ruler && renderRulerOverlay(ruler)}
              {dragRuler && !rulerMode && renderRulerOverlay(dragRuler)}
              {renderAnnotationLayer()}
            </div>
          </div>
        </div>
        {/* Initiative tracker — side column */}
        <div className="lg:w-72 shrink-0 w-full">
          {isDM ? (
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <p className="text-sm font-medium flex items-center gap-2 mb-2"><ListOrdered className="w-4 h-4" /> Initiative{sortedTurns.length > 0 && <span className="text-xs text-muted-foreground">({sortedTurns.length})</span>}</p>
              <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input placeholder="Name" value={newEntry.label} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewEntry({ ...newEntry, label: e.target.value })} className="h-8 text-sm" />
                    <Input type="number" placeholder="Init" value={newEntry.initiative} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewEntry({ ...newEntry, initiative: e.target.value })} className="h-8 text-sm w-20" />
                    <Button size="sm" onClick={addManualEntry} title="Add entry"><Plus className="w-4 h-4" /></Button>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="secondary" onClick={addTokensToOrder}>Add combatants</Button>
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
            </div>
          ) : (
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
                {!sortedTurns.length && <p className="text-xs text-muted-foreground">No entries yet.</p>}
              </div>
            </div>
          )}
          {/* Handout modal for players: appears when the DM pushes, dismissible per session */}
          {!isDM && state?.handout && dismissedHandout !== state.handout.pushedAt && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={dismissHandout}>
              <button aria-label="Close handout" className="absolute top-3 right-3 rounded-full bg-black/60 p-2 text-white hover:bg-black/80" onClick={(e) => { e.stopPropagation(); dismissHandout(); }}>
                <X className="w-5 h-5" />
              </button>
              <img src={`/api/files/${state.handout.key}`} alt="Handout from your DM" className="max-h-[90vh] max-w-full rounded-lg object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
            </div>
          )}
        </div>
      </div>

      {/* Note pin dialog: view (DM + players) and edit (DM only) */}
      <Dialog open={!!pinDialog} onOpenChange={(open) => { if (!open) setPinDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{pinDialog?.mode === 'edit' ? (pinDialog?.isNew ? 'New note pin' : 'Edit note pin') : 'Note pin'}</DialogTitle>
          </DialogHeader>
          {pinDialog && (
            <div className="space-y-3 mt-2">
              {pinDialog.mode === 'view' ? (
                <>
                  {pinDialog.pin.label ? (
                    <p className="text-sm font-medium">{pinDialog.pin.label}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Unlabeled pin.</p>
                  )}
                  {pinDialog.pin.wikiArticle && onOpenWikiPage && (
                    <button
                      onClick={() => { const pid = pinDialog.pin.wikiArticleId; setPinDialog(null); if (pid && onOpenWikiPage) onOpenWikiPage(pid); }}
                      className="flex items-center gap-1.5 text-sm text-primary hover:underline w-fit"
                    >
                      <BookOpen className="w-4 h-4" /> Read article: {pinDialog.pin.wikiArticle.title}
                    </button>
                  )}
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => setPinDialog(null)} className="flex-1">Close</Button>
                    {isDM && <Button onClick={() => openPinEditor(pinDialog.pin, false)} className="flex-1">Edit</Button>}
                  </div>
                </>
              ) : (
                <>
                  <div><Label>Label</Label><Input value={pinLabel} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPinLabel(e.target.value)} className="mt-1" maxLength={60} placeholder="e.g. Old shrine" /></div>
                  <div><Label>Linked wiki article (optional)</Label>
                    <select value={pinArticleId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setPinArticleId(e.target.value)} className="mt-1 h-8 w-full rounded-md bg-card border border-input px-2 text-sm">
                      <option value="">None</option>
                      {wikiPages.map((pg) => <option key={pg.id} value={pg.id}>{pg.title}{pg.visibility !== 'shared' ? ' (DM only)' : ''}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={savePin} className="flex-1">Save</Button>
                    {!pinDialog.isNew && <Button variant="destructive" onClick={deletePin}>Delete</Button>}
                    <Button variant="secondary" onClick={() => setPinDialog(null)}>Cancel</Button>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
