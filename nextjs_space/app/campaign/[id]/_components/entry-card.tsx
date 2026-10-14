'use client';

import { useState, type ReactNode } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LibraryTermPopover } from '@/components/library/library-term-popover';
import { rulesUrl } from '@/components/library/types';

export const sheetCardGridClass = 'grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,max(300px,calc((100%_-_2.25rem)/4))),1fr))]';

type Props = {
  name: string;
  unnamed: string;
  meta?: string;
  note?: string;
  body?: string;
  libraryEntryId?: string;
  sourceUrl?: string | null;
  editable: boolean;
  onDelete: () => void;
  children: ReactNode;
};

export function EntryCard({ name, unnamed, meta, note, body, libraryEntryId, sourceUrl, editable, onDelete, children }: Props) {
  const [editing, setEditing] = useState(editable && !name);
  const href = rulesUrl(sourceUrl);
  return <div className="min-h-[300px] flex flex-col gap-3 bg-muted/50 rounded-lg p-3 border border-border">
    <div>
      <h5 className="font-display font-semibold break-words">{libraryEntryId && name ? <LibraryTermPopover term={name} entryId={libraryEntryId}>{name}</LibraryTermPopover> : name || unnamed}</h5>
      {meta && <p className="text-xs text-muted-foreground">{meta}</p>}
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
    <div className="flex-1"><p className="line-clamp-3 whitespace-pre-line text-xs text-muted-foreground">{body}</p></div>
    {href && <a href={href} target="_blank" rel="noopener noreferrer" className="inline-block text-xs text-primary hover:underline">See full rules</a>}
    {editable && <>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" aria-expanded={editing} onClick={() => setEditing(value => !value)}><Pencil className="w-3 h-3" /> Edit</Button>
        <Button variant="ghost" size="icon-sm" aria-label={`Delete ${name || unnamed}`} onClick={onDelete}><Trash2 className="w-3 h-3 text-destructive" /></Button>
      </div>
      {editing && <div className="space-y-2">{children}</div>}
    </>}
  </div>;
}
