'use client';

import { useState, useEffect, useCallback } from 'react';
import { Coins, Plus, Pencil, Trash2, Split, ArrowRightLeft, Backpack, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { FadeIn } from '@/components/ui/animate';
import { breakdownCoins } from '@/lib/coins';
import { LootTableEditor } from './loot-editor';

interface LootCharacter {
  id: string;
  name: string;
  userId: string;
}

interface LootItem {
  id: string;
  name: string;
  quantity: number;
  valueGp: number;
  weight: number;
  notes: string;
  characterId: string | null;
  character?: LootCharacter | null;
}

interface LootData {
  partyCp: number;
  items: LootItem[];
  characters: LootCharacter[];
  role: string;
  userId: string;
}

function fmt(n: number) {
  return Number.isInteger(n) ? n.toString() : n.toFixed(2);
}

export function LootTab({ campaignId, role, userId }: { campaignId: string; role: string; userId: string }) {
  const [data, setData] = useState<LootData | null>(null);
  const [loading, setLoading] = useState(true);
  const isDM = role === 'dm';

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/loot?campaignId=${campaignId}`);
      if (res.ok) setData(await res.json());
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [campaignId]);

  useEffect(() => {
    let active = true;
    fetch(`/api/loot?campaignId=${campaignId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (active && d) setData(d); })
      .catch(() => { /* ignore */ })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [campaignId]);

  if (loading) return <p className="text-muted-foreground py-10 text-center">Loading loot...</p>;
  if (!data) return <p className="text-muted-foreground py-10 text-center">Could not load loot.</p>;

  const partyItems = data.items.filter((i) => !i.characterId);
  const byCharacter = new Map<string, LootItem[]>();
  for (const item of data.items) {
    if (!item.characterId) continue;
    if (!byCharacter.has(item.characterId)) byCharacter.set(item.characterId, []);
    byCharacter.get(item.characterId)!.push(item);
  }

  const totals = (items: LootItem[]) => ({
    value: items.reduce((s, i) => s + i.valueGp * i.quantity, 0),
    weight: items.reduce((s, i) => s + i.weight * i.quantity, 0),
  });

  const canMove = (item: LootItem) =>
    isDM || (item.characterId != null && item.character?.userId === userId);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <FadeIn>
        <h2 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2 mb-6">
          <Coins className="w-6 h-6 text-primary" />
          Party Loot
        </h2>
      </FadeIn>

      <CoinsCard partyCp={data.partyCp} campaignId={campaignId} isDM={isDM} onChange={load} />

      <div className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-lg font-semibold flex items-center gap-2">
            <Backpack className="w-5 h-5 text-primary" /> Party Inventory
          </h3>
          {isDM && <AddItemButton campaignId={campaignId} characters={data.characters} onChange={load} />}
        </div>
        <ItemTable
          items={partyItems}
          characters={data.characters}
          isDM={isDM}
          canMove={canMove}
          campaignId={campaignId}
          onChange={load}
          emptyText="The party stash is empty."
        />
        {partyItems.length > 0 && <GroupTotals {...totals(partyItems)} />}
      </div>

      {data.characters.map((ch) => {
        const items = byCharacter.get(ch.id) ?? [];
        return (
          <div key={ch.id} className="mt-8">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-lg font-semibold flex items-center gap-2">
                <User className="w-5 h-5 text-primary" /> {ch.name}
                {ch.userId === userId && !isDM && (
                  <Badge variant="secondary" className="text-[10px]">Yours</Badge>
                )}
              </h3>
              {isDM && <AddItemButton campaignId={campaignId} characters={data.characters} defaultCharacterId={ch.id} onChange={load} />}
            </div>
            <ItemTable
              items={items}
              characters={data.characters}
              isDM={isDM}
              canMove={canMove}
              campaignId={campaignId}
              onChange={load}
              emptyText={`${ch.name} carries nothing.`}
            />
            {items.length > 0 && <GroupTotals {...totals(items)} />}
          </div>
        );
      })}

      {isDM && <LootTableEditor campaignId={campaignId} />}
    </div>
  );
}

function GroupTotals({ value, weight }: { value: number; weight: number }) {
  return (
    <p className="text-sm text-muted-foreground mt-2 text-right">
      Total: <span className="font-mono font-medium text-foreground">{fmt(value)} gp</span>
      {' • '}
      <span className="font-mono font-medium text-foreground">{fmt(weight)} lb</span>
    </p>
  );
}

function CoinsCard({ partyCp, campaignId, isDM, onChange }: { partyCp: number; campaignId: string; isDM: boolean; onChange: () => void }) {
  const { pp, gp, sp, cp } = breakdownCoins(partyCp);
  const [adj, setAdj] = useState({ pp: '', gp: '', sp: '', cp: '' });
  const [busy, setBusy] = useState(false);

  const adjust = async (sign: 1 | -1) => {
    // Each field must be blank or a whole, non-negative number of coins.
    const parts = (['pp', 'gp', 'sp', 'cp'] as const).map((k) => adj[k].trim() === '' ? 0 : Number(adj[k]));
    if (parts.some((n) => !Number.isInteger(n) || n < 0)) { toast.error('Coin amounts must be whole, non-negative numbers'); return; }
    const deltaCp = parts[0] * 1000 + parts[1] * 100 + parts[2] * 10 + parts[3];
    if (deltaCp <= 0) { toast.error('Enter an amount first'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/loot/coins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId, deltaCp: sign * deltaCp }),
      });
      if (res.ok) {
        toast.success(sign === 1 ? 'Coins added' : 'Coins removed');
        setAdj({ pp: '', gp: '', sp: '', cp: '' });
        onChange();
      } else {
        const d = await res.json().catch(() => null);
        toast.error(d?.error ?? 'Could not adjust coins');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-card rounded-lg border border-border p-5" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Coin label="pp" value={pp} />
        <Coin label="gp" value={gp} />
        <Coin label="sp" value={sp} />
        <Coin label="cp" value={cp} />
        <span className="text-xs text-muted-foreground font-mono ml-auto">{partyCp.toLocaleString()} cp total</span>
      </div>
      {isDM && (
        <div className="flex flex-wrap items-end gap-2 mt-4 pt-4 border-t border-border">
          {(['pp', 'gp', 'sp', 'cp'] as const).map((k) => (
            <label key={k} className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground font-mono">{k}</span>
              <Input
                type="number" min="0" step="1" value={adj[k]}
                onChange={(e) => setAdj({ ...adj, [k]: e.target.value })}
                className="w-20 h-8" placeholder="0"
              />
            </label>
          ))}
          <Button size="sm" disabled={busy} onClick={() => adjust(1)}><Plus className="w-4 h-4 mr-1" /> Add</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => adjust(-1)}>Subtract</Button>
        </div>
      )}
    </div>
  );
}

function Coin({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="font-display text-2xl font-bold font-mono">{value}</span>
      <span className="text-sm text-muted-foreground font-mono">{label}</span>
    </div>
  );
}

function AddItemButton({ campaignId, characters, defaultCharacterId, onChange }: {
  campaignId: string; characters: LootCharacter[]; defaultCharacterId?: string; onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1" /> Add item</Button>;
  }
  return <ItemDialog campaignId={campaignId} characters={characters} defaultCharacterId={defaultCharacterId} onClose={() => { setOpen(false); onChange(); }} />;
}

function ItemDialog({ campaignId, characters, defaultCharacterId, item, onClose }: {
  campaignId: string; characters: LootCharacter[]; defaultCharacterId?: string; item?: LootItem; onClose: () => void;
}) {
  const [name, setName] = useState(item?.name ?? '');
  const [quantity, setQuantity] = useState(String(item?.quantity ?? 1));
  const [valueGp, setValueGp] = useState(String(item?.valueGp ?? 0));
  const [weight, setWeight] = useState(String(item?.weight ?? 0));
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [characterId, setCharacterId] = useState(item?.characterId ?? defaultCharacterId ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        quantity: Math.max(1, parseInt(quantity, 10) || 1),
        valueGp: Math.max(0, parseFloat(valueGp) || 0),
        weight: Math.max(0, parseFloat(weight) || 0),
        notes: notes.trim(),
      };
      let res: Response;
      if (item) {
        res = await fetch('/api/loot/items', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: item.id, ...payload }),
        });
      } else {
        res = await fetch('/api/loot/items', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campaignId, characterId: characterId || null, ...payload }),
        });
      }
      if (res.ok) { toast.success(item ? 'Item updated' : 'Item added'); onClose(); }
      else {
        const d = await res.json().catch(() => null);
        toast.error(d?.error ?? 'Could not save item');
      }
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-card rounded-lg border border-border p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h4 className="font-display font-semibold mb-4">{item ? 'Edit item' : 'Add item'}</h4>
        <div className="grid gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Name</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Rope, 50 ft." />
          </label>
          <div className="grid grid-cols-3 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Qty</span>
              <Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Value (gp each)</span>
              <Input type="number" min="0" step="any" value={valueGp} onChange={(e) => setValueGp(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Weight (lb each)</span>
              <Input type="number" min="0" step="any" value={weight} onChange={(e) => setWeight(e.target.value)} />
            </label>
          </div>
          {!item && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Holder</span>
              <select value={characterId} onChange={(e) => setCharacterId(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Party stash</option>
                {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Notes</span>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>
    </div>
  );
}

function ItemTable({ items, characters, isDM, canMove, campaignId, onChange, emptyText }: {
  items: LootItem[]; characters: LootCharacter[]; isDM: boolean;
  canMove: (item: LootItem) => boolean; campaignId: string; onChange: () => void; emptyText: string;
}) {
  const [editing, setEditing] = useState<LootItem | null>(null);
  const [splitting, setSplitting] = useState<LootItem | null>(null);
  const [moving, setMoving] = useState<LootItem | null>(null);

  const remove = async (item: LootItem) => {
    if (!confirm(`Delete ${item.name}? This cannot be undone.`)) return;
    const res = await fetch(`/api/loot/items?id=${item.id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Item deleted'); onChange(); }
    else toast.error('Could not delete item');
  };

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center border border-dashed border-border rounded-lg">{emptyText}</p>;
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="px-3 py-2 font-medium w-16">Qty</th>
              <th className="px-3 py-2 font-medium w-24">Value (gp)</th>
              <th className="px-3 py-2 font-medium w-24">Weight (lb)</th>
              <th className="px-3 py-2 font-medium">Notes</th>
              <th className="px-3 py-2 font-medium w-40 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-3 py-2 font-medium">{item.name}</td>
                <td className="px-3 py-2 font-mono">{item.quantity}</td>
                <td className="px-3 py-2 font-mono">{fmt(item.valueGp)}{item.quantity > 1 && <span className="text-muted-foreground"> ({fmt(item.valueGp * item.quantity)} total)</span>}</td>
                <td className="px-3 py-2 font-mono">{fmt(item.weight)}{item.quantity > 1 && <span className="text-muted-foreground"> ({fmt(item.weight * item.quantity)} total)</span>}</td>
                <td className="px-3 py-2 text-muted-foreground max-w-[200px] truncate" title={item.notes}>{item.notes}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    {isDM && (
                      <>
                        <Button variant="ghost" size="icon-sm" title="Edit" onClick={() => setEditing(item)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        {item.quantity > 1 && (
                          <Button variant="ghost" size="icon-sm" title="Split stack" onClick={() => setSplitting(item)}>
                            <Split className="w-4 h-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon-sm" title="Delete" onClick={() => remove(item)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </>
                    )}
                    {canMove(item) && (
                      <Button variant="ghost" size="icon-sm" title={isDM ? 'Hand to character or party' : 'Give to party or character'} onClick={() => setMoving(item)}>
                        <ArrowRightLeft className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <ItemDialog campaignId={campaignId} characters={characters} item={editing} onClose={() => { setEditing(null); onChange(); }} />}
      {splitting && <SplitDialog item={splitting} onClose={() => { setSplitting(null); onChange(); }} />}
      {moving && <MoveDialog item={moving} characters={characters} onClose={() => { setMoving(null); onChange(); }} />}
    </>
  );
}

function SplitDialog({ item, onClose }: { item: LootItem; onClose: () => void }) {
  const [qty, setQty] = useState('1');
  const [busy, setBusy] = useState(false);

  const split = async () => {
    const n = parseInt(qty, 10);
    if (!Number.isInteger(n) || n <= 0 || n >= item.quantity) {
      toast.error(`Enter a number between 1 and ${item.quantity - 1}`);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/loot/items/split', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, quantity: n }),
      });
      if (res.ok) { toast.success('Stack split'); onClose(); }
      else {
        const d = await res.json().catch(() => null);
        toast.error(d?.error ?? 'Could not split stack');
      }
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-card rounded-lg border border-border p-5 w-full max-w-xs" onClick={(e) => e.stopPropagation()}>
        <h4 className="font-display font-semibold mb-2">Split {item.name}</h4>
        <p className="text-sm text-muted-foreground mb-3">Stack of {item.quantity}. How many go into the new stack?</p>
        <Input type="number" min="1" max={item.quantity - 1} value={qty} onChange={(e) => setQty(e.target.value)} />
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={busy} onClick={split}>{busy ? 'Splitting…' : 'Split'}</Button>
        </div>
      </div>
    </div>
  );
}

function MoveDialog({ item, characters, onClose }: { item: LootItem; characters: LootCharacter[]; onClose: () => void }) {
  const destinations = characters.filter((c) => c.id !== item.characterId);
  // Default to a real destination: party-stash items go to the first character.
  const [toId, setToId] = useState<string>(item.characterId ? '__party__' : destinations[0]?.id ?? '__party__');
  const [busy, setBusy] = useState(false);

  const move = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/loot/items/move', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, toCharacterId: toId === '__party__' ? null : toId }),
      });
      if (res.ok) { toast.success('Item moved'); onClose(); }
      else {
        const d = await res.json().catch(() => null);
        toast.error(d?.error ?? 'Could not move item');
      }
    } finally { setBusy(false); }
  };

  const currentHolder = item.character?.name ?? 'Party stash';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-card rounded-lg border border-border p-5 w-full max-w-xs" onClick={(e) => e.stopPropagation()}>
        <h4 className="font-display font-semibold mb-2">Move {item.name}</h4>
        <p className="text-sm text-muted-foreground mb-3">Currently held by: {currentHolder}</p>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Move to</span>
          <select value={toId} onChange={(e) => setToId(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            {item.characterId && <option value="__party__">Party stash</option>}
            {destinations.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={busy || (!item.characterId && toId === '__party__')} onClick={move}>{busy ? 'Moving…' : 'Move'}</Button>
        </div>
      </div>
    </div>
  );
}
