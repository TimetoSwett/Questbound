// Name rule for POST /api/characters. Create stores this trimmed string and
// does not invent "New Character" when the client omits one.

export type CharacterNameError = 'Character name required' | 'Invalid character name';

const MAX_CHARACTER_NAME = 100;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function parseCharacterCreateBody(body: unknown):
  | { ok: true; campaignId: unknown; name: string; system: unknown }
  | { ok: false; error: CharacterNameError } {
  if (!isPlainRecord(body)) return { ok: false, error: 'Invalid character name' };
  const { name, campaignId, system } = body;
  if (name === undefined || name === null) return { ok: false, error: 'Character name required' };
  if (typeof name !== 'string') return { ok: false, error: 'Invalid character name' };
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: 'Character name required' };
  if (trimmed.length > MAX_CHARACTER_NAME) return { ok: false, error: 'Invalid character name' };
  return { ok: true, campaignId, name: trimmed, system };
}
