// Fog-of-war editing helpers for the battle map. Fog is stored as an array of "x,y" cell keys.

export type FogMode = 'cover' | 'reveal';
export const FOG_BRUSH_SIZES = [1, 3, 5] as const;
export type FogBrushSize = typeof FOG_BRUSH_SIZES[number];

const clamp = (v: number, max: number) => Math.max(0, Math.min(max - 1, Math.floor(v)));

/** Every cell key in the rectangle spanned by two corner cells (inclusive, any drag direction), clipped to the grid. */
export function rectCells(ax: number, ay: number, bx: number, by: number, gridWidth: number, gridHeight: number): string[] {
  if (gridWidth <= 0 || gridHeight <= 0) return [];
  const x0 = clamp(Math.min(ax, bx), gridWidth), x1 = clamp(Math.max(ax, bx), gridWidth);
  const y0 = clamp(Math.min(ay, by), gridHeight), y1 = clamp(Math.max(ay, by), gridHeight);
  const out: string[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push(`${x},${y}`);
  return out;
}

/** Square brush of `size` cells (1, 3 or 5) centred on a cell, clipped to the grid. */
export function brushCells(x: number, y: number, size: number, gridWidth: number, gridHeight: number): string[] {
  const r = Math.floor((Math.max(1, size) - 1) / 2);
  if (x < 0 || y < 0 || x >= gridWidth || y >= gridHeight) return [];
  return rectCells(x - r, y - r, x + r, y + r, gridWidth, gridHeight);
}

/** Every cell of the grid. */
export function allCells(gridWidth: number, gridHeight: number): string[] {
  return rectCells(0, 0, gridWidth - 1, gridHeight - 1, gridWidth, gridHeight);
}

/** Fog list after covering or revealing cells. Keeps existing order, no duplicates. */
export function applyFog(fog: readonly string[], cells: readonly string[], mode: FogMode): string[] {
  if (mode === 'reveal') {
    const drop = new Set(cells);
    return fog.filter(key => !drop.has(key));
  }
  const seen = new Set(fog);
  const out = [...new Set(fog)];
  for (const key of cells) if (!seen.has(key)) { seen.add(key); out.push(key); }
  return out;
}

/** A gesture that starts on a fogged cell reveals; otherwise it covers. */
export function fogModeAt(fog: readonly string[], x: number, y: number): FogMode {
  return fog.includes(`${x},${y}`) ? 'reveal' : 'cover';
}
