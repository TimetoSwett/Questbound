export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserRole } from '@/lib/campaign-helpers';
import { sanitizeSkills } from '@/lib/skills-validation';
import { equippedSchema } from '@/lib/equipment-validation';
import { ABILITIES, equipmentEffects, manualBonusAfterChange, type Equipped } from '@/lib/equipment';
import { libraryIdsIn, stripMissingLibraryIds } from '@/lib/library';
import { removeCharacterTokens } from '@/lib/battle-map';
import { sanitizeSpellsPsionics } from '@/lib/psionics';

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
  if (Object.prototype.hasOwnProperty.call(body, 'equipped') && Buffer.byteLength(JSON.stringify(body.equipped)) > 64 * 1024) {
    return NextResponse.json({ error: 'Equipped equipment exceeds the 64 KiB size limit' }, { status: 413 });
  }
  const { id } = body;
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
  if (body.campaignId !== undefined) {
    const targetId: string | null = body.campaignId ?? null;
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

  // Only sheet fields may be updated; ownership, identifiers, timestamps and
  // relation objects must never be taken from the request.
  const editableFields = [
    'name', 'portraitPath', 'portraitIsPublic',
    'race', 'alignment', 'deity', 'size', 'gender', 'age', 'height', 'weight', 'homeland',
    'xp', 'speed', 'classes', 'str', 'dex', 'con', 'int', 'wis', 'cha',
    'hpMax', 'hpCurrent', 'hpTemp', 'bab', 'sr',
    'baseFort', 'baseRef', 'baseWill', 'miscFort', 'miscRef', 'miscWill',
    'armorBonus', 'shieldBonus', 'naturalArmor', 'deflection', 'sizeMod',
    'miscAC', 'miscTouchAC', 'miscFlatAC', 'miscCMD', 'miscCMB', 'miscInit',
    'skills', 'equipment', 'equipped', 'feats', 'spells', 'notes', 'creatureId',
  ] as const satisfies readonly (keyof Prisma.CharacterUncheckedUpdateInput)[];
  const data: Record<string, unknown> = Object.fromEntries(
    editableFields.filter((field) => Object.prototype.hasOwnProperty.call(body, field)).map((field) => [field, body[field]]),
  );

  if (Object.prototype.hasOwnProperty.call(data, 'equipped')) {
    // Normalize the optional flags without making legacy saves fail validation.
    const rawEquipped = data.equipped;
    if (rawEquipped && typeof rawEquipped === 'object' && !Array.isArray(rawEquipped)) {
      const rawSheet = (rawEquipped as Record<string, unknown>).sheet;
      if (rawSheet && typeof rawSheet === 'object' && !Array.isArray(rawSheet)) {
        const options = rawSheet as Record<string, unknown>;
        if (typeof options.nonlethal === 'number' && !Number.isNaN(options.nonlethal)) {
          options.nonlethal = Math.max(0, Math.min(10000, Math.trunc(options.nonlethal)));
        } else {
          delete options.nonlethal;
        }
      }
      if (rawSheet && typeof rawSheet === 'object' && !Array.isArray(rawSheet) && Object.prototype.hasOwnProperty.call(rawSheet, 'noScore')) {
        const options = rawSheet as Record<string, unknown>;
        options.noScore = Array.isArray(options.noScore)
          ? [...new Set(options.noScore.filter((ability): ability is typeof ABILITIES[number] => ABILITIES.some(key => key === ability)))].slice(0, 6)
          : [];
      }
    }
    const result = equippedSchema.safeParse(data.equipped);
    if (!result.success) return NextResponse.json({ error: 'Invalid equipped equipment', details: result.error.flatten() }, { status: 400 });
    const equipped = result.data;
    const ids = [...new Set([equipped.armor, equipped.shield, ...(equipped.weapons ?? []), ...Object.values(equipped.slots ?? {})]
      .flatMap(item => item?.inventoryItemId ? [item.inventoryItemId] : []))];
    if (ids.length) {
      // Items moved to someone else (or out of the campaign) since the slot was
      // set just lose the link; the typed name and stats stay and the save goes through.
      const carried = character.campaignId
        ? new Set((await prisma.inventoryItem.findMany({
            where: { id: { in: ids }, campaignId: character.campaignId, characterId: id },
            select: { id: true },
          })).map(item => item.id))
        : new Set<string>();
      const unlink = <T extends { inventoryItemId?: string | null }>(item: T | null | undefined): T | null | undefined =>
        item?.inventoryItemId && !carried.has(item.inventoryItemId) ? { ...item, inventoryItemId: null } : item;
      equipped.armor = unlink(equipped.armor);
      equipped.shield = unlink(equipped.shield);
      if (equipped.weapons) equipped.weapons = equipped.weapons.map(w => unlink(w)!);
      if (equipped.slots) equipped.slots = Object.fromEntries(Object.entries(equipped.slots).map(([k, v]) => [k, unlink(v)])) as typeof equipped.slots;
    }
    data.equipped = equipped;
    // An explicitly changed manual bonus wins; otherwise unequipping resets the stale piece bonus.
    const previous = (character.equipped ?? null) as Equipped | null;
    const baseArmor = (typeof data.armorBonus === 'number' && data.armorBonus !== character.armorBonus) ? data.armorBonus : manualBonusAfterChange(previous, equipped, 'armor', character.armorBonus);
    const baseShield = (typeof data.shieldBonus === 'number' && data.shieldBonus !== character.shieldBonus) ? data.shieldBonus : manualBonusAfterChange(previous, equipped, 'shield', character.shieldBonus);
    const effects = equipmentEffects(equipped, baseArmor, baseShield);
    data.armorBonus = effects.armorBonus;
    data.shieldBonus = effects.shieldBonus;
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

  // Spell libraryEntryId must be a string id that exists; otherwise drop it (don't reject the save).
  // The sheet always keeps its own full copy of the spell details.
  // A JSON-string spells payload is parsed first so it can't bypass this check.
  if (typeof data.spells === 'string') {
    try { data.spells = JSON.parse(data.spells); } catch { /* unparseable: stored as before, no ids to honour */ }
  }
  // Psionics lives under spells.psionics; clamp/validate it (other spells keys pass through).
  data.spells = sanitizeSpellsPsionics(data.spells);
  if (data.spells !== undefined && data.spells !== null && typeof data.spells === 'object') {
    const known = (data.spells as { known?: unknown })?.known;
    if (Array.isArray(known)) {
      const ids = [...new Set(
        known.map((s: unknown) => (s as { libraryEntryId?: unknown })?.libraryEntryId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      )];
      const existing = ids.length
        ? new Set((await prisma.libraryEntry.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((e) => e.id))
        : new Set<string>();
      for (const s of known as Array<{ libraryEntryId?: unknown; clientId?: unknown }>) {
        if (s && typeof s === 'object' && 'clientId' in s) {
          if (typeof s.clientId !== 'string' || s.clientId.length < 1 || s.clientId.length > 100) {
            delete s.clientId;
          }
        }
        if (s && typeof s === 'object' && 'libraryEntryId' in s) {
          if (typeof s.libraryEntryId !== 'string' || !existing.has(s.libraryEntryId)) {
            delete s.libraryEntryId;
          }
        }
      }
    }
  }

  for (const field of ['feats', 'equipment', 'skills'] as const) {
    if (typeof data[field] === 'string') {
      try { data[field] = JSON.parse(data[field] as string); } catch { /* stored as text; no ids to check */ }
    }
  }
  if (Array.isArray(data.skills)) data.skills = sanitizeSkills(data.skills);
  const linked = [data.feats, data.equipment, data.equipped].filter((value) => value && typeof value === 'object');
  const linkedIds = libraryIdsIn(linked);
  if (linkedIds.length) {
    const existing = new Set((await prisma.libraryEntry.findMany({ where: { id: { in: linkedIds } }, select: { id: true } })).map((entry) => entry.id));
    for (const value of linked) stripMissingLibraryIds(value, existing);
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
