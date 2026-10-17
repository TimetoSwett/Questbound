'use client';

import { SpellEntryForm } from '@/components/library/spell-entry-form';

export interface SpellLibraryPrefill {
  name?: string;
  school?: string;
  description?: string;
  level?: number;
}

export function AddSpellToLibraryDialog({ open, onClose, prefill, onCreated }: {
  open: boolean;
  onClose: () => void;
  prefill?: SpellLibraryPrefill;
  onCreated?: (entry: { id: string; name: string }) => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-card rounded-lg border border-border p-5 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h4 className="font-display font-semibold mb-4">Add spell to library</h4>
        <SpellEntryForm key={JSON.stringify(prefill ?? null)} prefill={prefill} onCancel={onClose} onCreated={(entry) => { onCreated?.(entry); onClose(); }} />
      </div>
    </div>
  );
}
