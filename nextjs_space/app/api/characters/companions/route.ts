export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getUserRole } from '@/lib/campaign-helpers';
import {
  accessibleCharacters, canAccessCharacterById, companionQuerySchema, companionSelect, createCompanionSchema,
  COMPANION_ERRORS, linkCompanionSchema, toCompanionSummary,
} from '@/lib/companions';

const updateSelect = { id: true, name: true, companionType: true, ownerCharacterId: true, campaignId: true } as const;
const accessFields = { id: true, userId: true, campaignId: true, ownerCharacterId: true } as const;

const SAME_PLAYER_ERROR = 'A companion must belong to the same player as its owner';

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// An integrity rule failed inside a transaction; carries the response to send.
class Rejection {
  constructor(readonly status: number, readonly error: string) {}
}
const rejected = (e: unknown) => (e instanceof Rejection ? NextResponse.json({ error: e.error }, { status: e.status }) : null);

// Row-lock the given characters (sorted by id so concurrent transactions can't deadlock).
// Everything read after this sees the committed state of any competing link/create.
async function lockCharacters(tx: Tx, ids: string[]) {
  await tx.$queryRaw`SELECT id FROM "Character" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
}

// GET ?characterId= -> { owner, companions, siblings }
//   owner:      summary of the character's owner, only if the caller may see it, else null
//   companions: visible companions of the character
//   siblings:   visible companions of that (visible) owner, including the character itself
// Visibility is the normal character rule (sheet owner or campaign DM); the owner
// link never grants access. A character the caller can't see yields empty results.
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id;

  const query = companionQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return NextResponse.json({ error: 'characterId required' }, { status: 400 });

  const empty = { owner: null, companions: [], siblings: [] };
  const character = await prisma.character.findUnique({ where: { id: query.data.characterId }, select: accessFields });
  if (!character || !(await canAccessCharacterById(prisma, userId, character))) return NextResponse.json(empty);

  const listFor = async (ownerId: string) =>
    (await accessibleCharacters(prisma, userId, await prisma.character.findMany({
      where: { ownerCharacterId: ownerId },
      select: companionSelect,
      orderBy: { createdAt: 'asc' },
    }))).map(toCompanionSummary);

  const companions = await listFor(character.id);

  let owner = null;
  let siblings: typeof companions = [];
  if (character.ownerCharacterId) {
    const ownerRow = await prisma.character.findUnique({ where: { id: character.ownerCharacterId }, select: companionSelect });
    if (ownerRow && (await canAccessCharacterById(prisma, userId, ownerRow))) {
      owner = toCompanionSummary(ownerRow);
      siblings = await listFor(ownerRow.id);
    }
  }
  return NextResponse.json({ owner, companions, siblings, isCompanion: !!character.ownerCharacterId });
}

// POST {ownerId, name, companionType?} -> create a companion sheet for an owner the caller can edit.
// The new sheet belongs to the owner character's user (not the caller), so a DM creating a
// companion for a player's character hands it to that player; the DM still sees it as campaign DM.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id;

  const parsed = createCompanionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });

  const owner = await prisma.character.findUnique({ where: { id: parsed.data.ownerId }, select: accessFields });
  if (!owner) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!(await canAccessCharacterById(prisma, userId, owner))) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  if (owner.campaignId && !(await getUserRole(userId, owner.campaignId))) {
    return NextResponse.json({ error: 'Not a member' }, { status: 403 });
  }


  try {
    const companion = await prisma.$transaction(async (tx) => {
      await lockCharacters(tx, [owner.id]);
      // Re-read under the lock: a concurrent link may have just made the owner a companion.
      const locked = await tx.character.findUnique({ where: { id: owner.id }, select: accessFields });
      if (!locked) throw new Rejection(404, 'Not found');
      if (locked.ownerCharacterId) throw new Rejection(400, COMPANION_ERRORS.ownerIsCompanion);
      return tx.character.create({
        data: {
          userId: locked.userId,
          campaignId: locked.campaignId,
          ownerCharacterId: locked.id,
          companionType: parsed.data.companionType,
          name: parsed.data.name,
          skills: JSON.stringify([]),
          equipment: JSON.stringify([]),
          feats: JSON.stringify([]),
          spells: JSON.stringify({ slots: {}, known: [] }),
        },
      });
    });
    return NextResponse.json(companion);
  } catch (e) {
    const r = rejected(e);
    if (r) return r;
    throw e;
  }
}

// PUT {characterId, ownerId?, companionType?}
//   ownerId = string -> link characterId as a companion of ownerId (caller must edit both;
//                       same campaign; one level only; no self-link; not already owned by someone else)
//   ownerId = null   -> unlink (caller must edit the companion or its current owner)
//   companionType    -> set the free-text type (caller must edit the companion)
export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id;

  const parsed = linkCompanionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  const { characterId, ownerId, companionType } = parsed.data;

  const character = await prisma.character.findUnique({ where: { id: characterId }, select: accessFields });
  if (!character) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const canEditCharacter = await canAccessCharacterById(prisma, userId, character);
  const forbidden = () => NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const data: { ownerCharacterId?: string | null; companionType?: string } = {};
  if (companionType !== undefined) {
    if (!canEditCharacter) return forbidden();
    data.companionType = companionType;
  }

  if (ownerId === null) {
    let allowed = canEditCharacter;
    if (!allowed && character.ownerCharacterId) {
      const currentOwner = await prisma.character.findUnique({ where: { id: character.ownerCharacterId }, select: accessFields });
      allowed = !!currentOwner && (await canAccessCharacterById(prisma, userId, currentOwner));
    }
    if (!allowed) return forbidden();
    data.ownerCharacterId = null;
  } else if (ownerId !== undefined) {
    if (ownerId === characterId) return NextResponse.json({ error: 'A character cannot be its own companion' }, { status: 400 });
    const owner = await prisma.character.findUnique({ where: { id: ownerId }, select: accessFields });
    if (!owner) return NextResponse.json({ error: 'Owner not found' }, { status: 404 });
    if (!canEditCharacter || !(await canAccessCharacterById(prisma, userId, owner))) return forbidden();
    if (owner.userId !== character.userId) return NextResponse.json({ error: SAME_PLAYER_ERROR }, { status: 400 });
    // Integrity checks and the write run in one transaction with both rows locked, so two
    // concurrent links (A->B and B->A) can't both pass their checks and form a loop.
    try {
      const updated = await prisma.$transaction(async (tx) => {
        await lockCharacters(tx, [characterId, ownerId]);
        const [lockedChar, lockedOwner] = await Promise.all([
          tx.character.findUnique({ where: { id: characterId }, select: accessFields }),
          tx.character.findUnique({ where: { id: ownerId }, select: accessFields }),
        ]);
        if (!lockedChar) throw new Rejection(404, 'Not found');
        if (!lockedOwner) throw new Rejection(404, 'Owner not found');
        if (lockedOwner.campaignId !== lockedChar.campaignId) {
          throw new Rejection(400, 'Owner and companion must be in the same campaign');
        }
        // Re-checked under the lock in case either sheet changed hands since the pre-check.
        if (lockedOwner.userId !== lockedChar.userId) throw new Rejection(400, SAME_PLAYER_ERROR);
        // One level only: the owner must not be a companion, the companion must own none.
        if (lockedOwner.ownerCharacterId) throw new Rejection(400, COMPANION_ERRORS.ownerIsCompanion);
        if (await tx.character.count({ where: { ownerCharacterId: characterId } })) {
          throw new Rejection(400, COMPANION_ERRORS.hasCompanions);
        }
        if (lockedChar.ownerCharacterId && lockedChar.ownerCharacterId !== ownerId) {
          throw new Rejection(409, 'Character is already a companion of another character; unlink it first');
        }
        return tx.character.update({ where: { id: characterId }, data: { ...data, ownerCharacterId: ownerId }, select: updateSelect });
      });
      return NextResponse.json(updated);
    } catch (e) {
      const r = rejected(e);
      if (r) return r;
      throw e;
    }
  }

  const updated = await prisma.character.update({
    where: { id: characterId },
    data,
    select: updateSelect,
  });
  return NextResponse.json(updated);
}
