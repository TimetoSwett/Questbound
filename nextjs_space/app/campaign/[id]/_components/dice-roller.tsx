'use client';

import { useState } from 'react';
import { Dices, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

const DICE = [4, 6, 8, 10, 12, 20, 100];

export function DiceRoller({ campaignId, isDM }: { campaignId: string; isDM: boolean }) {
  const [open, setOpen] = useState(false);
  const [sides, setSides] = useState(20);
  const [count, setCount] = useState(1);
  const [mod, setMod] = useState(0);
  const [secret, setSecret] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [last, setLast] = useState<{ total: number; detail: string } | null>(null);
  const [history, setHistory] = useState<string[]>([]);

  const roll = async () => {
    const modStr = mod > 0 ? `+${mod}` : mod < 0 ? `${mod}` : '';
    const expression = `${count}d${sides}${modStr}`;
    setRolling(true);
    try {
      // Rolls happen on the server so results can't be faked; the shared log
      // picks the roll up via polling.
      const res = await fetch('/api/dice-rolls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId, expression, isSecret: isDM && secret }),
      });
      if (!res.ok) return;
      const data = await res.json();
      const results = Array.isArray(data.results) ? data.results.join(', ') : '';
      const detail = `${data.expression}: [${results}] = ${data.total}`;
      setLast({ total: data.total, detail });
      setHistory((h) => [detail, ...h].slice(0, 6));
    } finally {
      setRolling(false);
    }
  };

  return (
    <div className="relative">
      <Button variant="secondary" size="sm" onClick={() => setOpen((o) => !o)} title="Dice roller">
        <Dices className="w-4 h-4 mr-1" /> Dice
      </Button>
      {open && (
        <div className="absolute z-30 mt-1 w-60 rounded-lg border border-border bg-card p-3 shadow-lg space-y-2">
          <div className="flex flex-wrap gap-1">
            {DICE.map((d) => (
              <button
                key={d}
                onClick={() => setSides(d)}
                className={`px-2 py-1 text-xs rounded border ${sides === d ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}
              >
                d{d}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <div className="flex items-center gap-1">
              <button onClick={() => setCount((c) => Math.max(1, c - 1))} className="px-2 py-0.5 rounded border border-border" aria-label="Fewer dice">−</button>
              <span className="w-14 text-center font-mono text-xs">{count}d{sides}</span>
              <button onClick={() => setCount((c) => Math.min(20, c + 1))} className="px-2 py-0.5 rounded border border-border" aria-label="More dice">+</button>
            </div>
            <div className="flex items-center gap-1 ml-auto">
              <span className="text-xs text-muted-foreground">Mod</span>
              <Input
                type="number"
                value={mod}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMod(parseInt(e.target.value) || 0)}
                className="h-7 w-14 text-center"
              />
            </div>
          </div>
          <Button onClick={roll} disabled={rolling} className="w-full" size="sm">
            {rolling ? 'Rolling...' : 'Roll'}
          </Button>
          {isDM && (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <Switch checked={secret} onCheckedChange={setSecret} />
              <EyeOff className="w-3 h-3" /> Secret (DM only)
            </label>
          )}
          {last && (
            <div className="text-center">
              <div className="text-2xl font-bold font-mono">{last.total}</div>
              <div className="text-[11px] text-muted-foreground font-mono break-words">{last.detail}</div>
            </div>
          )}
          {history.length > 1 && (
            <div className="text-[11px] text-muted-foreground space-y-0.5 max-h-20 overflow-auto">
              {history.slice(1).map((h, i) => (
                <div key={i} className="font-mono truncate">{h}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
