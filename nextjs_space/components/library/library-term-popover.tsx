'use client';
// Hover (with Ctrl/Cmd held) or focus + Enter to preview a library term. All text renders as plain text.
import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { classLabel } from '@/components/library/types';
import { ExternalLink } from 'lucide-react';
import { clearHoveredTerm, setHoveredTerm } from '@/components/library/term-hover-store';
import { entryText, fetchLibraryEntry, type FullEntry } from '@/lib/library-terms-client';

type Props = { term: string; entryId: string; children: React.ReactNode };
type LoadState<T> = { status: 'idle' | 'loading' | 'done'; value: T | null };

const CLOSE_DELAY_MS = 150;
const safeHref = (url: string | null | undefined) => (url && /^https?:\/\//i.test(url) ? url : null);

export function LibraryTermPopover({ term, entryId, children }: Props) {
  const [open, setOpen] = React.useState(false);
  const [entry, setEntry] = React.useState<LoadState<FullEntry>>({ status: 'idle', value: null });
  const [expanded, setExpanded] = React.useState(false);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const viaKeyboard = React.useRef(false);
  const termRef = React.useRef<HTMLSpanElement>(null);
  const contentId = React.useId();
  const fullId = React.useId();

  const cancelClose = () => { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; } };
  const scheduleClose = () => { cancelClose(); closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS); };
  React.useEffect(() => cancelClose, []);

  const show = (keyboard: boolean) => {
    cancelClose();
    viaKeyboard.current = keyboard;
    setOpen(true);
    if (entry.status === 'idle') {
      setEntry({ status: 'loading', value: null });
      void fetchLibraryEntry(entryId).then(value => setEntry({ status: 'done', value }));
    }
  };

  const toggleFull = () => setExpanded(x => !x);

  const onPointer = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') setHoveredTerm(openFromKey);
    if (e.pointerType === 'mouse' && (e.ctrlKey || e.metaKey) && !open) show(false);
    else if (open) cancelClose();
  };

  // Ctrl/Cmd pressed while the pointer rests on the term: one shared document listener (term-hover-store).
  const showRef = React.useRef(show);
  React.useEffect(() => { showRef.current = show; });
  const openFromKey = React.useCallback(() => showRef.current(false), []);
  React.useEffect(() => () => clearHoveredTerm(openFromKey), [openFromKey]);

  const m = entry.value;
  const fullText = entryText(m);
  const spellData = m?.kind === 'spell' && m.data && typeof m.data === 'object' ? m.data as { school?: unknown } : null;
  const spellDetails = m?.kind === 'spell' ? [
    typeof spellData?.school === 'string' ? spellData.school : '',
    (m.spellLevels ?? []).map(({ cls, level }) => `${classLabel(cls)} ${level}`).join(' / '),
  ].filter(Boolean).join(' · ') : '';
  const href = safeHref(m?.sourceUrl);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={o => (o ? show(viaKeyboard.current) : setOpen(false))}>
      <PopoverPrimitive.Anchor asChild>
        <span
          ref={termRef}
          role="button"
          tabIndex={0}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? contentId : undefined}
          aria-label={`${term}: show rule (Enter)`}
          title="Ctrl/Cmd + hover or Enter for rules"
          className="underline decoration-dotted underline-offset-2 cursor-help rounded-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onPointerEnter={onPointer}
          onPointerMove={onPointer}
          onPointerLeave={() => { clearHoveredTerm(openFromKey); if (open && !viaKeyboard.current) scheduleClose(); }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !open) { e.preventDefault(); show(true); }
            else if (e.key === 'Escape' && open) { e.preventDefault(); viaKeyboard.current = true; setOpen(false); }
          }}
        >
          {children}
        </span>
      </PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          id={contentId}
          role="dialog"
          aria-label={m?.name ?? term}
          side="top"
          align="start"
          sideOffset={4}
          collisionPadding={8}
          onOpenAutoFocus={e => { if (!viaKeyboard.current) e.preventDefault(); }}
          onCloseAutoFocus={e => { e.preventDefault(); if (viaKeyboard.current) termRef.current?.focus(); }}
          onEscapeKeyDown={() => { viaKeyboard.current = true; }}
          onPointerEnter={cancelClose}
          onPointerLeave={scheduleClose}
          className="z-50 w-80 max-w-[calc(100vw-1rem)] rounded-md border bg-popover p-3 text-sm text-popover-foreground shadow-md outline-none"
        >
          {entry.status !== 'done' ? (
            <p className="text-muted-foreground" aria-live="polite">Loading…</p>
          ) : !m ? (
            <p className="text-muted-foreground">No library entry found for “{term}”.</p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-semibold">{String(m.name)}</p>
                <span className="text-xs uppercase tracking-wide text-muted-foreground">{String(m.kind)}</span>
              </div>
              {spellDetails && <p className="text-xs text-muted-foreground">{spellDetails}</p>}
              {typeof m.summary === 'string' && m.summary ? <p className="whitespace-pre-wrap">{m.summary}</p> : null}
              <div className="flex items-center gap-3 text-xs">
                <button type="button" className="underline text-primary" aria-expanded={expanded} aria-controls={fullId} onClick={toggleFull}>
                  {expanded ? 'Hide full text' : 'Show full text'}
                </button>
                {href ? (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline text-primary">
                    See full rules <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  </a>
                ) : null}
              </div>
              {expanded ? (
                <div id={fullId} className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded bg-muted/50 p-2 text-xs" aria-live="polite">
                  {fullText ?? 'Full text unavailable.'}
                </div>
              ) : null}
            </div>
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
