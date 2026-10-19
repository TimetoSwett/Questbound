// Loads per-player Bestiary unlocks (CreatureReveal) and presents creatures
// for one viewer. Every route that sends creature data to a player goes
// through presentCreaturesFor, so a player only ever gets their own unlocks.
import type { Creature } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { normalizeReveal, presentCreature, type PlayerReveal } from '@/lib/creatures';

type Presentable = Parameters<typeof presentCreature>[0];

/** userId's unlocks for the given creatures; creatures without a row are absent (nothing unlocked). */
export async function loadReveals(userId: string, creatureIds: string[]): Promise<Map<string, PlayerReveal>> {
  const ids = [...new Set(creatureIds)];
  if (ids.length === 0) return new Map();
  const rows = await prisma.creatureReveal.findMany({
    where: { userId, creatureId: { in: ids } },
    select: { creatureId: true, sections: true, full: true },
  });
  return new Map(rows.map((r) => [r.creatureId, normalizeReveal(r)]));
}

/**
 * Present creatures for the viewer `userId` with campaign role `role`, in
 * order. GM: everything. Player: their own unlocks; null entries are
 * creatures hidden from players.
 */
export async function presentCreaturesFor<C extends Presentable>(
  creatures: C[],
  role: string,
  userId: string,
): Promise<Array<Record<string, unknown> | null>> {
  const reveals = role === 'dm' ? new Map<string, PlayerReveal>() : await loadReveals(userId, creatures.map((c) => c.id));
  return Promise.all(creatures.map((c) => presentCreature(c, role, reveals.get(c.id) ?? null)));
}

export async function presentCreatureFor(creature: Creature & Presentable, role: string, userId: string) {
  return (await presentCreaturesFor([creature], role, userId))[0];
}
