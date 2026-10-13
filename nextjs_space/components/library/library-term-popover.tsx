'use client';
// Hover (with Ctrl/Cmd held) or focus + Enter to preview a library term. All text renders as plain text.
import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { ExternalLink } from 'lucide-react';
import { entryText, fetchLibraryEntry, lookupLibraryTerm, type TermMatch } from '@/lib/library-terms-client';

type Props = { term: string; children: React.ReactNode };
type LoadState<T> = { status: 'idle' | 'loading' | 'done'; value: T | null };

const CLOSE_DELAY_MS = 150;
const safeHref = (url: string | null | undefined) => (url && /^https?:\/\//i.test(url) ? url : null);

export function LibraryTermPopover({ term, children }: Props) {
  const [open, setOpen] = React.useState(false);
  const [match, setMatch] = React.useState<LoadState<TermMatch>>({ status: 'idle', value: null });
  const [full, setFull] = React.useState<LoadState<string>>({ status: 'idle', value: null });
  const [expanded, setExpanded] = React.useState(false);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const viaKeyboard = React.useRef(false);
  const hovering = React.useRef(false);
  const contentId = React.useId();
  const fullId = React.useId();

  const cancelClose = () => { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; } };
  const scheduleClose = () => { cancelClose(); closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS); };
  React.useEffect(() => cancelClose, []);

  const show = (keyboard: boolean) => {
    cancelClose();
    viaKeyboard.current = keyboard;
    setOpen(true);
    if (match.status === 'idle') {
      setMatch({ status: 'loading', value: null });
      void lookupLibraryTerm(term).then(value => setMatch({ status: 'done', value }));
    }
  };

  const toggleFull = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && full.status === 'idle' && match.value) {
      setFull({ status: 'loading', value: null });
      void fetchLibraryEntry(match.value.id).then(entry => setFull({ status: 'done', value: entryText(entry) }));
    }
  };

  const onPointer = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') hovering.current = true;
    if (e.pointerType === 'mouse' && (e.ctrlKey || e.metaKey) && !open) show(false);
    else if (open) cancelClose();
  };

  // Pressing Ctrl/Cmd while the pointer is already resting on the term opens it too.
  const showRef = React.useRef(show);
  React.useEffect(() => { showRef.current = show; });
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Control' || e.key === 'Meta') && hovering.current && !e.repeat) showRef.current(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const m = match.value;
  const href = safeHref(m?.sourceUrl);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={o => (o ? show(viaKeyboard.current) : setOpen(false))}>
      <PopoverPrimitive.Anchor asChild>
        <span
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
          onPointerLeave={() => { hovering.current = false; if (open && !viaKeyboard.current) scheduleClose(); }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !open) { e.preventDefault(); show(true); }
            else if (e.key === 'Escape' && open) { e.preventDefault(); setOpen(false); }
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
          onPointerEnter={cancelClose}
          onPointerLeave={scheduleClose}
          className="z-50 w-80 max-w-[calc(100vw-1rem)] rounded-md border bg-popover p-3 text-sm text-popover-foreground shadow-md outline-none"
        >
          {match.status !== 'done' ? (
            <p className="text-muted-foreground" aria-live="polite">Loading…</p>
          ) : !m ? (
            <p className="text-muted-foreground">No library entry found for “{term}”.</p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-semibold">{m.name}</p>
                <span className="text-xs uppercase tracking-wide text-muted-foreground">{m.kind}</span>
              </div>
              {m.summary ? <p className="whitespace-pre-wrap">{m.summary}</p> : null}
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
                  {full.status !== 'done' ? 'Loading…' : full.value ?? 'Full text unavailable.'}
                </div>
              ) : null}
            </div>
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
