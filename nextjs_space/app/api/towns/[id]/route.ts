export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserRole } from '@/lib/campaign-helpers';
import { TOWN_SECTIONS, parseTownInput, presentTown } from '@/lib/towns';
import { REVEAL_LEVELS } from '@/lib/creatures';
import { loadReveals } from '@/lib/creature-reveals';
import { presentCreature } from '@/lib/creatures';

async function getTown(id: string) {
  return prisma.town.findUnique({
    where: { id },
    include: {
      residents: { include: { creature: true }, orderBy: { id: 'asc' } },
      places: { include: { shopkeeper: true }, orderBy: { name: 'asc' } },
      wikiPage: { select: { id: true, title: true, visibility: true } },
      mapPin: { select: { id: true, label: true, visibility: true } },
    },
  });
}

// GET /api/towns/[id] — GM gets everything; players get the reveal card
// (hidden town = 404, like creatures). Resident NPCs and shopkeepers go
// through presentCreature with the viewer's own unlocks; only revealed places
// are shown.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const town = await getTown(id);
  if (!town) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const role = await getUserRole(session.user.id, town.campaignId);
  if (!role) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

  if (role === 'dm') return NextResponse.json(town);

  const card = presentTown({ ...town, wikiPage: town.wikiPage });
  if (!card) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const unlocked = card.unlockedSections as string[];
  const reveals = await loadReveals(session.user.id, [
    ...town.residents.map((r) => r.creatureId),
    ...town.places.flatMap((p) => (p.shopkeeper ? [p.shopkeeper.id] : [])),
  ]);

  const residents = unlocked.includes('residents')
    ? (
        await Promise.all(
          town.residents.map(async (r) => ({
            id: r.id,
            role: r.role,
            disposition: r.disposition,
            creature: await presentCreature({ ...r.creature, wikiPage: null }, 'player', reveals.get(r.creatureId) ?? null),
          })),
        )
      ).filter((r) => r.creature)
    : [];

  const places = unlocked.includes('places')
    ? (
        await Promise.all(
          town.places
            .filter((p) => p.revealLevel === 'revealed')
            .map(async (p) => ({
              id: p.id,
              name: p.name,
              type: p.type,
              description: p.description,
              shopkeeper: p.shopkeeper
                ? await presentCreature({ ...p.shopkeeper, wikiPage: null }, 'player', reveals.get(p.shopkeeper.id) ?? null)
                : null,
            })),
        )
      )
    : [];

  return NextResponse.json({
    ...card,
    residents,
    places,
    mapPin:
      town.mapPin && town.mapPin.visibility === 'shared'
        ? { id: town.mapPin.id, label: town.mapPin.label }
        : null,
  });
}

// PUT /api/towns/[id] {campaignId?, ...fields, revealLevel?, unlockedSections?} — GM only.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const town = await prisma.town.findUnique({ where: { id } });
  if (!town) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const role = await getUserRole(session.user.id, town.campaignId);
  if (role !== 'dm') return NextResponse.json({ error: 'Only the GM can edit towns' }, { status: 403 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  // Partial update: fields omitted from the body keep their current values
  // (otherwise e.g. a reveal toggle would silently unlink the wiki page / map pin).
  const { revealLevel: _rl, unlockedSections: _us, ...current } = town;
  const parsed = parseTownInput({ ...current, ...(body ?? {}) } as Record<string, unknown>, town.campaignId);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const revealLevel =
    typeof body?.revealLevel === 'string' && (REVEAL_LEVELS as readonly string[]).includes(body.revealLevel)
      ? body.revealLevel
      : undefined;
  let unlockedSections: string[] | undefined;
  if (body?.unlockedSections !== undefined) {
    if (
      !Array.isArray(body.unlockedSections) ||
      !(body.unlockedSections as unknown[]).every(
        (s) => typeof s === 'string' && (TOWN_SECTIONS as readonly string[]).includes(s),
      )
    ) {
      return NextResponse.json({ error: 'Invalid unlockedSections' }, { status: 400 });
    }
    unlockedSections = (body.unlockedSections as string[]).filter(
      (s, i, a) => a.indexOf(s) === i,
    );
  }

  const { wikiPageId, mapPinId } = parsed.data;
  if (wikiPageId && !(await prisma.wikiPage.findFirst({ where: { id: wikiPageId, campaignId: town.campaignId }, select: { id: true } }))) {
    return NextResponse.json({ error: 'Wiki page not found in this campaign' }, { status: 400 });
  }
  if (mapPinId && !(await prisma.worldMapPin.findFirst({ where: { id: mapPinId, campaignId: town.campaignId }, select: { id: true } }))) {
    return NextResponse.json({ error: 'Map pin not found in this campaign' }, { status: 400 });
  }

  const updated = await prisma.town.update({
    where: { id },
    data: {
      ...parsed.data,
      ...(revealLevel ? { revealLevel } : {}),
      ...(unlockedSections ? { unlockedSections } : {}),
    },
  });
  return NextResponse.json(updated);
}

// DELETE /api/towns/[id] — GM only.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const town = await prisma.town.findUnique({ where: { id }, select: { campaignId: true } });
  if (!town) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const role = await getUserRole(session.user.id, town.campaignId);
  if (role !== 'dm') return NextResponse.json({ error: 'Only the GM can delete towns' }, { status: 403 });
  await prisma.town.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
