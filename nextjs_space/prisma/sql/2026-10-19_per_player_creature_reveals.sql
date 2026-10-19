-- Per-player Bestiary unlocks: new "CreatureReveal" table (one row per
-- creature per player), plus a one-time copy of the old party-wide unlocks to
-- every current player of each campaign.
--
-- Deploy order (production):
--   1. Back up the database.
--   2. Run this file:
--        npx prisma db execute --file prisma/sql/2026-10-19_per_player_creature_reveals.sql --schema prisma/schema.prisma
--   3. Deploy the app (`npx prisma db push` is then a no-op for this change).
-- Running it after `db push` also works: the table already exists and the
-- copy still happens. Either way, run it before players use the new build,
-- or they'll see creatures as fully sealed until it runs.
--
-- Safe to re-run: the table/index/constraint steps are IF NOT EXISTS, and the
-- copy empties the old party-wide data in the same transaction, so a second
-- run copies nothing and never overwrites a GM's later per-player changes.
--
-- How old data maps to per-player rows, for each creature in a campaign and
-- each current non-GM member of that campaign:
--   revealLevel 'full'                   -> full = true, all sections
--   revealLevel 'named'                  -> its unlockedSections plus 'name'
--                                           (named always showed the name)
--   any other level with unlockedSections -> those sections
--   nothing unlocked                     -> no row (no row = nothing unlocked)
-- Then 'named'/'full' become 'unknown' (still listed for players; "named" and
-- "full" are now per player) and unlockedSections is emptied. 'hidden'
-- creatures stay hidden, but their unlocks are still copied so un-hiding one
-- later restores what the party had learned.
-- Players who join later start with nothing unlocked.

BEGIN;

CREATE TABLE IF NOT EXISTS "CreatureReveal" (
  "id"         TEXT         NOT NULL,
  "creatureId" TEXT         NOT NULL,
  "userId"     TEXT         NOT NULL,
  "sections"   JSONB        NOT NULL DEFAULT '[]',
  "full"       BOOLEAN      NOT NULL DEFAULT false,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CreatureReveal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CreatureReveal_creatureId_userId_key" ON "CreatureReveal"("creatureId", "userId");
CREATE INDEX IF NOT EXISTS "CreatureReveal_userId_idx" ON "CreatureReveal"("userId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CreatureReveal_creatureId_fkey') THEN
    ALTER TABLE "CreatureReveal" ADD CONSTRAINT "CreatureReveal_creatureId_fkey"
      FOREIGN KEY ("creatureId") REFERENCES "Creature"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CreatureReveal_userId_fkey') THEN
    ALTER TABLE "CreatureReveal" ADD CONSTRAINT "CreatureReveal_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Lock creatures so a GM edit can't slip in between the copy and the clear.
LOCK TABLE "Creature" IN SHARE ROW EXCLUSIVE MODE;

WITH old AS (
  SELECT
    c."id"         AS creature_id,
    c."campaignId" AS campaign_id,
    c."revealLevel" = 'full' AS is_full,
    -- Only known section names; junk entries and a non-array/null value count as empty.
    COALESCE((
      SELECT jsonb_agg(DISTINCT s)
      FROM (
        SELECT e AS s
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(c."unlockedSections"::jsonb) = 'array' THEN c."unlockedSections"::jsonb ELSE '[]'::jsonb END
        ) AS j(v), LATERAL (SELECT j.v #>> '{}' AS e) x
        WHERE jsonb_typeof(j.v) = 'string'
          AND e IN ('name','defense','offense','statistics','specialAbilities','playerNotes','wiki')
        UNION
        SELECT 'name' WHERE c."revealLevel" = 'named'
        UNION
        SELECT unnest(ARRAY['name','defense','offense','statistics','specialAbilities','playerNotes','wiki'])
        WHERE c."revealLevel" = 'full'
      ) secs
    ), '[]'::jsonb) AS sections
  FROM "Creature" c
)
INSERT INTO "CreatureReveal" ("id", "creatureId", "userId", "sections", "full", "createdAt", "updatedAt")
SELECT
  'crv_' || md5(old.creature_id || ':' || m."userId"),
  old.creature_id,
  m."userId",
  old.sections,
  old.is_full,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM old
JOIN "CampaignMembership" m ON m."campaignId" = old.campaign_id AND m."role" <> 'dm'
WHERE old.is_full OR old.sections <> '[]'::jsonb
ON CONFLICT ("creatureId", "userId") DO NOTHING;

UPDATE "Creature" SET "revealLevel" = 'unknown' WHERE "revealLevel" IN ('named', 'full');
UPDATE "Creature" SET "unlockedSections" = '[]'::jsonb
WHERE "unlockedSections" IS DISTINCT FROM '[]'::jsonb;

COMMIT;
