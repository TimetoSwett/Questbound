export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserRole } from '@/lib/campaign-helpers';
import {
  accessibleCharacters, canAccessCharacterById, companionQuerySchema, companionSelect, createCompanionSchema,
  linkCompanionSchema, linkCreatesCycle, toCompanionSummary,
} from '@/lib/companions';

const accessFields = { id: true, userId: true, campaignId: true, ownerCharacterId: true } as const;

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
  return NextResponse.json({ owner, companions, siblings });
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

  const companion = await prisma.character.create({
    data: {
      userId: owner.userId,
      campaignId: owner.campaignId,
      ownerCharacterId: owner.id,
      companionType: parsed.data.companionType,
      name: parsed.data.name,
      skills: JSON.stringify([]),
      equipment: JSON.stringify([]),
      feats: JSON.stringify([]),
      spells: JSON.stringify({ slots: {}, known: [] }),
    },
  });
  return NextResponse.json(companion);
}

// PUT {characterId, ownerId?, companionType?}
//   ownerId = string -> link characterId as a companion of ownerId (caller must edit both;
//                       same campaign; no self-link or cycle; not already owned by someone else)
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
    if (owner.campaignId !== character.campaignId) {
      return NextResponse.json({ error: 'Owner and companion must be in the same campaign' }, { status: 400 });
    }
    if (character.ownerCharacterId && character.ownerCharacterId !== ownerId) {
      return NextResponse.json({ error: 'Character is already a companion of another character; unlink it first' }, { status: 409 });
    }
    if (await linkCreatesCycle(prisma, characterId, ownerId)) {
      return NextResponse.json({ error: 'That link would create a cycle' }, { status: 400 });
    }
    data.ownerCharacterId = ownerId;
  }

  const updated = await prisma.character.update({
    where: { id: characterId },
    data,
    select: { id: true, name: true, companionType: true, ownerCharacterId: true, campaignId: true },
  });
  return NextResponse.json(updated);
}
