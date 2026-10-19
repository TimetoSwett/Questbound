import { GEAR_SLOTS, gearDataSchema, spellItemCost, type GearData } from './library';

export type GearFormState = {
  spellItem?: GearData['spellItem'];
  charges?: string;
  slot: string;
  aura: string;
  cl: string;
  cost: string;
  weight: string;
  description: string;
};

export const GEAR_SLOT_LABELS: Record<(typeof GEAR_SLOTS)[number], string> = {
  head: 'Head', headband: 'Headband', eyes: 'Eyes', shoulders: 'Shoulders', neck: 'Neck',
  chest: 'Chest', body: 'Body', armor: 'Armor', shield: 'Shield', belt: 'Belt', wrists: 'Wrists', hands: 'Hands',
  ring: 'Ring', feet: 'Feet', slotless: 'Slotless',
};

export function emptyGearForm(prefill?: Partial<GearFormState>): GearFormState {
  return {
    ...(prefill?.spellItem ? { spellItem: prefill.spellItem, charges: prefill.charges ?? String(prefill.spellItem.charges) } : {}),
    slot: prefill?.slot ?? '', aura: prefill?.aura ?? '', cl: prefill?.cl ?? '',
    cost: prefill?.cost ?? '', weight: prefill?.weight ?? '', description: prefill?.description ?? '',
  };
}

export function buildGearData(form: GearFormState):
  { ok: true; data: GearData } | { ok: false; error: string } {
  const weight = form.weight.trim() ? Number(form.weight) : 0;
  if (!Number.isFinite(weight) || weight < 0 || weight > 100000) {
    return { ok: false, error: 'Weight must be a number from 0 to 100000.' };
  }
  const slot = form.slot.trim();
  const aura = form.aura.trim();
  const cl = form.cl.trim();
  const cost = form.cost.trim();
  if (cost.length > 120) return { ok: false, error: 'Cost must be at most 120 characters.' };
  if (slot && !GEAR_SLOTS.some((value) => value === slot)) return { ok: false, error: 'Choose a valid gear slot.' };
  if (aura.length > 80) return { ok: false, error: 'Aura must be at most 80 characters.' };
  if (cl && (!/^\d+$/.test(cl) || Number(cl) > 30)) {
    return { ok: false, error: 'CL must be a whole number from 0 to 30.' };
  }
  if (form.spellItem && !/^\d+$/.test(form.charges ?? '')) return { ok: false, error: 'Enter a whole number of charges.' };
  const spellItem = form.spellItem ? { ...form.spellItem, charges: Number(form.charges) } : undefined;
  const parsed = gearDataSchema.safeParse({
    ...(spellItem ? { spellItem } : {}),
    weight, cost, description: form.description.trim(),
    ...(slot ? { slot } : {}), ...(aura ? { aura } : {}), ...(cl ? { cl: Number(cl) } : {}),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${issue.path.join('.')}: ${issue.message}` };
  }
  const data = parsed.data;
  if (data.spellItem) data.cost = spellItemCost(data.spellItem, data.cl!);
  return { ok: true, data };
}
