export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readUpload, isValidKey } from "@/lib/s3";
import { getUserRole } from "@/lib/campaign-helpers";
import { BATTLE_DEFAULTS, collectFileKeys, filterLinkedTokensForPlayer, sanitizeForPlayer } from "@/lib/battle-map";

// Serves files previously uploaded via POST /api/upload.
// Upload keys are bare UUIDs with no campaign prefix, so access is decided by
// looking up where the key is referenced:
//   - a character portrait: its owner, the campaign DM, and (if the portrait
//     is public) other campaign members;
//   - a campaign world map: campaign members (DM only if marked private);
//   - a battle map image (background, handout, token portrait): campaign
//     members, but players only if the key appears in their sanitized view
//     (so images used only in saved encounters/snapshots stay DM-only).
// Keys not referenced anywhere (orphaned/legacy uploads) are not served.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { key: segments } = await params;
  const key = (segments ?? []).join("/");
  const notFound = NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!isValidKey(key)) return notFound;
  if (!(await canAccess(userId, key))) return notFound;

  const file = await readUpload(key);
  if (!file) return notFound;

  return new NextResponse(file.bytes, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=3600",
    },
  });
}

async function canAccess(userId: string, key: string): Promise<boolean> {
  // Stored paths may be the bare key or end in "/<key>" (getFileUrl strips
  // any prefix), so match both.
  const portraits = await prisma.character.findMany({
    where: { OR: [{ portraitPath: key }, { portraitPath: { endsWith: `/${key}` } }] },
    select: { userId: true, campaignId: true, portraitIsPublic: true },
  });
  for (const c of portraits) {
    if (c.userId === userId) return true;
    if (!c.campaignId) continue;
    const role = await getUserRole(userId, c.campaignId);
    if (role === "dm" || (role && c.portraitIsPublic)) return true;
  }

  const worldMaps = await prisma.campaign.findMany({
    where: { OR: [{ worldMapImage: key }, { worldMapImage: { endsWith: `/${key}` } }] },
    select: { id: true, worldMapImageIsPublic: true },
  });
  for (const c of worldMaps) {
    const role = await getUserRole(userId, c.id);
    if (role === "dm" || (role && c.worldMapImageIsPublic)) return true;
  }

  // Battle map JSON: narrow candidates with a text search (key is a validated
  // uuid.ext, so it contains no LIKE wildcards), then check precisely.
  const battle = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT c.id FROM "Campaign" c
    JOIN "CampaignMembership" m ON m."campaignId" = c.id AND m."userId" = ${userId}
    WHERE c."battleMapState"::text LIKE ${"%" + key + "%"}`;
  for (const { id } of battle) {
    const role = await getUserRole(userId, id);
    if (!role) continue;
    const campaign = await prisma.campaign.findUnique({ where: { id }, select: { battleMapState: true } });
    let state: Record<string, any> = { ...BATTLE_DEFAULTS, ...((campaign?.battleMapState ?? {}) as Record<string, any>) };
    if (role !== "dm") {
      const mine = await prisma.character.findMany({ where: { campaignId: id, userId }, select: { id: true } });
      const full = state.tokens;
      state = sanitizeForPlayer(state, mine.map((c) => c.id));
      state = await filterLinkedTokensForPlayer(state, id, full);
    }
    if (collectFileKeys(state).has(key)) return true;
  }

  return false;
}
