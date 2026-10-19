'use client';

import { createContext, useContext } from 'react';

// Lets a sheet's host (Character Vault, campaign Characters tab, NPC tab) tell the
// companion controls how to open another sheet, the same way the host opens its own.
interface CompanionNav {
  onOpen: (characterId: string) => void;
  // Called after a companion was created, linked or unlinked so the host can refresh its list.
  onChanged?: () => void;
}

const CompanionNavContext = createContext<CompanionNav | null>(null);

export function CompanionNavProvider({ onOpen, onChanged, children }: CompanionNav & { children: React.ReactNode }) {
  return <CompanionNavContext.Provider value={{ onOpen, onChanged }}>{children}</CompanionNavContext.Provider>;
}

export const useCompanionNav = () => useContext(CompanionNavContext);

export const COMPANIONS_CHANGED_EVENT = 'companions-changed';
