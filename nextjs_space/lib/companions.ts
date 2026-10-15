import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';

// Companion sheets are normal Character rows. Access to a companion is decided
// by exactly the same rule as any character; the owner link grants nothing.

export interface AccessFields {
  userId: string;
  campaignId: string | null;
}

// The one visibility/edit rule for a sheet (GET single, portrait, PUT, DELETE):
// its owner, or the DM of its campaign. `role` is the requester's role in the
// character's campaign (null when the character has no campaign or they are not a member).
export function canAccessCharacter(character: AccessFields, userId: string, role: string | null): boolean {
  return character.userId === userId || (character.campaignId !== null && role === 'dm');
}

// Roles of `userId` in each distinct campaign of `characters`.
export async function rolesForCharacters(
  prisma: PrismaClient,
  userId: string,
  characters: ReadonlyArray<Pick<AccessFields, 'campaignId'>>,
): Promise<Map<string, string>> {
  const campaignIds = [...new Set(characters.flatMap((c) => (c.campaignId ? [c.campaignId] : [])))];
  if (!campaignIds.length) return new Map();
  const memberships = await prisma.campaignMembership.findMany({
    where: { userId, campaignId: { in: campaignIds } },
    select: { campaignId: true, role: true },
  });
  return new Map(memberships.map((m) => [m.campaignId, m.role]));
}

export function filterAccessible<T extends AccessFields>(
  characters: readonly T[],
  userId: string,
  roles: ReadonlyMap<string, string>,
): T[] {
  return characters.filter((c) => canAccessCharacter(c, userId, c.campaignId ? roles.get(c.campaignId) ?? null : null));
}

export async function accessibleCharacters<T extends AccessFields>(
  prisma: PrismaClient,
  userId: string,
  characters: readonly T[],
): Promise<T[]> {
  return filterAccessible(characters, userId, await rolesForCharacters(prisma, userId, characters));
}

export async function canAccessCharacterById(prisma: PrismaClient, userId: string, character: AccessFields): Promise<boolean> {
  return (await accessibleCharacters(prisma, userId, [character])).length === 1;
}

// Null out ownerCharacterId on rows whose owner the requester cannot access, so
// a hidden owner's id never leaks through a companion the requester can see.
export async function redactHiddenOwnerIds<T extends { ownerCharacterId?: string | null }>(
  prisma: PrismaClient,
  userId: string,
  rows: readonly T[],
): Promise<T[]> {
  const ownerIds = [...new Set(rows.flatMap((r) => (r.ownerCharacterId ? [r.ownerCharacterId] : [])))];
  if (!ownerIds.length) return [...rows];
  const owners = await prisma.character.findMany({
    where: { id: { in: ownerIds } },
    select: { id: true, userId: true, campaignId: true },
  });
  const visible = new Set((await accessibleCharacters(prisma, userId, owners)).map((o) => o.id));
  return rows.map((r) => (r.ownerCharacterId && !visible.has(r.ownerCharacterId) ? { ...r, ownerCharacterId: null } : r));
}

// Companions are one level deep: a companion cannot own companions, and an owner
// of companions cannot become a companion. These are the shared error messages.
export const COMPANION_ERRORS = {
  ownerIsCompanion: 'A companion cannot have companions of its own',
  hasCompanions: 'A character that has companions cannot become a companion; unlink its companions first',
} as const;

export const companionTypeSchema = z.string().trim().max(60);
const nameSchema = z.string().trim().min(1).max(120);
const idSchema = z.string().min(1).max(100);

export const createCompanionSchema = z.object({
  ownerId: idSchema,
  name: nameSchema,
  companionType: companionTypeSchema.default(''),
}).strict();

export const linkCompanionSchema = z.object({
  characterId: idSchema,
  ownerId: idSchema.nullable().optional(),
  companionType: companionTypeSchema.optional(),
}).strict().refine((v) => v.ownerId !== undefined || v.companionType !== undefined, {
  message: 'ownerId or companionType required',
});

export const companionQuerySchema = z.object({ characterId: idSchema });

export interface CompanionSummary {
  id: string;
  name: string;
  companionType: string;
  portraitPath: string | null;
  portraitIsPublic: boolean;
}

export const companionSelect = {
  id: true, name: true, companionType: true, portraitPath: true, portraitIsPublic: true,
  userId: true, campaignId: true,
} as const;

export function toCompanionSummary(c: CompanionSummary): CompanionSummary {
  return { id: c.id, name: c.name, companionType: c.companionType, portraitPath: c.portraitPath, portraitIsPublic: c.portraitIsPublic };
}

export interface CompanionListItem {
  id: string;
  ownerCharacterId?: string | null;
  companionType?: string;
}

// Order a flat character list so each companion follows its owner (when the owner
// is in the list), one level only. Companions whose owner is absent stay in place as
// normal entries (`isCompanion` still true, `depth` 0), so a hidden owner leaves no trace.
export function groupCompanions<T extends CompanionListItem>(items: readonly T[]): Array<{ item: T; depth: number; isCompanion: boolean }> {
  const ids = new Set(items.map((i) => i.id));
  const isChild = (i: T) => !!i.ownerCharacterId && i.ownerCharacterId !== i.id && ids.has(i.ownerCharacterId);
  const children = new Map<string, T[]>();
  for (const item of items) {
    if (isChild(item)) children.set(item.ownerCharacterId!, [...(children.get(item.ownerCharacterId!) ?? []), item]);
  }
  const out: Array<{ item: T; depth: number; isCompanion: boolean }> = [];
  for (const item of items) {
    if (isChild(item)) continue;
    out.push({ item, depth: 0, isCompanion: !!item.ownerCharacterId || !!item.companionType });
    for (const child of children.get(item.id) ?? []) out.push({ item: child, depth: 1, isCompanion: true });
  }
  return out;
}
