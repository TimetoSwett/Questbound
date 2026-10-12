export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserRole } from '@/lib/campaign-helpers';
import { removeCharacterTokens } from '@/lib/battle-map';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get('campaignId');

  // No campaignId -> character vault: all characters owned by the caller.
  if (!campaignId) {
    const characters = await prisma.character.findMany({
      where: {
        userId: session.user.id,
        ...(searchParams.get('unassigned') === '1' ? { campaignId: null } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
    const campaigns = await prisma.campaign.findMany({
      where: {
        id: { in: characters.flatMap((character) => character.campaignId ? [character.campaignId] : []) },
        memberships: { some: { userId: session.user.id } },
      },
      select: { id: true, name: true },
    });
    const campaignsById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
    return NextResponse.json(characters.map((character) => {
      const campaign = character.campaignId ? campaignsById.get(character.campaignId) ?? null : null;
      return {
        ...character,
        // Preserve assignment state without exposing a campaign the caller cannot access.
        isAssigned: character.campaignId !== null,
        campaignId: campaign?.id ?? null,
        campaign,
      };
    }));
  }

  const role = await getUserRole(session.user.id, campaignId);
  if (!role) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

  // DM sees all characters; player sees only their own
  const where = role === 'dm'
    ? { campaignId }
    : { campaignId, userId: session.user.id };

  const characters = await prisma.character.findMany({
    where,
    include: { user: { select: { displayName: true } } },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json(characters);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { campaignId, name } = await request.json();

  // campaignId is optional now: omitted -> vault character owned by the caller
  if (campaignId) {
    const role = await getUserRole(session.user.id, campaignId);
    if (!role) return NextResponse.json({ error: 'Not a member' }, { status: 403 });
  }

  const character = await prisma.character.create({
    data: {
      userId: session.user.id,
      campaignId: campaignId ?? null,
      name: name || 'New Character',
      skills: JSON.stringify([]),
      equipment: JSON.stringify([]),
      feats: JSON.stringify([]),
      spells: JSON.stringify({ slots: {}, known: [] }),
    },
  });

  return NextResponse.json(character);
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { id, ...data } = body;
  if (!id) return NextResponse.json({ error: 'Character id required' }, { status: 400 });

  const character = await prisma.character.findUnique({ where: { id } });
  if (!character) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Only owner can edit (or DM for campaign characters)
  const isOwner = character.userId === session.user.id;
  const role = character.campaignId ? await getUserRole(session.user.id, character.campaignId) : null;
  if (!isOwner && role !== 'dm') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  // Attach a vault character to a campaign
  if (data.campaignId !== undefined) {
    const targetId: string | null = data.campaignId ?? null;
    if (!targetId) return NextResponse.json({ error: 'campaignId required' }, { status: 400 });
    if (character.campaignId) {
      return NextResponse.json({ error: 'Character already assigned to a campaign' }, { status: 400 });
    }
    const targetRole = await getUserRole(session.user.id, targetId);
    if (!targetRole) return NextResponse.json({ error: 'Not a member of target campaign' }, { status: 403 });
    if (!isOwner && targetRole !== 'dm') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }
    const updated = await prisma.character.update({ where: { id }, data: { campaignId: targetId } });
    return NextResponse.json(updated);
  }

  // creatureId links a sheet to an NPC; only allow NPCs from this character's campaign.
  // Linking/unlinking is a GM action (the link is set by Upgrade to Adventurer).
  if (data.creatureId !== undefined && role !== 'dm') {
    return NextResponse.json({ error: 'Only DM can link NPCs' }, { status: 403 });
  }
  if (data.creatureId !== undefined && data.creatureId !== null) {
    if (typeof data.creatureId !== 'string' || !character.campaignId) {
      return NextResponse.json({ error: 'Invalid creatureId' }, { status: 400 });
    }
    const creature = await prisma.creature.findFirst({
      where: { id: data.creatureId, campaignId: character.campaignId, isNpc: true },
      select: { id: true },
    });
    if (!creature) return NextResponse.json({ error: 'Invalid creatureId' }, { status: 400 });
  }

  // Stringify JSON fields if they are objects
  const jsonFields = ['skills', 'equipment', 'feats', 'spells', 'classes'];
  for (const f of jsonFields) {
    if (data[f] !== undefined && typeof data[f] !== 'string') {
      data[f] = JSON.stringify(data[f]);
    }
  }

  try {
    const updated = await prisma.character.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (err) {
    // Character.creatureId is unique: an NPC can be linked to only one sheet.
    if ((err as { code?: string })?.code === 'P2002') {
      return NextResponse.json(
        { error: 'That NPC is already linked to another character sheet' },
        { status: 409 },
      );
    }
    throw err;
  }
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const character = await prisma.character.findUnique({ where: { id } });
  if (!character) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (character.userId !== session.user.id) {
    const role = character.campaignId ? await getUserRole(session.user.id, character.campaignId) : null;
    if (role !== 'dm') return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  await prisma.$transaction(async (tx) => {
    if (character.campaignId) {
      // Serialize with token moves and invalidate stale full-map saves.
      await tx.$queryRaw`SELECT id FROM "Campaign" WHERE id = ${character.campaignId} FOR UPDATE`;
      const campaign = await tx.campaign.findUnique({
        where: { id: character.campaignId },
        select: { battleMapState: true },
      });
      if (campaign?.battleMapState) {
        const state = campaign.battleMapState as Record<string, any>;
        await tx.campaign.update({
          where: { id: character.campaignId },
          data: {
            battleMapState: removeCharacterTokens(state, id),
            battleMapVersion: { increment: 1 },
          },
        });
      }
    }
    await tx.character.delete({ where: { id } });
  });
  return NextResponse.json({ ok: true });
}
