export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireLootGM, invalidLoot } from '@/lib/loot-api';
import { lootId, lootListSchema, lootTableSchema, validCoinBudget } from '@/lib/loot-validation';

const input = z.object({ campaignId: lootId, lootTableId: lootId.nullable(), lootList: lootListSchema }).strict();
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  const parsed = z.object({ campaignId: lootId }).strict().safeParse(Object.fromEntries(new URL(request.url).searchParams));
  const { id } = await context.params;
  if (!parsed.success || !lootId.safeParse(id).success) return invalidLoot();
  const { campaignId } = parsed.data;
  const denied = await requireLootGM(campaignId);
  if (denied) return denied;
  const creature = await prisma.creature.findFirst({ where: { id, campaignId }, select: { lootTableId: true, lootList: true } });
  return creature ? NextResponse.json(creature) : NextResponse.json({ error: 'Not found' }, { status: 404 });
}
export async function PUT(request: Request, context: Context) {
  const parsed = input.safeParse(await request.json().catch(() => null));
  const { id } = await context.params;
  if (!parsed.success || !lootId.safeParse(id).success) return invalidLoot();
  const { campaignId, lootTableId, lootList } = parsed.data;
  const denied = await requireLootGM(campaignId);
  if (denied) return denied;
  const result = await prisma.$transaction(async tx => {
    if (!await tx.creature.findFirst({ where: { id, campaignId }, select: { id: true } })) return 'missing';
    const table = lootTableId ? await tx.lootTable.findFirst({ where: { id: lootTableId, campaignId }, include: { entries: true } }) : null;
    if (lootTableId && !table) return 'table';
    const normalized = table ? lootTableSchema.safeParse({ name: table.name, rolls: table.rolls, entries: table.entries.map(({ kind, name, chance, quantity, valueGp, weight, notes }) => ({ kind, name, chance, quantity, valueGp, weight, notes })) }) : null;
    if (normalized && !normalized.success) return 'invalid';
    if (!validCoinBudget(normalized?.success ? normalized.data : null, lootList)) return 'invalid';
    return tx.creature.update({ where: { id, campaignId }, data: { lootTableId, lootList }, select: { lootTableId: true, lootList: true } });
  });
  if (result === 'missing') return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (result === 'table') return invalidLoot('Loot table must belong to this campaign');
  if (result === 'invalid') return invalidLoot('Invalid loot or possible coin reward exceeds copper limit');
  return NextResponse.json(result);
}
