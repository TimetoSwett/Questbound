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
    mapPinId: town.mapPinId ?? null,
  };
}
