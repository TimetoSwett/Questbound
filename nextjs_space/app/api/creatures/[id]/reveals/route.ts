export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserRole } from '@/lib/campaign-helpers';
import { publish } from '@/lib/realtime';
import { applyRevealUpdate, normalizeReveal, revealUpdateSchema } from '@/lib/creatures';

type Context = { params: Promise<{ id: string }> };

// Per-player Bestiary unlocks for one creature. GM only: players never see
// who else unlocked what; their own unlocks arrive inside /api/creatures.

async function gmCreature(request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const { id } = await context.params;
  const creature = await prisma.creature.findUnique({ where: { id }, select: { id: true, campaignId: true } });
  if (!creature) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  const role = await getUserRole(session.user.id, creature.campaignId);
  if (role !== 'dm') return { error: NextResponse.json({ error: 'Only the GM can manage unlocks' }, { status: 403 }) };
  return { creature };
}

/** Every current player of the campaign with their unlocks for this creature (none = nothing unlocked). */
async function playerUnlocks(creatureId: string, campaignId: string) {
  const [members, rows] = await Promise.all([
    prisma.campaignMembership.findMany({
      where: { campaignId, role: { not: 'dm' } },
      select: { userId: true, user: { select: { displayName: true } } },
      orderBy: { joinedAt: 'asc' },
    }),
    prisma.creatureReveal.findMany({ where: { creatureId }, select: { userId: true, sections: true, full: true } }),
  ]);
  const byUser = new Map(rows.map((r) => [r.userId, normalizeReveal(r)]));
  return members.map((m) => ({
    userId: m.userId,
    displayName: m.user.displayName,
    ...(byUser.get(m.userId) ?? normalizeReveal(null)),
  }));
}

// GET — { players: [{ userId, displayName, sections, full }] }
export async function GET(request: Request, context: Context) {
  const r = await gmCreature(request, context);
  if (r.error) return r.error;
  return NextResponse.json({ players: await playerUnlocks(r.creature.id, r.creature.campaignId) });
}

// PUT { userIds, sections?, grant?, revoke?, full? } — grant or revoke unlocks
// for these players (see revealUpdateSchema / applyRevealUpdate). Rows left
// with nothing unlocked are deleted. Only the affected players (and the GM)
// get a live refresh.
export async function PUT(request: Request, context: Context) {
  const r = await gmCreature(request, context);
  if (r.error) return r.error;
  const { creature } = r;
  const parsed = revealUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid unlocks', issues: parsed.error.issues }, { status: 400 });
  const userIds = [...new Set(parsed.data.userIds)];
  const { userIds: _u, ...update } = parsed.data;

  const players = await prisma.campaignMembership.count({
    where: { campaignId: creature.campaignId, role: { not: 'dm' }, userId: { in: userIds } },
  });
  if (players !== userIds.length) return NextResponse.json({ error: 'Every userId must be a player in this campaign' }, { status: 400 });

  await prisma.$transaction(async (tx) => {
    // Serialize concurrent GM updates for this creature (read-modify-write).
    await tx.$queryRaw`SELECT id FROM "Creature" WHERE id = ${creature.id} FOR UPDATE`;
    const rows = await tx.creatureReveal.findMany({
      where: { creatureId: creature.id, userId: { in: userIds } },
      select: { userId: true, sections: true, full: true },
    });
    const current = new Map(rows.map((row) => [row.userId, normalizeReveal(row)]));
    for (const userId of userIds) {
      const next = applyRevealUpdate(current.get(userId) ?? normalizeReveal(null), update);
      const key = { creatureId_userId: { creatureId: creature.id, userId } };
      if (!next.full && next.sections.length === 0) {
        await tx.creatureReveal.deleteMany({ where: { creatureId: creature.id, userId } });
      } else {
        await tx.creatureReveal.upsert({
          where: key,
          create: { creatureId: creature.id, userId, sections: next.sections, full: next.full },
          update: { sections: next.sections, full: next.full },
        });
      }
    }
  });

  // Bestiary cards and battle-map token labels/HP depend on these unlocks.
  publish(creature.campaignId, 'bestiary', { userIds });
  publish(creature.campaignId, 'battle', { userIds });
  return NextResponse.json({ players: await playerUnlocks(creature.id, creature.campaignId) });
}
