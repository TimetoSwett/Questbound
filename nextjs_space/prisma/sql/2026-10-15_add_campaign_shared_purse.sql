-- Adds the DM-controlled shared party purse setting to Campaign.
-- When true, gp/pp on character sheets come from Campaign.partyCp; sp/cp stay
-- per character. Character coins (spells.coins) are never modified.
-- This project syncs its schema with `npx prisma db push` (no migrations
-- history), which applies this change automatically. This file is the
-- equivalent SQL for anyone applying it by hand; it is safe to re-run.
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "sharedPurse" BOOLEAN NOT NULL DEFAULT false;
