export const dynamic = 'force-dynamic';
import { publish } from '@/lib/realtime';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserRole } from '@/lib/campaign-helpers';
import { BATTLE_DEFAULTS, filterLinkedTokensForPlayer, sanitizeForPlayer } from '@/lib/battle-map';
import { loadBattleState, saveBattleState } from '@/lib/battle-map-store';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get('campaignId');
  if (!campaignId) return NextResponse.json({ error: 'campaignId required' }, { status: 400 });
  const role = await getUserRole(session.user.id, campaignId);
  if (!role) return NextResponse.json({ error: 'Not a member' }, { status: 403 });
  const loaded = await loadBattleState(prisma, campaignId);
  const raw = (loaded?.state ?? {}) as Record<string, any>;
  let state: Record<string, any> = { ...BATTLE_DEFAULTS, ...raw };

  // Players never receive GM-only data (encounters, snapshots, hidden or
  // fogged tokens/pins/texts). Sanitized server-side, not just in the UI.
  if (role !== 'dm') {
    const mine = await prisma.character.findMany({ where: { campaignId, userId: session.user.id }, select: { id: true } });
    state = sanitizeForPlayer(state, mine.map((c) => c.id));

    // Tokens linked to bestiary creatures go through the Bestiary reveal rules
    // (presentCreature); see filterLinkedTokensForPlayer.
    state = await filterLinkedTokensForPlayer(state, campaignId, session.user.id, Array.isArray(raw.tokens) ? raw.tokens : []);
  }

  // Attach linked wiki article titles to battle pins, mirroring the world-pins
  // API: dm_only article titles are never leaked to players.
  const pins = Array.isArray(state.pins) ? state.pins : [];
  const articleIds = [...new Set(pins.map((p: any) => p?.wikiArticleId).filter((id: any) => typeof id === 'string' && id))];
  let pages: Array<{ id: string; title: string; visibility: string }> = [];
  if (articleIds.length > 0) {
    pages = await prisma.wikiPage.findMany({
      where: { id: { in: articleIds }, campaignId },
      select: { id: true, title: true, visibility: true },
    });
  }
  const byId = new Map(pages.map((p) => [p.id, p]));
  const safePins = pins.map((p: any) => {
    const pg = p.wikiArticleId ? byId.get(p.wikiArticleId) : undefined;
    const wikiArticle = pg && (role === 'dm' || pg.visibility === 'shared') ? { id: pg.id, title: pg.title } : null;
    return { ...p, wikiArticle };
  });
  return NextResponse.json({ ...state, pins: safePins, version: loaded?.version ?? 0 });
}

// Full-state write, DM only. Uses optimistic concurrency: the client sends the
// `version` it last loaded; if anyone (e.g. a player moving a token) wrote in
// between, the update matches no row and we return 409 so the client can
// refetch, merge and retry instead of silently overwriting their change.
export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { campaignId, state, version } = await request.json();
  if (!campaignId) return NextResponse.json({ error: 'campaignId required' }, { status: 400 });
  if (!state || typeof state !== 'object' || Array.isArray(state)) return NextResponse.json({ error: 'state required' }, { status: 400 });
  if (!Number.isInteger(version)) return NextResponse.json({ error: 'version required' }, { status: 400 });
  const role = await getUserRole(session.user.id, campaignId);
  if (role !== 'dm') return NextResponse.json({ error: 'Only DM' }, { status: 403 });
  const saved = await saveBattleState(prisma, campaignId, state, { expectedVersion: version });
  if (!saved.ok) {
    if (saved.status === 404) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (saved.status === 409) {
      return NextResponse.json({ error: 'Battle map changed since it was loaded', version: saved.version }, { status: 409 });
    }
    return NextResponse.json({ error: saved.error }, { status: 400 });
  }
  publish(campaignId, 'battle', { version: saved.version });
  return NextResponse.json({ ok: true, version: saved.version });
}
