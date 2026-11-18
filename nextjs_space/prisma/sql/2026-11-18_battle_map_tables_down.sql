-- Drop the relational battle-map tables.
-- Does NOT drop Campaign.battleMapState or Campaign.battleMapVersion.
--
-- Reverting the application is safe while dual-write is on (the JSON column
-- still has the latest document). If dual-write was turned off and the tables
-- are ahead of the JSON, run this FIRST, with the new code still installed:
--
--   npm run backfill:battle-map -- --write-legacy
--
-- Then revert the app. Drop the tables only after you no longer need them
-- (or immediately after --write-legacy, once reads are coming from JSON again):
--
--   npx prisma db execute --file prisma/sql/2026-11-18_battle_map_tables_down.sql --schema prisma/schema.prisma
--
-- Safe to re-run.

BEGIN;

DROP TABLE IF EXISTS "BattleTokenCondition";
DROP TABLE IF EXISTS "BattleDrawingPoint";
DROP TABLE IF EXISTS "BattleToken";
DROP TABLE IF EXISTS "BattleHighlight";
DROP TABLE IF EXISTS "BattleFogCell";
DROP TABLE IF EXISTS "BattleTurn";
DROP TABLE IF EXISTS "BattleDrawing";
DROP TABLE IF EXISTS "BattleText";
DROP TABLE IF EXISTS "BattlePin";
DROP TABLE IF EXISTS "BattleEncounter";
DROP TABLE IF EXISTS "BattleSnapshot";
DROP TABLE IF EXISTS "BattleMap";

COMMIT;
