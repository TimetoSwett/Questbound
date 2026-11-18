-- Relational battle map. Splits Campaign.battleMapState into tables.
-- Campaign.battleMapState and Campaign.battleMapVersion are NOT changed.
--
-- Deploy order:
--   1. Back up the database.
--   2. Run this file:
--        npx prisma db execute --file prisma/sql/2026-11-18_battle_map_tables.sql --schema prisma/schema.prisma
--   3. Deploy the app (reads tables, falls back to legacy JSON, dual-writes JSON).
--   4. npm run backfill:battle-map -- --dry-run
--   5. npm run backfill:battle-map
-- Safe to re-run: CREATE is IF NOT EXISTS and constraints are added only when missing.
-- Does not read or rewrite battleMapState.

BEGIN;

-- CreateTable
CREATE TABLE IF NOT EXISTS "BattleMap" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "gridWidth" DOUBLE PRECISION,
    "gridHeight" DOUBLE PRECISION,
    "backgroundImage" TEXT,
    "feetPerSquare" DOUBLE PRECISION,
    "cellNumbers" BOOLEAN,
    "activeId" TEXT,
    "handoutKey" TEXT,
    "handoutPushedAt" DOUBLE PRECISION,
    "handoutNull" BOOLEAN NOT NULL DEFAULT false,
    "handoutKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "handoutExtra" JSONB NOT NULL DEFAULT '{}',
    "presentKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "extra" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BattleMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BattleToken" (
    "id" TEXT NOT NULL,
    "battleMapId" TEXT,
    "encounterId" TEXT,
    "snapshotId" TEXT,
    "sort" INTEGER NOT NULL,
    "passthrough" BOOLEAN NOT NULL DEFAULT false,
    "raw" JSONB,
    "presentKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "extra" JSONB NOT NULL DEFAULT '{}',
    "clientId" TEXT,
    "label" TEXT,
    "color" TEXT,
    "x" DOUBLE PRECISION,
    "y" DOUBLE PRECISION,
    "size" DOUBLE PRECISION,
    "hidden" BOOLEAN,
    "characterId" TEXT,
    "characterName" TEXT,
    "portraitKey" TEXT,
    "hp" DOUBLE PRECISION,
    "maxHp" DOUBLE PRECISION,
    "creatureId" TEXT,

    CONSTRAINT "BattleToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BattleTokenCondition" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "sort" INTEGER NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "BattleTokenCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BattleHighlight" (
    "id" TEXT NOT NULL,
    "battleMapId" TEXT,
    "snapshotId" TEXT,
    "sort" INTEGER NOT NULL,
    "passthrough" BOOLEAN NOT NULL DEFAULT false,
    "raw" JSONB,
    "presentKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "extra" JSONB NOT NULL DEFAULT '{}',
    "clientId" TEXT,
    "x" DOUBLE PRECISION,
    "y" DOUBLE PRECISION,
    "w" DOUBLE PRECISION,
    "h" DOUBLE PRECISION,
    "color" TEXT,
    "label" TEXT,

    CONSTRAINT "BattleHighlight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BattleFogCell" (
    "id" TEXT NOT NULL,
    "battleMapId" TEXT,
    "snapshotId" TEXT,
    "sort" INTEGER NOT NULL,
    "passthrough" BOOLEAN NOT NULL DEFAULT false,
    "raw" JSONB,
    "x" INTEGER,
    "y" INTEGER,

    CONSTRAINT "BattleFogCell_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BattleTurn" (
    "id" TEXT NOT NULL,
    "battleMapId" TEXT,
    "snapshotId" TEXT,
    "sort" INTEGER NOT NULL,
    "passthrough" BOOLEAN NOT NULL DEFAULT false,
    "raw" JSONB,
    "presentKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "extra" JSONB NOT NULL DEFAULT '{}',
    "clientId" TEXT,
    "label" TEXT,
    "initiative" DOUBLE PRECISION,
    "characterId" TEXT,
    "tokenId" TEXT,

    CONSTRAINT "BattleTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BattleDrawing" (
    "id" TEXT NOT NULL,
    "battleMapId" TEXT,
    "snapshotId" TEXT,
    "sort" INTEGER NOT NULL,
    "passthrough" BOOLEAN NOT NULL DEFAULT false,
    "raw" JSONB,
    "presentKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "extra" JSONB NOT NULL DEFAULT '{}',
    "clientId" TEXT,
    "color" TEXT,
    "pointsPresent" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "BattleDrawing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BattleDrawingPoint" (
    "id" TEXT NOT NULL,
    "drawingId" TEXT NOT NULL,
    "sort" INTEGER NOT NULL,
    "passthrough" BOOLEAN NOT NULL DEFAULT false,
    "raw" JSONB,
    "presentKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "extra" JSONB NOT NULL DEFAULT '{}',
    "x" DOUBLE PRECISION,
    "y" DOUBLE PRECISION,

    CONSTRAINT "BattleDrawingPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BattleText" (
    "id" TEXT NOT NULL,
    "battleMapId" TEXT,
    "snapshotId" TEXT,
    "sort" INTEGER NOT NULL,
    "passthrough" BOOLEAN NOT NULL DEFAULT false,
    "raw" JSONB,
    "presentKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "extra" JSONB NOT NULL DEFAULT '{}',
    "clientId" TEXT,
    "x" DOUBLE PRECISION,
    "y" DOUBLE PRECISION,
    "text" TEXT,
    "color" TEXT,

    CONSTRAINT "BattleText_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BattlePin" (
    "id" TEXT NOT NULL,
    "battleMapId" TEXT,
    "snapshotId" TEXT,
    "sort" INTEGER NOT NULL,
    "passthrough" BOOLEAN NOT NULL DEFAULT false,
    "raw" JSONB,
    "presentKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "extra" JSONB NOT NULL DEFAULT '{}',
    "clientId" TEXT,
    "x" DOUBLE PRECISION,
    "y" DOUBLE PRECISION,
    "label" TEXT,
    "wikiArticleId" TEXT,

    CONSTRAINT "BattlePin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BattleEncounter" (
    "id" TEXT NOT NULL,
    "battleMapId" TEXT NOT NULL,
    "sort" INTEGER NOT NULL,
    "passthrough" BOOLEAN NOT NULL DEFAULT false,
    "raw" JSONB,
    "presentKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "extra" JSONB NOT NULL DEFAULT '{}',
    "clientId" TEXT,
    "name" TEXT,
    "tokensPresent" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "BattleEncounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BattleSnapshot" (
    "id" TEXT NOT NULL,
    "battleMapId" TEXT NOT NULL,
    "sort" INTEGER NOT NULL,
    "passthrough" BOOLEAN NOT NULL DEFAULT false,
    "raw" JSONB,
    "presentKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "extra" JSONB NOT NULL DEFAULT '{}',
    "clientId" TEXT,
    "name" TEXT,
    "createdAtMs" DOUBLE PRECISION,
    "stateNull" BOOLEAN NOT NULL DEFAULT false,
    "stateKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "stateExtra" JSONB NOT NULL DEFAULT '{}',
    "gridWidth" DOUBLE PRECISION,
    "gridHeight" DOUBLE PRECISION,
    "backgroundImage" TEXT,
    "feetPerSquare" DOUBLE PRECISION,
    "cellNumbers" BOOLEAN,
    "activeId" TEXT,
    "handoutKey" TEXT,
    "handoutPushedAt" DOUBLE PRECISION,
    "handoutNull" BOOLEAN NOT NULL DEFAULT false,
    "handoutKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "handoutExtra" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "BattleSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "BattleMap_campaignId_key" ON "BattleMap"("campaignId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BattleToken_battleMapId_sort_idx" ON "BattleToken"("battleMapId", "sort");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BattleToken_encounterId_sort_idx" ON "BattleToken"("encounterId", "sort");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BattleToken_snapshotId_sort_idx" ON "BattleToken"("snapshotId", "sort");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BattleToken_characterId_idx" ON "BattleToken"("characterId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BattleToken_clientId_idx" ON "BattleToken"("clientId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BattleTokenCondition_tokenId_sort_idx" ON "BattleTokenCondition"("tokenId", "sort");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BattleHighlight_battleMapId_sort_idx" ON "BattleHighlight"("battleMapId", "sort");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BattleHighlight_snapshotId_sort_idx" ON "BattleHighlight"("snapshotId", "sort");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BattleFogCell_battleMapId_sort_idx" ON "BattleFogCell"("battleMapId", "sort");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BattleFogCell_snapshotId_sort_idx" ON "BattleFogCell"("snapshotId", "sort");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BattleTurn_battleMapId_sort_idx" ON "BattleTurn"("battleMapId", "sort");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BattleTurn_snapshotId_sort_idx" ON "BattleTurn"("snapshotId", "sort");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BattleTurn_characterId_idx" ON "BattleTurn"("characterId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BattleDrawing_battleMapId_sort_idx" ON "BattleDrawing"("battleMapId", "sort");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BattleDrawing_snapshotId_sort_idx" ON "BattleDrawing"("snapshotId", "sort");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BattleDrawingPoint_drawingId_sort_idx" ON "BattleDrawingPoint"("drawingId", "sort");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BattleText_battleMapId_sort_idx" ON "BattleText"("battleMapId", "sort");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BattleText_snapshotId_sort_idx" ON "BattleText"("snapshotId", "sort");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BattlePin_battleMapId_sort_idx" ON "BattlePin"("battleMapId", "sort");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BattlePin_snapshotId_sort_idx" ON "BattlePin"("snapshotId", "sort");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BattlePin_wikiArticleId_idx" ON "BattlePin"("wikiArticleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BattleEncounter_battleMapId_sort_idx" ON "BattleEncounter"("battleMapId", "sort");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BattleSnapshot_battleMapId_sort_idx" ON "BattleSnapshot"("battleMapId", "sort");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BattleMap_campaignId_fkey') THEN
    ALTER TABLE "BattleMap" ADD CONSTRAINT "BattleMap_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BattleToken_battleMapId_fkey') THEN
    ALTER TABLE "BattleToken" ADD CONSTRAINT "BattleToken_battleMapId_fkey" FOREIGN KEY ("battleMapId") REFERENCES "BattleMap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BattleToken_encounterId_fkey') THEN
    ALTER TABLE "BattleToken" ADD CONSTRAINT "BattleToken_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "BattleEncounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BattleToken_snapshotId_fkey') THEN
    ALTER TABLE "BattleToken" ADD CONSTRAINT "BattleToken_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "BattleSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BattleTokenCondition_tokenId_fkey') THEN
    ALTER TABLE "BattleTokenCondition" ADD CONSTRAINT "BattleTokenCondition_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "BattleToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BattleHighlight_battleMapId_fkey') THEN
    ALTER TABLE "BattleHighlight" ADD CONSTRAINT "BattleHighlight_battleMapId_fkey" FOREIGN KEY ("battleMapId") REFERENCES "BattleMap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BattleHighlight_snapshotId_fkey') THEN
    ALTER TABLE "BattleHighlight" ADD CONSTRAINT "BattleHighlight_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "BattleSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BattleFogCell_battleMapId_fkey') THEN
    ALTER TABLE "BattleFogCell" ADD CONSTRAINT "BattleFogCell_battleMapId_fkey" FOREIGN KEY ("battleMapId") REFERENCES "BattleMap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BattleFogCell_snapshotId_fkey') THEN
    ALTER TABLE "BattleFogCell" ADD CONSTRAINT "BattleFogCell_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "BattleSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BattleTurn_battleMapId_fkey') THEN
    ALTER TABLE "BattleTurn" ADD CONSTRAINT "BattleTurn_battleMapId_fkey" FOREIGN KEY ("battleMapId") REFERENCES "BattleMap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BattleTurn_snapshotId_fkey') THEN
    ALTER TABLE "BattleTurn" ADD CONSTRAINT "BattleTurn_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "BattleSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BattleDrawing_battleMapId_fkey') THEN
    ALTER TABLE "BattleDrawing" ADD CONSTRAINT "BattleDrawing_battleMapId_fkey" FOREIGN KEY ("battleMapId") REFERENCES "BattleMap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BattleDrawing_snapshotId_fkey') THEN
    ALTER TABLE "BattleDrawing" ADD CONSTRAINT "BattleDrawing_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "BattleSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BattleDrawingPoint_drawingId_fkey') THEN
    ALTER TABLE "BattleDrawingPoint" ADD CONSTRAINT "BattleDrawingPoint_drawingId_fkey" FOREIGN KEY ("drawingId") REFERENCES "BattleDrawing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BattleText_battleMapId_fkey') THEN
    ALTER TABLE "BattleText" ADD CONSTRAINT "BattleText_battleMapId_fkey" FOREIGN KEY ("battleMapId") REFERENCES "BattleMap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BattleText_snapshotId_fkey') THEN
    ALTER TABLE "BattleText" ADD CONSTRAINT "BattleText_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "BattleSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BattlePin_battleMapId_fkey') THEN
    ALTER TABLE "BattlePin" ADD CONSTRAINT "BattlePin_battleMapId_fkey" FOREIGN KEY ("battleMapId") REFERENCES "BattleMap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BattlePin_snapshotId_fkey') THEN
    ALTER TABLE "BattlePin" ADD CONSTRAINT "BattlePin_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "BattleSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BattleEncounter_battleMapId_fkey') THEN
    ALTER TABLE "BattleEncounter" ADD CONSTRAINT "BattleEncounter_battleMapId_fkey" FOREIGN KEY ("battleMapId") REFERENCES "BattleMap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BattleSnapshot_battleMapId_fkey') THEN
    ALTER TABLE "BattleSnapshot" ADD CONSTRAINT "BattleSnapshot_battleMapId_fkey" FOREIGN KEY ("battleMapId") REFERENCES "BattleMap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BattleToken_one_parent') THEN
    ALTER TABLE "BattleToken" ADD CONSTRAINT "BattleToken_one_parent" CHECK ((("battleMapId" IS NOT NULL)::int + ("encounterId" IS NOT NULL)::int + ("snapshotId" IS NOT NULL)::int) = 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BattleHighlight_one_parent') THEN
    ALTER TABLE "BattleHighlight" ADD CONSTRAINT "BattleHighlight_one_parent" CHECK ((("battleMapId" IS NOT NULL)::int + ("snapshotId" IS NOT NULL)::int) = 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BattleFogCell_one_parent') THEN
    ALTER TABLE "BattleFogCell" ADD CONSTRAINT "BattleFogCell_one_parent" CHECK ((("battleMapId" IS NOT NULL)::int + ("snapshotId" IS NOT NULL)::int) = 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BattleTurn_one_parent') THEN
    ALTER TABLE "BattleTurn" ADD CONSTRAINT "BattleTurn_one_parent" CHECK ((("battleMapId" IS NOT NULL)::int + ("snapshotId" IS NOT NULL)::int) = 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BattleDrawing_one_parent') THEN
    ALTER TABLE "BattleDrawing" ADD CONSTRAINT "BattleDrawing_one_parent" CHECK ((("battleMapId" IS NOT NULL)::int + ("snapshotId" IS NOT NULL)::int) = 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BattleText_one_parent') THEN
    ALTER TABLE "BattleText" ADD CONSTRAINT "BattleText_one_parent" CHECK ((("battleMapId" IS NOT NULL)::int + ("snapshotId" IS NOT NULL)::int) = 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BattlePin_one_parent') THEN
    ALTER TABLE "BattlePin" ADD CONSTRAINT "BattlePin_one_parent" CHECK ((("battleMapId" IS NOT NULL)::int + ("snapshotId" IS NOT NULL)::int) = 1);
  END IF;
END $$;

COMMIT;
