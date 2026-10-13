export const dynamic = 'force-dynamic';
import { publish } from '@/lib/realtime';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireLootGM, invalidLoot } from '@/lib/loot-api';
import { lootId, lootListSchema, lootTableSchema, validCoinBudget } from '@/lib/loot-validation';
import { rollLoot, MAX_CP } from '@/lib/loot';

type Context = { params: Promise<{ id: string }> };
const input = z.object({ campaignId: lootId }).strict();
export async function POST(request: Request, context: Context) {
  const parsed = input.safeParse(await request.json().catch(() => null));
  const { id } = await context.params;
  if (!parsed.success || !lootId.safeParse(id).success) return invalidLoot();
  const { campaignId } = parsed.data;
  const denied = await requireLootGM(campaignId);
  if (denied) return denied;
  try {
    const result = await prisma.$transaction(async tx => {
      const creature = await tx.creature.findFirst({ where: { id, campaignId }, select: { lootTableId: true, lootList: true } });
      if (!creature) return null;
      const rawTable = creature.lootTableId ? await tx.lootTable.findFirst({ where: { id: creature.lootTableId, campaignId }, include: { entries: { orderBy: { sort: 'asc' } } } }) : null;
      if (creature.lootTableId && !rawTable) throw new Error('Loot table must belong to this campaign');
      const table = rawTable ? lootTableSchema.parse({ name: rawTable.name, rolls: rawTable.rolls, entries: rawTable.entries.map(({ kind, name, chance, quantity, valueGp, weight, notes }) => ({ kind, name, chance, quantity, valueGp, weight, notes })) }) : null;
      const list = lootListSchema.parse(creature.lootList);
      if (!validCoinBudget(table, list)) throw new Error('Possible coin reward exceeds copper limit');
      const rolled = rollLoot(table, list);
      // Conditional atomic increment protects against concurrent rolls overflowing Int.
      const updated = await tx.campaign.updateMany({ where: { id: campaignId, partyCp: { lte: MAX_CP - rolled.cp } }, data: { partyCp: { increment: rolled.cp } } });
      if (!updated.count) throw new Error('Party copper balance would exceed its limit');
      const items = [];
      for (const item of rolled.items) items.push(await tx.inventoryItem.create({ data: { ...item, campaignId, characterId: null } }));
      return { items, cp: rolled.cp };
    });
    if (result) publish(campaignId, 'battle');
    return result ? NextResponse.json(result) : NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (error) {
    if (error instanceof z.ZodError) return invalidLoot('Invalid stored loot; edit it before rolling');
    if (error instanceof Error && ['Loot table must belong to this campaign', 'Possible coin reward exceeds copper limit', 'Party copper balance would exceed its limit'].includes(error.message)) return invalidLoot(error.message);
    console.error('Could not roll loot', error);
    return NextResponse.json({ error: 'Could not roll loot' }, { status: 500 });
  }
}
