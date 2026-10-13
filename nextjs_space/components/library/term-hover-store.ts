'use client';
// One shared document keydown listener for all library term popovers. The hovered term registers
// its open callback; pressing Ctrl/Cmd while it is hovered opens it.
let hovered: (() => void) | null = null;
let installed = false;

function onKeyDown(e: KeyboardEvent) {
  if ((e.key === 'Control' || e.key === 'Meta') && !e.repeat && hovered) hovered();
}

export function setHoveredTerm(open: () => void) {
  hovered = open;
  if (!installed && typeof document !== 'undefined') {
    document.addEventListener('keydown', onKeyDown);
    installed = true;
  }
}

export function clearHoveredTerm(open: () => void) {
  if (hovered === open) hovered = null;
}
