'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Dices, EyeOff, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useCampaignTopic } from '@/hooks/use-campaign-events';
import { encodeRollCursor } from '@/lib/dice-roll-cursor';

interface Roll {
  id: string;
  userName: string;
  expression: string;
  results: unknown;
  total: number;
  isSecret: boolean;
  createdAt: string;
}

const PAGE_SIZE = 100;

type RollCursor = Pick<Roll, 'createdAt' | 'id'>;

function cursorParams(direction: 'before' | 'after', cursor: RollCursor): string {
  return `&${direction}=${encodeURIComponent(cursor.createdAt)}&${direction}Id=${encodeURIComponent(cursor.id)}`;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(+d) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function fmtResults(results: unknown): string {
  return Array.isArray(results) ? results.map(String).join(', ') : '';
}

export function RollLog({ campaignId, role }: { campaignId: string; role: string }) {
  const isDM = role === 'dm';
  const [rolls, setRolls] = useState<Roll[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expr, setExpr] = useState('');
  const [secret, setSecret] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true); // auto-scroll sticks to bottom while true
  const latestRef = useRef<RollCursor | null>(null);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }, []);

  // Fetch rolls newer than what we have (used by the poller and after our own roll).
  const fetchNew = useCallback(async () => {
    const after = latestRef.current;
    const url =
      `/api/dice-rolls?campaignId=${campaignId}&limit=${PAGE_SIZE}` +
      (after ? cursorParams('after', after) : '');
    const res = await fetch(url);
    if (!res.ok) return;
    const data: Roll[] = await res.json();
    if (!data.length) return;
    setRolls((prev) => {
      const ids = new Set(prev.map((r) => r.id));
      const fresh = data.filter((r) => !ids.has(r.id));
      return fresh.length ? [...prev, ...fresh] : prev;
    });
    latestRef.current = data[data.length - 1];
    if (pinnedRef.current) requestAnimationFrame(scrollToBottom);
  }, [campaignId, scrollToBottom]);

  // Initial load: most recent rolls, then pin to bottom.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/dice-rolls?campaignId=${campaignId}&limit=${PAGE_SIZE}`);
      if (!res.ok || cancelled) return;
      const data: Roll[] = await res.json();
      setRolls(data);
      setHasMore(data.length === PAGE_SIZE);
      latestRef.current = data.length ? data[data.length - 1] : null;
      requestAnimationFrame(scrollToBottom);
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId, scrollToBottom]);

  // Live updates: SSE invalidations trigger fetchNew; polling is the fallback
  // (slow while the stream is healthy). The GET route filters secret rolls.
  const pollMs = useCampaignTopic(['rolls'], fetchNew);
  useEffect(() => {
    if (pollMs === null) return; // stream paused (signed out / removed): no polling
    const t = setInterval(fetchNew, pollMs);
    return () => clearInterval(t);
  }, [fetchNew, pollMs]);

  const loadOlder = async () => {
    if (!rolls.length || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/dice-rolls?campaignId=${campaignId}&limit=50&cursor=${encodeURIComponent(encodeRollCursor(rolls[0]))}`,
      );
      if (!res.ok) return;
      const data: Roll[] = await res.json();
      const el = scrollRef.current;
      const prevHeight = el?.scrollHeight ?? 0;
      setRolls((prev) => {
        const ids = new Set(prev.map((r) => r.id));
        const older = data.filter((r) => !ids.has(r.id));
        return older.length ? [...older, ...prev] : prev;
      });
      setHasMore(data.length === 50);
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevHeight;
      });
    } finally {
      setLoadingMore(false);
    }
  };

  const submitRoll = async () => {
    const expression = expr.trim();
    if (!expression) return;
    setError(null);
    const res = await fetch('/api/dice-rolls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId, expression, isSecret: isDM && secret }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? 'Roll failed');
      return;
    }
    setExpr('');
    pinnedRef.current = true;
    void fetchNew();
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
        <Dices className="w-4 h-4 text-primary" />
        <h2 className="font-display text-sm font-bold uppercase tracking-widest">Roll Log</h2>
      </div>

      <div ref={scrollRef} onScroll={onScroll} className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-2">
        {hasMore && rolls.length > 0 && (
          <Button variant="ghost" size="sm" className="w-full text-xs" onClick={loadOlder} disabled={loadingMore}>
            <ChevronUp className="w-3.5 h-3.5 mr-1" />
            {loadingMore ? 'Loading...' : 'Load older rolls'}
          </Button>
        )}
        {rolls.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">No rolls yet. Make the first one below.</p>
        )}
        {rolls.map((r) => (
          <div
            key={r.id}
            className={`rounded-lg border px-2.5 py-1.5 ${r.isSecret ? 'border-dashed border-primary/50 bg-primary/5' : 'border-border bg-card'}`}
          >
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs font-semibold truncate">{r.userName}</span>
              {r.isSecret && (
                <span className="flex items-center gap-0.5 text-[10px] text-primary shrink-0">
                  <EyeOff className="w-2.5 h-2.5" /> secret
                </span>
              )}
              <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{fmtTime(r.createdAt)}</span>
            </div>
            <div className="font-mono text-[13px] break-words">
              <span className="text-muted-foreground">{r.expression}: </span>
              <span className="text-muted-foreground">[{fmtResults(r.results)}] = </span>
              <span className="font-bold">{r.total}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-border p-3 space-y-2">
        {isDM && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <Switch checked={secret} onCheckedChange={setSecret} />
            <EyeOff className="w-3 h-3" /> Secret (DM only)
          </label>
        )}
        <div className="flex gap-2">
          <Input
            value={expr}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExpr(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter') void submitRoll();
            }}
            placeholder="2d20+5"
            className="h-8 font-mono text-sm"
            aria-label="Dice expression"
          />
          <Button size="sm" className="h-8 shrink-0" onClick={() => void submitRoll()}>
            <Dices className="w-4 h-4 mr-1" /> Roll
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}
