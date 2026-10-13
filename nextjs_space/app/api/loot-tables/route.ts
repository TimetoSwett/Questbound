export const dynamic = 'force-dynamic';
import { publish } from '@/lib/realtime';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireLootGM, invalidLoot } from '@/lib/loot-api';
import { lootId, lootTableSchema, validCoinBudget } from '@/lib/loot-validation';

const include = { entries: { orderBy: { sort: 'asc' as const } } };
const scope = z.object({ campaignId: lootId, id: lootId.optional() }).strict();
const write = z.object({ campaignId: lootId, id: lootId.optional(), table: lootTableSchema }).strict();

export async function GET(request: Request) {
  const parsed = scope.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return invalidLoot();
  const { campaignId, id } = parsed.data;
  const denied = await requireLootGM(campaignId);
  if (denied) return denied;
  return NextResponse.json(await prisma.lootTable.findMany({ where: { campaignId, ...(id ? { id } : {}) }, include, orderBy: { name: 'asc' } }));
}

async function save(request: Request, update: boolean) {
  const parsed = write.safeParse(await request.json().catch(() => null));
  if (!parsed.success || (update ? !parsed.data.id : !!parsed.data.id)) return invalidLoot();
  const { campaignId, id, table } = parsed.data;
  const denied = await requireLootGM(campaignId);
  if (denied) return denied;
  if (!validCoinBudget(table, [])) return invalidLoot('Possible coin reward exceeds copper limit');
  const entries = table.entries.map((entry, sort) => ({ ...entry, sort }));
  if (!update) {
    const created = await prisma.lootTable.create({ data: { campaignId, name: table.name, rolls: table.rolls, entries: { create: entries } }, include });
    publish(campaignId, 'battle');
    return NextResponse.json(created, { status: 201 });
  }
  const result = await prisma.$transaction(async tx => {
    const existing = await tx.lootTable.findFirst({ where: { id, campaignId } });
    if (!existing) return null;
    return tx.lootTable.update({ where: { id, campaignId }, data: { name: table.name, rolls: table.rolls, entries: { deleteMany: {}, create: entries } }, include });
  });
  if (result) publish(campaignId, 'battle');
  return result ? NextResponse.json(result) : NextResponse.json({ error: 'Not found' }, { status: 404 });
}
export async function POST(request: Request) { return save(request, false); }
export async function PUT(request: Request) { return save(request, true); }
export async function DELETE(request: Request) {
  const parsed = scope.required().safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return invalidLoot();
  const denied = await requireLootGM(parsed.data.campaignId);
  if (denied) return denied;
  const result = await prisma.lootTable.deleteMany({ where: parsed.data });
  if (result.count) publish(parsed.data.campaignId, 'battle');
  return result.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Not found' }, { status: 404 });
}
