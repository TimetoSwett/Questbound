export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserRole } from '@/lib/campaign-helpers';
import { creatureInputSchema, creatureWhereFor, presentCreature, type CreatureInput } from '@/lib/creatures';

const wikiSelect = { wikiPage: { select: { id: true, title: true, visibility: true } } } as const;

async function validWikiPage(input: CreatureInput, campaignId: string): Promise<boolean> {
  if (!input.wikiPageId) return true;
  const pg = await prisma.wikiPage.findFirst({ where: { id: input.wikiPageId, campaignId }, select: { id: true } });
  return !!pg;
}

// GET ?campaignId=... lists a campaign's creatures; GET ?id=... returns one.
// Non-DMs only see revealed creatures, as a basic card (see lib/creatures.ts).
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const campaignId = searchParams.get('campaignId');

  if (id) {
    const creature = await prisma.creature.findUnique({ where: { id }, include: wikiSelect });
    if (!creature) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const role = await getUserRole(session.user.id, creature.campaignId);
    if (!role) return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    const out = await presentCreature(creature, role);
    // Unrevealed creatures look identical to missing ones for players.
    if (!out) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(out);
  }

  if (!campaignId) return NextResponse.json({ error: 'campaignId or id required' }, { status: 400 });
  const role = await getUserRole(session.user.id, campaignId);
  if (!role) return NextResponse.json({ error: 'Not a member' }, { status: 403 });
  const creatures = await prisma.creature.findMany({
    where: creatureWhereFor(role, campaignId),
    include: wikiSelect,
    orderBy: { name: 'asc' },
  });
  const out = (await Promise.all(creatures.map((c) => presentCreature(c, role)))).filter(Boolean);
  return NextResponse.json(out);
}

// POST {campaignId, ...fields} — DM only.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const { campaignId, ...rest } = (body ?? {}) as Record<string, unknown>;
  if (typeof campaignId !== 'string' || !campaignId) return NextResponse.json({ error: 'campaignId required' }, { status: 400 });
  const role = await getUserRole(session.user.id, campaignId);
  if (role !== 'dm') return NextResponse.json({ error: 'Only DM can create creatures' }, { status: 403 });
  const parsed = creatureInputSchema.safeParse(rest);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid creature', issues: parsed.error.issues }, { status: 400 });
  if (!(await validWikiPage(parsed.data, campaignId))) return NextResponse.json({ error: 'Wiki page not in campaign' }, { status: 400 });
  const creature = await prisma.creature.create({ data: { ...parsed.data, campaignId } as Prisma.CreatureUncheckedCreateInput, include: wikiSelect });
  return NextResponse.json(await presentCreature(creature, role));
}

// PUT {id, ...fields} — DM only, partial update.
export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const { id, ...rest } = (body ?? {}) as Record<string, unknown>;
  if (typeof id !== 'string' || !id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const existing = await prisma.creature.findUnique({ where: { id }, select: { campaignId: true } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const role = await getUserRole(session.user.id, existing.campaignId);
  if (role !== 'dm') return NextResponse.json({ error: 'Only DM can edit' }, { status: 403 });
  const parsed = creatureInputSchema.safeParse(rest);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid creature', issues: parsed.error.issues }, { status: 400 });
  if (!(await validWikiPage(parsed.data, existing.campaignId))) return NextResponse.json({ error: 'Wiki page not in campaign' }, { status: 400 });
  const updated = await prisma.creature.update({ where: { id }, data: parsed.data as Prisma.CreatureUncheckedUpdateInput, include: wikiSelect });
  return NextResponse.json(await presentCreature(updated, role));
}

// DELETE ?id=... — DM only.
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const existing = await prisma.creature.findUnique({ where: { id }, select: { campaignId: true } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const role = await getUserRole(session.user.id, existing.campaignId);
  if (role !== 'dm') return NextResponse.json({ error: 'Only DM' }, { status: 403 });
  await prisma.creature.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
