// Shared d20pfsrd import error texts. A leaf module (no imports) so the parser
// and the per-kind parsers can all use it without import cycles.

export const D20PFSRD_UNSUPPORTED = 'd20pfsrd import supports spells, feats, magic items (wondrous items, rings, rods, staves, specific magic weapons, armor and shields, potions, scrolls and wands), weapons, armor and shields, and mundane gear. Artifacts and services are not supported. Standard scrolls and wands can be imported from a spell link by choosing the item type and supplying caster level and wand charges.';
export const HINT = ' Open a single spell, feat, magic item, weapon, armor, shield or gear page (for goods-and-services gear, copy the link with the #item anchor).';
/** Gear pages list many items: point at the #item anchor. */
export const GEAR_HINT = ' Open a goods-and-services page (/equipment/goods-and-services/…) and copy the link with the #item anchor, e.g. …/hunting-camping-survival-gear/#bedroll.';
