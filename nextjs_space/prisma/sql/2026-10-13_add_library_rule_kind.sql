-- Library: new entry kind "rule" (AoN Universal Monster Rules), reusing LibraryEntry.
-- "LibraryEntry"."kind" is a TEXT column (not a Postgres enum); allowed kinds
-- are enforced in lib/library.ts (LIBRARY_KINDS + zod). So no ALTER TYPE is
-- needed and there is no schema change: `npx prisma db push` is a no-op.
-- Rule data (JSONB): { category, format, text, aliases[] } validated by ruleDataSchema.
-- Rules have no SpellLevel rows. Safe to re-run.
SELECT 1;
