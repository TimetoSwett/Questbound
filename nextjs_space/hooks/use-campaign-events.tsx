'use client';

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

// Live campaign updates over Server-Sent Events. The stream only carries
// invalidations ({topic, version?}); listeners refetch through the normal,
// per-viewer-filtered REST routes. Polling stays on as a fallback and slows
// down while the stream is healthy.

export type CampaignTopic = 'battle' | 'rolls' | 'characters' | 'loot' | 'resync';
export type CampaignEvent = { topic: CampaignTopic; version?: number };
type Listener = (evt: CampaignEvent) => void;

export const FAST_POLL_MS = 3000;
export const SLOW_POLL_MS = 30000;

export type CampaignStreamPause = null | 'session-expired' | 'not-a-member';
type Ctx = { healthy: boolean; paused: CampaignStreamPause; subscribe: (fn: Listener) => () => void };
const CampaignEventsContext = createContext<Ctx | null>(null);

export function CampaignEventsProvider({ campaignId, children }: { campaignId: string; children: ReactNode }) {
  const [healthy, setHealthy] = useState(false);
  const [paused, setPaused] = useState<CampaignStreamPause>(null);
  const [listeners] = useState(() => new Set<Listener>());
  const subscribe = useCallback((fn: Listener) => {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, [listeners]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
    const url = `/api/campaigns/${encodeURIComponent(campaignId)}/events`;
    let es: EventSource | null = null;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;
    let everOpened = false;
    // Dormant: the server closed us (session expired / removed from campaign).
    // We stop reconnecting and only run slow, backed-off checks (plus on
    // focus/visibility) until access is back, then reconnect + full resync.
    let dormant: null | 'session-expired' | 'not-a-member' = null;
    let dormantTry = 0;
    let lastFocusCheck = 0;
    let probeAbort: AbortController | null = null;
    let sessionAbort: AbortController | null = null;
    let checking = false; // single-flight guard for dormant checks
    const emit = (evt: CampaignEvent) => listeners.forEach((fn) => { try { fn(evt); } catch { /* ignore */ } });
    const clearTimer = () => { if (timer) { clearTimeout(timer); timer = null; } };
    const closeEs = () => { if (es) { es.onerror = null; es.close(); es = null; } };

    // Status of the stream endpoint without keeping a stream open.
    const probeStatus = async (): Promise<number> => {
      probeAbort?.abort();
      const ac = new AbortController();
      probeAbort = ac;
      try {
        const r = await fetch(url, { signal: ac.signal, cache: 'no-store' });
        return r.status;
      } catch {
        return 0;
      } finally {
        ac.abort();
        if (probeAbort === ac) probeAbort = null;
      }
    };
    const hasSession = async (): Promise<boolean | null> => {
      sessionAbort?.abort();
      const ac = new AbortController();
      sessionAbort = ac;
      try {
        const r = await fetch('/api/auth/session', { cache: 'no-store', signal: ac.signal });
        if (!r.ok) return null;
        const d = await r.json().catch(() => null);
        return !!d?.user;
      } catch {
        return null;
      } finally {
        if (sessionAbort === ac) sessionAbort = null;
      }
    };
    const abortChecks = () => { sessionAbort?.abort(); sessionAbort = null; probeAbort?.abort(); probeAbort = null; };

    const goDormant = (reason: 'session-expired' | 'not-a-member') => {
      closeEs();
      clearTimer();
      setHealthy(false);
      if (dormant !== reason) { dormantTry = 0; abortChecks(); checking = false; }
      dormant = reason;
      setPaused(reason);
      scheduleDormantCheck();
    };
    const scheduleDormantCheck = () => {
      if (disposed || !dormant) return;
      clearTimer();
      // session-expired: 5s doubling to 5 min; not-a-member: 60s doubling to 30 min.
      const [base, cap] = dormant === 'session-expired' ? [5000, 300000] : [60000, 1800000];
      const delay = Math.min(cap, base * 2 ** Math.min(dormantTry, 10)) * (0.75 + Math.random() / 4);
      dormantTry++;
      timer = setTimeout(dormantCheck, delay);
    };
    const dormantCheck = async () => {
      timer = null;
      if (disposed || !dormant || checking) return;
      checking = true;
      try {
        if (dormant === 'session-expired') {
          const ok = await hasSession();
          if (disposed || !dormant) return;
          if (!ok) return scheduleDormantCheck();
        }
        const status = await probeStatus();
        if (disposed || !dormant) return;
        if (status === 200) { dormant = null; dormantTry = 0; retry = 1; setPaused(null); connect(); return; }
        if (status === 401 && dormant !== 'session-expired') { dormant = 'session-expired'; dormantTry = 0; setPaused(dormant); }
        else if (status === 403 && dormant !== 'not-a-member') { dormant = 'not-a-member'; dormantTry = 0; setPaused(dormant); }
        scheduleDormantCheck();
      } finally {
        checking = false;
      }
    };
    const onFocus = () => {
      // Single-flight: never start a second check or advance backoff while one runs.
      if (!dormant || disposed || checking || document.visibilityState === 'hidden') return;
      const now = Date.now();
      // Throttle focus checks: 5s for expired sessions, 60s for removed members.
      if (now - lastFocusCheck < (dormant === 'session-expired' ? 5000 : 60000)) return;
      lastFocusCheck = now;
      clearTimer();
      dormantCheck();
    };

    const connect = () => {
      if (disposed || dormant) return;
      closeEs();
      const src = new EventSource(url);
      es = src;
      src.addEventListener('ready', () => {
        setHealthy(true);
        // After a reconnect we may have missed events: refetch everything.
        if (everOpened || retry > 0) emit({ topic: 'resync' });
        everOpened = true;
        retry = 0;
      });
      src.addEventListener('update', (e) => {
        try {
          const d = JSON.parse((e as MessageEvent).data);
          if (d && typeof d.topic === 'string') emit({ topic: d.topic, version: typeof d.version === 'number' ? d.version : undefined });
        } catch { /* ignore malformed */ }
      });
      src.addEventListener('bye', (e) => {
        let reason = '';
        try { reason = JSON.parse((e as MessageEvent).data)?.reason ?? ''; } catch { /* ignore */ }
        goDormant(reason === 'not-a-member' ? 'not-a-member' : 'session-expired');
      });
      src.onerror = async () => {
        if (es !== src) return;
        setHealthy(false);
        closeEs();
        if (disposed || dormant) return;
        retry++;
        // A failed (re)connect may be an auth problem: EventSource hides the
        // status, so probe it and go dormant instead of hammering on 401/403.
        const status = await probeStatus();
        if (disposed || dormant) return;
        if (status === 401) return goDormant('session-expired');
        if (status === 403) return goDormant('not-a-member');
        // Exponential backoff with jitter, capped at 60s.
        const delay = Math.min(60000, 1000 * 2 ** Math.min(retry - 1, 6)) * (0.5 + Math.random() / 2);
        clearTimer();
        timer = setTimeout(connect, delay);
      };
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    connect();
    return () => {
      disposed = true;
      dormant = null;
      clearTimer();
      abortChecks();
      closeEs();
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      setHealthy(false);
    };
  }, [campaignId, listeners]);

  const value = useMemo(() => ({ healthy, paused, subscribe }), [healthy, paused, subscribe]);
  return createElement(CampaignEventsContext.Provider, { value }, children);
}

/**
 * Call `onChange` (debounced) when one of `topics` is invalidated, or after a
 * reconnect. Returns the poll interval to use: slow while the stream is
 * healthy, fast otherwise (and when there is no provider), or null while the
 * stream is paused (signed out / removed): callers must not poll then; a full
 * 'resync' fires when access returns.
 */
export function useCampaignTopic(topics: CampaignTopic[], onChange: (evt: CampaignEvent) => void, debounceMs = 150): number | null {
  const ctx = useContext(CampaignEventsContext);
  const cbRef = useRef(onChange);
  useEffect(() => { cbRef.current = onChange; }, [onChange]);
  const key = topics.join(',');
  useEffect(() => {
    if (!ctx) return;
    const wanted = new Set(key.split(','));
    let timer: ReturnType<typeof setTimeout> | null = null;
    let last: CampaignEvent | null = null;
    const unsub = ctx.subscribe((evt) => {
      if (evt.topic !== 'resync' && !wanted.has(evt.topic)) return;
      // Keep the event with the highest known version (undefined = force).
      if (!last || evt.version === undefined || (last.version !== undefined && evt.version > last.version)) last = evt;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { const e = last!; last = null; timer = null; cbRef.current(e); }, debounceMs);
    });
    return () => { unsub(); if (timer) clearTimeout(timer); };
  }, [ctx, key, debounceMs]);
  if (ctx?.paused) return null;
  return ctx?.healthy ? SLOW_POLL_MS : FAST_POLL_MS;
}
