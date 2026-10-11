-- One-time data migration: revealedToPlayers -> revealLevel.
-- Run AFTER `prisma db push` has added revealLevel/unlockedSections/playerNotes:
--   npx prisma db execute --file prisma/migrate-reveal-levels.sql --schema prisma/schema.prisma
-- Idempotent: the legacy flag is cleared once copied, so re-running never
-- overrides a level the GM later changed.
UPDATE "Creature" SET "revealLevel" = 'full', "revealedToPlayers" = false WHERE "revealedToPlayers" = true;
