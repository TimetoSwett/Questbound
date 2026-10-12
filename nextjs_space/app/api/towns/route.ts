export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserRole } from '@/lib/campaign-helpers';
import { parseTownInput, presentTown } from '@/lib/towns';

async function validLink(id: string | null, campaignId: string, model: 'wikiPage' | 'mapPin'): Promise<boolean> {
  if (!id) return true;
  const found = model === 'wikiPage'
    ? await prisma.wikiPage.findFirst({ where: { id, campaignId }, select: { id: true } })
    : await prisma.worldMapPin.findFirst({ where: { id, campaignId }, select: { id: true } });
  return !!found;
}

// GET ?campaignId= — GM sees all towns; players only see non-hidden ones
// (same reveal cards as the detail view, minus residents/places).
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get('campaignId');
  if (!campaignId) return NextResponse.json({ error: 'campaignId required' }, { status: 400 });
  const role = await getUserRole(session.user.id, campaignId);
  if (!role) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

  // Players' counts only include residents/places they could actually see,
  // so hidden NPCs and places don't leak through the numbers.
  const towns = await prisma.town.findMany({
    where: role === 'dm' ? { campaignId } : { campaignId, revealLevel: { not: 'hidden' } },
    include: {
      _count: {
        select:
          role === 'dm'
            ? { residents: true, places: true }
            : {
                residents: { where: { creature: { revealLevel: { not: 'hidden' } } } },
                places: { where: { revealLevel: 'revealed' } },
              },
      },
    },
    orderBy: { name: 'asc' },
  });

  if (role === 'dm') {
    return NextResponse.json(
      towns.map((t) => ({ ...t, residentCount: t._count.residents, placeCount: t._count.places })),
    );
  }
  const out = [];
  for (const t of towns) {
    const card = presentTown(t);
    if (!card) continue; // hidden towns are invisible, like hidden creatures
    const unlocked = card.unlockedSections as string[];
    out.push({
      ...card,
      residentCount: unlocked.includes('residents') ? t._count.residents : 0,
      placeCount: unlocked.includes('places') ? t._count.places : 0,
    });
  }
  return NextResponse.json(out);
}

// POST {campaignId, ...fields} — GM only.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const campaignId = body?.campaignId;
  if (typeof campaignId !== 'string' || !campaignId) {
    return NextResponse.json({ error: 'campaignId required' }, { status: 400 });
  }
  const role = await getUserRole(session.user.id, campaignId);
  if (role !== 'dm') return NextResponse.json({ error: 'Only the GM can create towns' }, { status: 403 });

  const parsed = parseTownInput(body ?? {}, campaignId);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { wikiPageId, mapPinId } = parsed.data;
  if (!(await validLink(wikiPageId, campaignId, 'wikiPage'))) {
    return NextResponse.json({ error: 'Wiki page not found in this campaign' }, { status: 400 });
  }
  if (!(await validLink(mapPinId, campaignId, 'mapPin'))) {
    return NextResponse.json({ error: 'Map pin not found in this campaign' }, { status: 400 });
  }
  const town = await prisma.town.create({ data: parsed.data });
  return NextResponse.json(town, { status: 201 });
}
