-- Shared site-wide library (LibraryEntry + SpellLevel) and User.isAdmin.
-- This project syncs its schema with `npx prisma db push` (no migrations
-- history), which applies this change automatically. This file is the
-- equivalent SQL for anyone applying it by hand; it is safe to re-run.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isAdmin" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "LibraryEntry" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "system" TEXT NOT NULL DEFAULT 'pf1e',
    "source" TEXT NOT NULL DEFAULT 'user',
    "sourceUrl" TEXT,
    "matchedAon" BOOLEAN NOT NULL DEFAULT false,
    "summary" TEXT NOT NULL DEFAULT '',
    "data" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LibraryEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SpellLevel" (
    "entryId" TEXT NOT NULL,
    "cls" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    CONSTRAINT "SpellLevel_pkey" PRIMARY KEY ("entryId","cls")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LibraryEntry_kind_system_nameKey_key" ON "LibraryEntry"("kind", "system", "nameKey");
CREATE INDEX IF NOT EXISTS "SpellLevel_cls_level_idx" ON "SpellLevel"("cls", "level");

DO $$ BEGIN
  ALTER TABLE "LibraryEntry" ADD CONSTRAINT "LibraryEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "SpellLevel" ADD CONSTRAINT "SpellLevel_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "LibraryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
