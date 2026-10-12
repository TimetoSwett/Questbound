// Server-side reveal handling for towns. Mirrors the creature reveal system:
// hidden towns are invisible to players (the API returns 404), and every
// other level returns a card with locked fields scrambled. gmNotes is
// GM-only and never leaves the server for players.
import { scrambleText, asUnlocked, LOCKED_NUMBER_FILLER } from './creatures';

export const TOWN_SIZES = [
  'thorp',
  'hamlet',
  'village',
  'small town',
  'large town',
  'small city',
  'large city',
  'metropolis',
] as const;

export const TOWN_SECTIONS = [
  'name',
  'description',
  'details',
  'residents',
  'places',
  'wiki',
] as const;
export type TownSection = (typeof TOWN_SECTIONS)[number];

export function townSectionLabel(section: string): string {
  const labels: Record<string, string> = {
    name: 'Name',
    description: 'Description',
    details: 'Details',
    residents: 'Residents',
    places: 'Places',
    wiki: 'Wiki',
  };
  return labels[section] ?? section;
}

/**
 * Player-facing view of a town. Returns null for hidden towns (the API turns
 * that into a 404, like creatures). Residents, places and the wiki link are
 * attached by the route after their own reveal checks; this only handles the
 * town's own fields.
 */
export function presentTown(town: Record<string, any>): Record<string, unknown> | null {
  const level = town.revealLevel;
  if (level === 'hidden') return null;
  const unlocked: string[] =
    level === 'full' ? [...TOWN_SECTIONS] : asUnlocked(town.unlockedSections);
  const shows = (s: string) => unlocked.includes(s);
  const seedBase = `${town.id}:${level}`;
  const nameReadable = level === 'full' || shows('name');

  const wikiPage =
    shows('wiki') && town.wikiPage && town.wikiPage.visibility === 'shared'
      ? { id: town.wikiPage.id, title: town.wikiPage.title }
      : null;

  return {
    id: town.id,
    campaignId: town.campaignId,
    revealLevel: level,
    unlockedSections: unlocked,
    name: nameReadable ? (town.name ?? '') : scrambleText(town.name ?? '', `${seedBase}:name`),
    size: shows('details') ? (town.size ?? '') : scrambleText(town.size ?? '', `${seedBase}:size`),
    population:
      town.population == null
        ? null
        : shows('details')
          ? town.population
          : LOCKED_NUMBER_FILLER,
    government: shows('details')
      ? (town.government ?? '')
      : scrambleText(town.government ?? '', `${seedBase}:government`),
    description: shows('description')
      ? (town.description ?? '')
      : scrambleText(town.description ?? '', `${seedBase}:description`),
    wikiPage,
  };
}

function cleanStr(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().slice(0, max);
  return s ? s : null;
}

/** Validate a town payload. Returns { ok, data } or { ok: false, error }. */
export function parseTownInput(body: Record<string, unknown>, campaignId: string) {
  const name = cleanStr(body.name, 200);
  if (!name) return { ok: false as const, error: 'Name is required' };
  const size = typeof body.size === 'string' && (TOWN_SIZES as readonly string[]).includes(body.size)
    ? body.size
    : 'village';
  let population: number | null = null;
  if (body.population !== undefined && body.population !== null && body.population !== '') {
    const p = typeof body.population === 'number' ? body.population : parseInt(String(body.population), 10);
    if (!Number.isFinite(p) || p < 0) return { ok: false as const, error: 'Population must be a non-negative number' };
    population = Math.floor(p);
  }
  const government = typeof body.government === 'string' ? body.government.slice(0, 200) : '';
  const description = typeof body.description === 'string' ? body.description.slice(0, 100000) : '';
  const gmNotes = typeof body.gmNotes === 'string' ? body.gmNotes.slice(0, 100000) : '';
  const wikiPageId = typeof body.wikiPageId === 'string' && body.wikiPageId ? body.wikiPageId : null;
  const mapPinId = typeof body.mapPinId === 'string' && body.mapPinId ? body.mapPinId : null;
  return {
    ok: true as const,
    data: { campaignId, name, size, population, government, description, gmNotes, wikiPageId, mapPinId },
  };
}

