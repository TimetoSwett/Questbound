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

type Ctx = { healthy: boolean; subscribe: (fn: Listener) => () => void };
const CampaignEventsContext = createContext<Ctx | null>(null);

export function CampaignEventsProvider({ campaignId, children }: { campaignId: string; children: ReactNode }) {
  const [healthy, setHealthy] = useState(false);
  const [listeners] = useState(() => new Set<Listener>());
  const subscribe = useCallback((fn: Listener) => {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, [listeners]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
    let es: EventSource | null = null;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    let everOpened = false;
    const emit = (evt: CampaignEvent) => listeners.forEach((fn) => { try { fn(evt); } catch { /* ignore */ } });

    const connect = () => {
      if (closed) return;
      es = new EventSource(`/api/campaigns/${encodeURIComponent(campaignId)}/events`);
      es.addEventListener('ready', () => {
        setHealthy(true);
        // After a reconnect we may have missed events: refetch everything.
        if (everOpened || retry > 0) emit({ topic: 'resync' });
        everOpened = true;
        retry = 0;
      });
      es.addEventListener('update', (e) => {
        try {
          const d = JSON.parse((e as MessageEvent).data);
          if (d && typeof d.topic === 'string') emit({ topic: d.topic, version: typeof d.version === 'number' ? d.version : undefined });
        } catch { /* ignore malformed */ }
      });
      es.addEventListener('bye', () => { es?.close(); setHealthy(false); closed = true; });
      es.onerror = () => {
        setHealthy(false);
        es?.close();
        es = null;
        if (closed) return;
        // Exponential backoff with jitter, capped at 60s.
        const delay = Math.min(60000, 1000 * 2 ** Math.min(retry, 6)) * (0.5 + Math.random() / 2);
        retry++;
        timer = setTimeout(connect, delay);
      };
    };
    connect();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      es?.close();
      setHealthy(false);
    };
  }, [campaignId, listeners]);

  const value = useMemo(() => ({ healthy, subscribe }), [healthy, subscribe]);
  return createElement(CampaignEventsContext.Provider, { value }, children);
}

/**
 * Call `onChange` (debounced) when one of `topics` is invalidated, or after a
 * reconnect. Returns the poll interval to use: slow while the stream is
 * healthy, fast otherwise (and when there is no provider).
 */
export function useCampaignTopic(topics: CampaignTopic[], onChange: (evt: CampaignEvent) => void, debounceMs = 150): number {
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
  return ctx?.healthy ? SLOW_POLL_MS : FAST_POLL_MS;
}
