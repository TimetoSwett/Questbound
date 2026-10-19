import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { removeCharacterTokens } from '@/lib/battle-map';

export function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function getUserRole(userId: string, campaignId: string): Promise<string | null> {
  const membership = await prisma.campaignMembership.findUnique({
    where: { userId_campaignId: { userId, campaignId } },
  });
  return membership?.role ?? null;
}

/**
 * Send a campaign's characters back to their owners' vaults instead of deleting
 * them. With userId, only that user's characters move (kick/leave); without it,
 * every character in the campaign does (campaign deletion). Strips their
 * battle-map tokens, returns their carried loot to the party pool and breaks
 * companion links that would otherwise cross the campaign boundary.
 * Must run inside a transaction. Returns the detached character ids.
 */
export async function detachCampaignCharacters(
  tx: Prisma.TransactionClient,
  campaignId: string,
  userId?: string
): Promise<string[]> {
  // Serialize with token moves and invalidate stale full-map saves.
  await tx.$queryRaw`SELECT id FROM "Campaign" WHERE id = ${campaignId} FOR UPDATE`;
  const ids = (await tx.character.findMany({
    where: { campaignId, ...(userId ? { userId } : {}) },
    select: { id: true },
  })).map((c) => c.id);
  if (ids.length === 0) return ids;

  await tx.inventoryItem.updateMany({ where: { campaignId, characterId: { in: ids } }, data: { characterId: null } });
  await tx.character.updateMany({
    where: { id: { in: ids }, ownerCharacterId: { not: null, notIn: ids } },
    data: { ownerCharacterId: null },
  });
  await tx.character.updateMany({
    where: { campaignId, id: { notIn: ids }, ownerCharacterId: { in: ids } },
    data: { ownerCharacterId: null },
  });
  // creatureId links an upgraded sheet to this campaign's Bestiary; it can't follow the sheet out.
  await tx.character.updateMany({ where: { id: { in: ids } }, data: { campaignId: null, creatureId: null } });

  const campaign = await tx.campaign.findUnique({ where: { id: campaignId }, select: { battleMapState: true } });
  if (campaign?.battleMapState) {
    const state = ids.reduce(
      (s, id) => removeCharacterTokens(s, id),
      campaign.battleMapState as Record<string, any>
    );
    await tx.campaign.update({
      where: { id: campaignId },
      data: { battleMapState: state, battleMapVersion: { increment: 1 } },
    });
  }
  return ids;
}
