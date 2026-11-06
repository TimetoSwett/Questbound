'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { defaultCyberpunkSheet, readCyberpunkSheet, type CyberpunkSheet } from '@/lib/cyberpunk-sheet';
import { CyberpunkBasicsPanel } from './cyberpunk/basics-panel';

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
  const sheetRef = useRef(sheet);

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
        sheetRef.current = nextSheet;
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
      void saveCyberpunk(characterId, pending.name, pending.sheet, true);
    };
  }, [characterId]);

  const persist = useCallback(async (nextName: string, nextSheet: CyberpunkSheet) => {
    if (!editableRef.current) return;
    setStatus('saving');
    try {
      const res = await saveCyberpunk(characterId, nextName, nextSheet);
      if (!res.ok) {
        setStatus('error');
        toast.error('Save failed');
        return;
      }
      setStatus('saved');
    } catch {
      setStatus('error');
      toast.error('Save error');
    }
  }, [characterId]);

  const scheduleSave = useCallback((nextName: string, nextSheet: CyberpunkSheet) => {
    payloadRef.current = { name: nextName, sheet: nextSheet };
    if (!editableRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      const current = payloadRef.current;
      void persist(current.name, current.sheet);
    }, 600);
  }, [persist]);

  const editSheet = (next: CyberpunkSheet) => {
    sheetRef.current = next;
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
              scheduleSave(nextName, sheetRef.current);
            }}
          />
        </div>
        <p className="pt-6 text-xs text-muted-foreground" aria-live="polite">{statusLabel}</p>
      </div>
      <CyberpunkBasicsPanel key={characterId} sheet={sheet} editable={editable} onChange={editSheet} />
    </div>
  );
}
