// Whitelist a request body down to known, correctly typed fields for a partial update.

export type FieldKind = 'string' | 'number' | 'visibility';

const VISIBILITIES = new Set(['dm_only', 'shared']);

function valid(kind: FieldKind, value: unknown): boolean {
  if (kind === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (kind === 'visibility') return typeof value === 'string' && VISIBILITIES.has(value);
  return typeof value === 'string';
}

/**
 * Copy only the listed fields that are present in body. Unlisted keys are
 * ignored; returns null if a listed field has the wrong type.
 */
export function pickFields(body: unknown, fields: Readonly<Record<string, FieldKind>>): Record<string, unknown> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {};
  const src = body as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, kind] of Object.entries(fields)) {
    if (src[key] === undefined) continue;
    if (!valid(kind, src[key])) return null;
    out[key] = src[key];
  }
  return out;
}
