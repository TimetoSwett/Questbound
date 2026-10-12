export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserRole } from '@/lib/campaign-helpers';
import { PF1E_SKILLS, abilityMod } from '@/lib/pf1e-skills';

// PF1e size modifiers to AC (used to back out a natural-armor estimate).
const SIZE_AC_MOD: Record<string, number> = {
  fine: 8, diminutive: 4, tiny: 2, small: 1, medium: 0,
  large: -1, huge: -2, gargantuan: -4, colossal: -8,
};

const escapeHtml = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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

  const scores = {
    str: creature.str ?? 10, dex: creature.dex ?? 10, con: creature.con ?? 10,
    int: creature.int ?? 10, wis: creature.wis ?? 10, cha: creature.cha ?? 10,
  };
  const mods: Record<string, number> = {
    STR: abilityMod(scores.str), DEX: abilityMod(scores.dex), CON: abilityMod(scores.con),
    INT: abilityMod(scores.int), WIS: abilityMod(scores.wis), CHA: abilityMod(scores.cha),
  };
  const dexMod = mods.DEX;
  const sizeMod = SIZE_AC_MOD[(creature.size ?? 'medium').toLowerCase()] ?? 0;
  // Back out the NPC's natural armor from its total AC so the sheet's AC math
  // (10 + dex + size + natural + ...) lands on the same total.
  const naturalArmor = Math.max(0, (creature.acTotal ?? 10) - 10 - dexMod - sizeMod);

  // NPC saves and skill bonuses are totals; the sheet adds ability mods on top,
  // so store base save = total - mod and skill misc = total - mod.
  const npcSkills = Array.isArray(creature.skills) ? (creature.skills as Record<string, unknown>[]) : [];
  const seen = new Set<string>();
  const skills = npcSkills.flatMap((sk) => {
    const name = String(sk?.name ?? '').trim().toLowerCase();
    // "Craft (alchemy)" -> "Craft" when there's no exact match.
    const base = name.replace(/\s*\(.*\)\s*$/, '');
    const def = PF1E_SKILLS.find((d) => d.name.toLowerCase() === name)
      ?? PF1E_SKILLS.find((d) => d.name.toLowerCase() === base);
    const bonus = parseInt(String(sk?.bonus ?? ''), 10);
    // Skip unmapped skills and duplicates (e.g. a second Craft); the full NPC
    // skill line is kept in notes below.
    if (!def || Number.isNaN(bonus) || seen.has(def.name)) return [];
    seen.add(def.name);
    return [{ name: def.name, ranks: 0, classSkill: false, misc: bonus - (mods[def.ability] ?? 0) }];
  });

  const skillLine = npcSkills
    .map((sk) => `${String(sk?.name ?? '').trim()} ${String(sk?.bonus ?? '').trim()}`.trim())
    .filter(Boolean)
    .join(', ');

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
      ...scores,
      hpMax: creature.hpMax ?? 0,
      hpCurrent: creature.hpCurrent ?? 0,
      baseFort: (creature.fort ?? 0) - mods.CON,
      baseRef: (creature.ref ?? 0) - mods.DEX,
      baseWill: (creature.will ?? 0) - mods.WIS,
      naturalArmor,
      sizeMod,
      skills,
      feats: (creature.feats as object) ?? [],
      equipment: (creature.gear as object) ?? [],
      spells: (creature.spells as object) ?? { slots: {}, known: [] },
      // notes is TipTap HTML, so escape the NPC-provided text.
      notes: `<p>Upgraded from NPC "${escapeHtml(creature.name)}".</p>`
        + (skillLine ? `<p>NPC skills: ${escapeHtml(skillLine)}</p>` : ''),
    },
  });

  return NextResponse.json(character);
}
