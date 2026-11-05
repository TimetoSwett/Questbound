-- Adds the campaign rules system to Campaign: 'pf1e' (default) or 'cyberpunk2020',
-- and Character.cyberpunk (nullable JSONB) to hold Cyberpunk 2020 sheet data.
-- Existing campaigns become pf1e; existing characters get NULL. This project
-- syncs its schema with `npx prisma db push` (no migrations history), which
-- applies this change automatically. This file is the equivalent SQL for
-- anyone applying it by hand; it is safe to re-run.
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "system" TEXT NOT NULL DEFAULT 'pf1e';
ALTER TABLE "Character" ADD COLUMN IF NOT EXISTS "cyberpunk" JSONB;
