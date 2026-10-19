-- Companion sheets: Character.ownerCharacterId (self-relation, SetNull on owner
-- delete) and Character.companionType (free text, e.g. 'animal companion').
-- This project syncs its schema with `npx prisma db push` (no migrations
-- history), which applies this change automatically. This file is the
-- equivalent SQL for anyone applying it by hand; it is safe to re-run.
ALTER TABLE "Character" ADD COLUMN IF NOT EXISTS "companionType" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Character" ADD COLUMN IF NOT EXISTS "ownerCharacterId" TEXT;

CREATE INDEX IF NOT EXISTS "Character_ownerCharacterId_idx" ON "Character"("ownerCharacterId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Character_ownerCharacterId_fkey'
  ) THEN
    ALTER TABLE "Character" ADD CONSTRAINT "Character_ownerCharacterId_fkey"
      FOREIGN KEY ("ownerCharacterId") REFERENCES "Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
