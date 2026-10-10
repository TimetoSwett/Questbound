-- Adds the optimistic-concurrency counter for Campaign.battleMapState.
-- This project syncs its schema with `npx prisma db push` (no migrations
-- history), which applies this change automatically. This file is the
-- equivalent SQL for anyone applying it by hand; it is safe to re-run.
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "battleMapVersion" INTEGER NOT NULL DEFAULT 0;
