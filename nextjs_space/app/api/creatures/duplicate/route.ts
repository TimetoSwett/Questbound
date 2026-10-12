export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserRole } from '@/lib/campaign-helpers';
import { presentCreature } from '@/lib/creatures';

// POST {id, name?} — DM only. Copies a creature within its campaign. The copy
// starts unrevealed so duplicating never exposes anything to players.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, name } = (await request.json().catch(() => ({}))) as { id?: unknown; name?: unknown };
  if (typeof id !== 'string' || !id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const src = await prisma.creature.findUnique({ where: { id } });
  if (!src) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const role = await getUserRole(session.user.id, src.campaignId);
  if (role !== 'dm') return NextResponse.json({ error: 'Only DM' }, { status: 403 });
  const { id: _id, createdAt: _c, updatedAt: _u, attacks, skills, feats, specialAbilities, spells, gear, lootList, unlockedSections: _us, revealLevel: _rl, ...rest } = src;
  const json = (v: Prisma.JsonValue) => (v ?? Prisma.JsonNull) as Prisma.InputJsonValue;
  const copy = await prisma.creature.create({
    data: {
      ...rest,
      name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 200) : `${src.name} (copy)`,
      revealLevel: 'hidden',
      unlockedSections: [],
      attacks: json(attacks), skills: json(skills), feats: json(feats),
      specialAbilities: json(specialAbilities), spells: json(spells), gear: json(gear), lootList: json(lootList),
    },
    include: { wikiPage: { select: { id: true, title: true, visibility: true } } },
  });
  return NextResponse.json(await presentCreature(copy, role));
}
