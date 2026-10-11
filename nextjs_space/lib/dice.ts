// Server-side dice rolling. Rolls happen on the server (crypto randomness)
// so results can't be faked by the client.
import { randomInt } from 'crypto';

export interface ParsedRoll {
  count: number;
  sides: number;
  modifier: number;
  /** Normalized expression, e.g. "2d20+5". */
  expression: string;
}

/** Parse "2d20+5", "d6", "3d8-2". Returns null when invalid or out of bounds. */
export function parseDiceExpression(input: string): ParsedRoll | null {
  const m = /^\s*(\d*)\s*d\s*(\d+)\s*([+-]\s*\d+)?\s*$/i.exec(input ?? '');
  if (!m) return null;
  const count = m[1] === '' ? 1 : parseInt(m[1], 10);
  const sides = parseInt(m[2], 10);
  const modifier = m[3] ? parseInt(m[3].replace(/\s+/g, ''), 10) : 0;
  if (!Number.isFinite(count) || !Number.isFinite(sides) || !Number.isFinite(modifier)) return null;
  if (count < 1 || count > 100 || sides < 2 || sides > 1000) return null;
  if (Math.abs(modifier) > 100000) return null;
  const modStr = modifier > 0 ? `+${modifier}` : modifier < 0 ? `${modifier}` : '';
  return { count, sides, modifier, expression: `${count}d${sides}${modStr}` };
}

/** Roll dice server-side. */
export function rollDice(
  count: number,
  sides: number,
  modifier: number,
): { results: number[]; total: number } {
  const results = Array.from({ length: count }, () => randomInt(1, sides + 1));
  return { results, total: results.reduce((a, b) => a + b, 0) + modifier };
}
