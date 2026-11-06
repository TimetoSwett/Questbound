'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { defaultCyberpunkSheet, readCyberpunkSheet, type CyberpunkSheet } from '@/lib/cyberpunk-sheet';
import {
  createCyberpunkSaveQueue,
  createLatestRef,
  type CyberpunkSheetUpdater,
} from '@/lib/cyberpunk-sheet-persistence';
import { CyberpunkBasicsPanel } from './cyberpunk/basics-panel';
import { CyberpunkInventoryLifepathPanel } from './cyberpunk/inventory-lifepath-panel';

function saveCyberpunk(characterId: string, nextName: string, nextSheet: CyberpunkSheet, keepalive = false) {
  return fetch('/api/characters', {
    method: 'PUT',
    keepalive,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: characterId, name: nextName, cyberpunk: nextSheet }),
  });
}

export function CyberpunkCharacterSheet({ characterId, editable = true }: { characterId: string; editable?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [name, setName] = useState('');
  const [sheet, setSheet] = useState<CyberpunkSheet>(defaultCyberpunkSheet);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [activeId, setActiveId] = useState(characterId);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const payloadRef = useRef<{ name: string; sheet: CyberpunkSheet }>({ name: '', sheet: defaultCyberpunkSheet() });
  const editableRef = useRef(editable);
  const nameRef = useRef(name);
  const sheetDraft = useRef(createLatestRef(defaultCyberpunkSheet()));
  const queueRef = useRef<ReturnType<typeof createCyberpunkSaveQueue> | null>(null);
  if (queueRef.current === null) {
    queueRef.current = createCyberpunkSaveQueue(
      (job) => saveCyberpunk(job.characterId, job.name, job.sheet, job.keepalive).then(
        (res) => ({ ok: res.ok }),
        () => ({ ok: false }),
      ),
      {
        onSettled: ({ job, ok, superseded }) => {
          if (job.keepalive || superseded) return;
          if (!ok) {
            setStatus('error');
            toast.error('Save failed');
            return;
          }
          setStatus('saved');
        },
      },
    );
  }

  if (activeId !== characterId) {
    const blank = defaultCyberpunkSheet();
    setActiveId(characterId);
    setLoading(true);
    setMissing(false);
    setStatus('idle');
    setName('');
    setSheet(blank);
  }

  useEffect(() => {
    editableRef.current = editable;
  }, [editable]);

  useEffect(() => {
    let active = true;
    fetch(`/api/characters/single?id=${characterId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active) return;
        if (!data) {
          setMissing(true);
          return;
        }
        const nextName = typeof data.name === 'string' ? data.name : '';
        const nextSheet = readCyberpunkSheet(data.cyberpunk);
        nameRef.current = nextName;
        sheetDraft.current.set(nextSheet);
        payloadRef.current = { name: nextName, sheet: nextSheet };
        setName(nextName);
        setSheet(nextSheet);
      })
      .catch(() => { if (active) setMissing(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => {
      active = false;
      if (!saveTimer.current) return;
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      if (!editableRef.current) return;
      const pending = payloadRef.current;
      queueRef.current?.enqueue({
        characterId,
        name: pending.name,
        sheet: pending.sheet,
        keepalive: true,
      });
    };
  }, [characterId]);

  const persist = useCallback((nextName: string, nextSheet: CyberpunkSheet) => {
    if (!editableRef.current) return;
    setStatus('saving');
    queueRef.current?.enqueue({
      characterId,
      name: nextName,
      sheet: nextSheet,
      keepalive: false,
    });
  }, [characterId]);

  const scheduleSave = useCallback((nextName: string, nextSheet: CyberpunkSheet) => {
    payloadRef.current = { name: nextName, sheet: nextSheet };
    if (!editableRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      const current = payloadRef.current;
      persist(current.name, current.sheet);
    }, 600);
  }, [persist]);

  const editSheet = (updater: CyberpunkSheetUpdater) => {
    const next = sheetDraft.current.update(updater);
    setSheet(next);
    scheduleSave(nameRef.current, next);
  };

  if (activeId !== characterId || loading) {
    return <p className="py-10 text-center text-muted-foreground">Loading sheet...</p>;
  }
  if (missing) {
    return <p className="py-10 text-center text-muted-foreground">Couldn&apos;t load this character.</p>;
  }

  const statusLabel = status === 'saving' ? 'Saving...' : status === 'saved' ? 'Saved' : status === 'error' ? 'Not saved' : editable ? '' : 'View only';

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Cyberpunk 2020</p>
          <Label htmlFor="cp-name" className="mt-2 block">Character name</Label>
          <Input
            id="cp-name"
            value={name}
            disabled={!editable}
            placeholder="Unnamed"
            className="mt-1 font-display text-lg"
            onChange={(event) => {
              const nextName = event.target.value;
              nameRef.current = nextName;
              setName(nextName);
              scheduleSave(nextName, sheetDraft.current.get());
            }}
          />
        </div>
        <p className="pt-6 text-xs text-muted-foreground" aria-live="polite">{statusLabel}</p>
      </div>
      <CyberpunkBasicsPanel key={`${characterId}-basics`} sheet={sheet} editable={editable} onChange={editSheet} />
      <CyberpunkInventoryLifepathPanel key={`${characterId}-inventory`} sheet={sheet} editable={editable} onChange={editSheet} />
    </div>
  );
}
