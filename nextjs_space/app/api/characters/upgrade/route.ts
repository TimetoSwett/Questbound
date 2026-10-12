export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserRole } from '@/lib/campaign-helpers';

// PF1e size modifiers to AC (used to back out a natural-armor estimate).
const SIZE_AC_MOD: Record<string, number> = {
  fine: 8, diminutive: 4, tiny: 2, small: 1, medium: 0,
  large: -1, huge: -2, gargantuan: -4, colossal: -8,
};

// POST {creatureId} — DM only. Creates a character sheet prefilled from the
// NPC's stats and links it back via Character.creatureId. The NPC is kept.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const creatureId = body?.creatureId;
  if (typeof creatureId !== 'string' || !creatureId) {
    return NextResponse.json({ error: 'creatureId required' }, { status: 400 });
  }

  const creature = await prisma.creature.findUnique({ where: { id: creatureId } });
  if (!creature || !creature.campaignId) {
    return NextResponse.json({ error: 'NPC not found' }, { status: 404 });
  }
  const role = await getUserRole(session.user.id, creature.campaignId);
  if (role !== 'dm') return NextResponse.json({ error: 'Only DM can upgrade NPCs' }, { status: 403 });

  const dex = creature.dex ?? 10;
  const dexMod = Math.floor((dex - 10) / 2);
  const sizeMod = SIZE_AC_MOD[(creature.size ?? 'medium').toLowerCase()] ?? 0;
  // Back out the NPC's natural armor from its total AC so the sheet's AC math
  // starts from the same place.
  const naturalArmor = Math.max(0, (creature.acTotal ?? 10) - 10 - dexMod - sizeMod);

  const character = await prisma.character.create({
    data: {
      userId: session.user.id,
      campaignId: creature.campaignId,
      name: creature.name,
      creatureId: creature.id,
      portraitPath: creature.portraitPath,
      race: '',
      alignment: creature.alignment ?? '',
      size: creature.size ?? 'Medium',
      speed: creature.speed ?? 30,
      str: creature.str ?? 10,
      dex,
      con: creature.con ?? 10,
      int: creature.int ?? 10,
      wis: creature.wis ?? 10,
      cha: creature.cha ?? 10,
      hpMax: creature.hpMax ?? 0,
      hpCurrent: creature.hpCurrent ?? 0,
      baseFort: creature.fort ?? 0,
      baseRef: creature.ref ?? 0,
      baseWill: creature.will ?? 0,
      naturalArmor,
      skills: (creature.skills as object) ?? [],
      feats: (creature.feats as object) ?? [],
      equipment: (creature.gear as object) ?? [],
      spells: (creature.spells as object) ?? { slots: {}, known: [] },
      notes: `Upgraded from NPC "${creature.name}".`,
    },
  });

  return NextResponse.json(character);
}
