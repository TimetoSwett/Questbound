-- One-time data migration: unlock the "name" section for named creatures.
-- Existing "named" creatures were readable by name before "name" became its own
-- unlockable section; this preserves that behavior under the new rules.
-- Run any time after deploying (order vs `prisma db push` does not matter):
--   npx prisma db execute --file prisma/migrate-reveal-name-unlock.sql --schema prisma/schema.prisma
-- Idempotent: the WHERE clause skips rows that already unlock 'name', so
-- re-running never duplicates the entry or clobbers GM changes.
UPDATE "Creature"
SET "unlockedSections" = (
  CASE
    WHEN COALESCE("unlockedSections"::jsonb, '[]'::jsonb) = 'null'::jsonb THEN '["name"]'::jsonb
    ELSE COALESCE("unlockedSections"::jsonb, '[]'::jsonb) || '"name"'::jsonb
  END
)
WHERE "revealLevel" = 'named'
  AND NOT (COALESCE("unlockedSections"::jsonb, '[]'::jsonb) ? 'name');
