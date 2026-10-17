import { featDescription, gearItemFields, type AbilityTag } from './catalog';
import { emptyFeatForm, buildFeatData, type FeatFormState } from './library-feat-form';
import { emptyAbilityForm, buildAbilityData, ABILITY_TAG_LABELS, type AbilityFormState } from './library-ability-form';
import { emptyGearForm, buildGearData, GEAR_SLOT_LABELS, type GearFormState } from './library-gear-form';

type FeatEntry = Partial<FeatFormState> & { libraryEntryId?: string; summary?: string };
type AbilityEntry = { tag?: AbilityTag; uses?: string; description?: string };
type GearItem = { slot?: string; aura?: string; cl?: number; value?: string; weight?: number; notes?: string };

export function featFormFromEntry(entry: FeatEntry): FeatFormState {
  return emptyFeatForm(entry);
}

export function featPatchFromForm(form: FeatFormState) {
  const result = buildFeatData(form);
  if (!result.ok) return result;
  const data = result.data;
  return { ok: true as const, patch: {
    featType: data.featType || undefined, prerequisites: data.prerequisites || undefined,
    benefit: data.benefit || undefined, description: data.description, summary: undefined,
  } };
}

/** Card text: library-linked feats (and ex-linked ones whose description featFromLibrary already built) show the stored text; custom feats are composed like featFromLibrary. */
export function featCardBody(entry: FeatEntry) {
  const built = /^(Prerequisites|Benefit): /.test(entry.description ?? '');
  return entry.libraryEntryId || built ? entry.summary || entry.description : featDescription(entry);
}

export function abilityFormFromEntry(entry: AbilityEntry): AbilityFormState {
  return emptyAbilityForm(entry);
}

export function abilityPatchFromForm(form: AbilityFormState) {
  const result = buildAbilityData(form);
  if (!result.ok) return result;
  return { ok: true as const, patch: {
    tag: result.data.tag, uses: result.data.uses || undefined, description: result.data.description,
  } };
}

export function abilityMeta(entry: AbilityEntry) {
  return [entry.tag ? ABILITY_TAG_LABELS[entry.tag] : 'Special ability', entry.uses].filter(Boolean).join(' · ');
}

export function gearFormFromItem(item: GearItem): GearFormState {
  return emptyGearForm({ slot: item.slot, aura: item.aura, cl: item.cl?.toString(),
    cost: item.value, weight: item.weight?.toString(), description: item.notes });
}

export function gearPatchFromForm(form: GearFormState) {
  const result = buildGearData(form);
  if (!result.ok) return result;
  return { ok: true as const, patch: {
    ...gearItemFields(result.data), slot: result.data.slot, aura: result.data.aura, cl: result.data.cl,
  } };
}

export function gearMetaExtras(item: GearItem) {
  const slot = item.slot && GEAR_SLOT_LABELS[item.slot as keyof typeof GEAR_SLOT_LABELS];
  return [slot, item.aura, item.cl !== undefined ? `CL ${item.cl}` : ''].filter(Boolean).join(' · ');
}
