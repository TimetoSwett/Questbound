// Copy Campaign.battleMapState into the BattleMap* tables.
//
// The legacy JSON column is not modified by the forward copy. Re-running is
// safe: a campaign that already has a BattleMap row is skipped, so later
// table writes are not overwritten. Each campaign is committed in its own
// transaction. After insert, the script reads the rows back and checks that
// the rebuilt JSON deep-equals the source and that row counts match.
//
//   npm run backfill:battle-map -- --dry-run
//   npm run backfill:battle-map
//
// Rollback prep (tables are ahead of the JSON column, dual-write was off):
//   npm run backfill:battle-map -- --write-legacy
// That copies tables back into battleMapState when they differ, and bumps
// battleMapVersion. It does not drop tables. Then revert the app. Drop the
// tables later with prisma/sql/2026-11-18_battle_map_tables_down.sql.
//
// This script never runs against a database unless you invoke it.

import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
  countState,
  documentToState,
  stateToDocument,
  type BattleCounts,
} from '../lib/battle-map-codec';
import { battleMapByteSize, battleMapWriteRejection } from '../lib/battle-map-limits';
import { loadBattleState, replaceBattleDocument } from '../lib/battle-map-store';

const PAGE = 25;

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const writeLegacy = args.has('--write-legacy');

if (args.has('--help') || args.has('-h')) {
  console.log('Usage: npm run backfill:battle-map -- [--dry-run | --write-legacy]');
  process.exit(0);
}

type CountRow = {
  tokens: number;
  conditions: number;
  highlights: number;
  fog: number;
  turns: number;
  drawings: number;
  points: number;
  texts: number;
  pins: number;
  encounters: number;
  snapshots: number;
};

function asCounts(row: CountRow): BattleCounts {
  const counts = {} as BattleCounts;
  for (const key of Object.keys(row) as (keyof CountRow)[]) counts[key] = Number(row[key]);
  return counts;
}

async function sqlCounts(campaignId: string, tx: Prisma.TransactionClient): Promise<BattleCounts> {
  const rows = await tx.$queryRaw<CountRow[]>`
    SELECT
      (SELECT count(*)::int FROM "BattleToken" t
        WHERE t."battleMapId" = bm.id
           OR t."encounterId" IN (SELECT e.id FROM "BattleEncounter" e WHERE e."battleMapId" = bm.id)
           OR t."snapshotId" IN (SELECT s.id FROM "BattleSnapshot" s WHERE s."battleMapId" = bm.id)) AS tokens,
      (SELECT count(*)::int FROM "BattleTokenCondition" c
        WHERE c."tokenId" IN (
          SELECT t.id FROM "BattleToken" t
          WHERE t."battleMapId" = bm.id
             OR t."encounterId" IN (SELECT e.id FROM "BattleEncounter" e WHERE e."battleMapId" = bm.id)
             OR t."snapshotId" IN (SELECT s.id FROM "BattleSnapshot" s WHERE s."battleMapId" = bm.id)
        )) AS conditions,
      (SELECT count(*)::int FROM "BattleHighlight" h
        WHERE h."battleMapId" = bm.id
           OR h."snapshotId" IN (SELECT s.id FROM "BattleSnapshot" s WHERE s."battleMapId" = bm.id)) AS highlights,
      (SELECT count(*)::int FROM "BattleFogCell" f
        WHERE f."battleMapId" = bm.id
           OR f."snapshotId" IN (SELECT s.id FROM "BattleSnapshot" s WHERE s."battleMapId" = bm.id)) AS fog,
      (SELECT count(*)::int FROM "BattleTurn" n
        WHERE n."battleMapId" = bm.id
           OR n."snapshotId" IN (SELECT s.id FROM "BattleSnapshot" s WHERE s."battleMapId" = bm.id)) AS turns,
      (SELECT count(*)::int FROM "BattleDrawing" d
        WHERE d."battleMapId" = bm.id
           OR d."snapshotId" IN (SELECT s.id FROM "BattleSnapshot" s WHERE s."battleMapId" = bm.id)) AS drawings,
      (SELECT count(*)::int FROM "BattleDrawingPoint" p
        WHERE p."drawingId" IN (
          SELECT d.id FROM "BattleDrawing" d
          WHERE d."battleMapId" = bm.id
             OR d."snapshotId" IN (SELECT s.id FROM "BattleSnapshot" s WHERE s."battleMapId" = bm.id)
        )) AS points,
      (SELECT count(*)::int FROM "BattleText" x
        WHERE x."battleMapId" = bm.id
           OR x."snapshotId" IN (SELECT s.id FROM "BattleSnapshot" s WHERE s."battleMapId" = bm.id)) AS texts,
      (SELECT count(*)::int FROM "BattlePin" p
        WHERE p."battleMapId" = bm.id
           OR p."snapshotId" IN (SELECT s.id FROM "BattleSnapshot" s WHERE s."battleMapId" = bm.id)) AS pins,
      (SELECT count(*)::int FROM "BattleEncounter" e WHERE e."battleMapId" = bm.id) AS encounters,
      (SELECT count(*)::int FROM "BattleSnapshot" s WHERE s."battleMapId" = bm.id) AS snapshots
    FROM "BattleMap" bm
    WHERE bm."campaignId" = ${campaignId}
  `;
  if (rows.length !== 1) throw new Error(`Expected one BattleMap for ${campaignId}`);
  return asCounts(rows[0]);
}

async function forward() {
  const summary = {
    dryRun,
    campaigns: 0,
    nullState: 0,
    malformed: [] as string[],
    overLimit: [] as Array<{ id: string; bytes: number; error: string }>,
    skippedExisting: 0,
    verified: 0,
    written: 0,
    counts: { tokens: 0, fog: 0, snapshots: 0, encounters: 0, drawings: 0, points: 0 },
  };

  let cursor: string | undefined;
  for (;;) {
    const campaigns = await prisma.campaign.findMany({
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: { id: true, battleMapState: true },
      orderBy: { id: 'asc' },
    });
    if (campaigns.length === 0) break;
    cursor = campaigns[campaigns.length - 1].id;
    summary.campaigns += campaigns.length;

  for (const campaign of campaigns) {
    if (campaign.battleMapState == null) {
      summary.nullState++;
      continue;
    }
    const encoded = stateToDocument(campaign.battleMapState);
    if (!encoded.ok) {
      summary.malformed.push(campaign.id);
      continue;
    }
    assert.deepEqual(documentToState(encoded.document), campaign.battleMapState, `round-trip mismatch before write for ${campaign.id}`);
    // Over-cap legacy maps are copied whole and reported. Nothing is clipped.
    const limited = battleMapWriteRejection(campaign.battleMapState);
    if (limited) {
      summary.overLimit.push({ id: campaign.id, bytes: battleMapByteSize(campaign.battleMapState), error: limited.error });
    }
    const expected = countState(campaign.battleMapState);
    assert.ok(expected, `counts missing for ${campaign.id}`);
    summary.counts.tokens += expected.tokens;
    summary.counts.fog += expected.fog;
    summary.counts.snapshots += expected.snapshots;
    summary.counts.encounters += expected.encounters;
    summary.counts.drawings += expected.drawings;
    summary.counts.points += expected.points;
    summary.verified++;
    if (dryRun) continue;

    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Campaign" WHERE id = ${campaign.id} FOR UPDATE`;
      const fresh = await tx.campaign.findUnique({
        where: { id: campaign.id },
        select: { battleMapState: true },
      });
      const existing = await tx.battleMap.findUnique({ where: { campaignId: campaign.id }, select: { id: true } });
      if (existing) {
        summary.skippedExisting++;
        return;
      }
      if (fresh?.battleMapState == null) return;
      const again = stateToDocument(fresh.battleMapState);
      if (!again.ok) {
        summary.malformed.push(campaign.id);
        return;
      }
      await replaceBattleDocument(tx, campaign.id, again.document);
      const loaded = await loadBattleState(tx, campaign.id);
      assert.ok(loaded && loaded.source === 'tables', `tables missing after insert for ${campaign.id}`);
      assert.deepEqual(loaded.state, fresh.battleMapState, `read-back mismatch for ${campaign.id}`);
      const counts = await sqlCounts(campaign.id, tx);
      assert.deepEqual(counts, countState(fresh.battleMapState), `row-count mismatch for ${campaign.id}`);
      // The legacy column is intentionally left untouched.
      const json = await tx.campaign.findUnique({ where: { id: campaign.id }, select: { battleMapState: true } });
      assert.deepEqual(json?.battleMapState, fresh.battleMapState);
      summary.written++;
    }, { timeout: 120_000, maxWait: 15_000 });
    }
    if (campaigns.length < PAGE) break;
  }

  console.log(JSON.stringify({
    ...summary,
    malformed: summary.malformed.slice(0, 50),
    malformedCount: summary.malformed.length,
    overLimit: summary.overLimit.slice(0, 50),
    overLimitCount: summary.overLimit.length,
    legacyJsonUntouched: true,
    truncated: false,
  }, null, 2));
  console.log(dryRun
    ? `Dry run: ${summary.verified} object maps round-trip, ${summary.malformed.length} malformed left on JSON, ${summary.nullState} null, ${summary.overLimit.length} over the row/byte caps (reported, not truncated). No rows written.`
    : `Backfill wrote ${summary.written} maps, skipped ${summary.skippedExisting} already backfilled, left ${summary.malformed.length} malformed JSON values untouched, and copied ${summary.overLimit.length} over-cap maps without truncating them.`);
}

async function reverse() {
  let written = 0;
  let unchanged = 0;
  let maps = 0;
  let cursor: string | undefined;
  for (;;) {
    const page = await prisma.battleMap.findMany({
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: { id: true, campaignId: true },
      orderBy: { id: 'asc' },
    });
    if (page.length === 0) break;
    cursor = page[page.length - 1].id;
    maps += page.length;
  for (const map of page) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Campaign" WHERE id = ${map.campaignId} FOR UPDATE`;
      const loaded = await loadBattleState(tx, map.campaignId);
      if (!loaded || loaded.source !== 'tables') return;
      const current = await tx.campaign.findUnique({
        where: { id: map.campaignId },
        select: { battleMapState: true },
      });
      try {
        assert.deepEqual(current?.battleMapState, loaded.state);
        unchanged++;
        return;
      } catch {
        // JSON differs from the tables. Copy the table document back.
      }
      if (dryRun) {
        written++;
        return;
      }
      await tx.campaign.update({
        where: { id: map.campaignId },
        data: {
          battleMapState: loaded.state as Prisma.InputJsonValue,
          battleMapVersion: { increment: 1 },
        },
      });
      written++;
    }, { timeout: 120_000, maxWait: 15_000 });
    }
    if (page.length < PAGE) break;
  }
  console.log(JSON.stringify({ writeLegacy: true, maps, written, unchanged }, null, 2));
  console.log(dryRun
    ? `Dry run: ${written} maps would refresh battleMapState from tables, ${unchanged} already match.`
    : `Wrote legacy JSON for ${written} maps, ${unchanged} already matched. Tables were not dropped.`);
}

// No top-level await: package.json has no "type": "module", and tsx 4.20
// compiles this .ts file as CommonJS, which cannot emit top-level await
// (Node 26 reports that and exits before the script runs).
async function main(): Promise<void> {
  try {
    if (!process.env.DATABASE_URL) {
      console.error('DATABASE_URL is not set. Refusing to run.');
      process.exitCode = 1;
      return;
    }
    if (writeLegacy) await reverse();
    else await forward();
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
