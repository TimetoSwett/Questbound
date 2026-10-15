'use client';

import { useEffect, useState } from 'react';
import { COMPANIONS_CHANGED_EVENT } from './companion-nav';

export interface CompanionSummary {
  id: string;
  name: string;
  companionType: string;
  portraitPath: string | null;
  portraitIsPublic: boolean;
}

export interface CompanionData {
  owner: CompanionSummary | null;
  companions: CompanionSummary[];
  siblings: CompanionSummary[];
}

// Loads owner / companions / siblings of a sheet and refreshes when any companion control changes them.
export function useCompanions(characterId: string) {
  const [data, setData] = useState<CompanionData | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const onChanged = () => setVersion((v) => v + 1);
    window.addEventListener(COMPANIONS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(COMPANIONS_CHANGED_EVENT, onChanged);
  }, []);
  useEffect(() => {
    let active = true;
    fetch(`/api/characters/companions?characterId=${encodeURIComponent(characterId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null)
      .then((json) => { if (active) setData(json); });
    return () => { active = false; };
  }, [characterId, version]);
  return { data };
}
