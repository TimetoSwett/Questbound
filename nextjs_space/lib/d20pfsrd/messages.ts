// Shared d20pfsrd import error texts. A leaf module (no imports) so the parser
// and the per-kind parsers can all use it without import cycles.

export const D20PFSRD_UNSUPPORTED = 'd20pfsrd import supports spells, feats, magic items (wondrous items, rings, rods, staves), weapons, armor and shields, and mundane gear. Magic weapons and armor, potions, scrolls, wands, artifacts and services are not supported yet.';
export const HINT = ' Open a single spell, feat, magic item, weapon, armor, shield or gear page (for goods-and-services gear, copy the link with the #item anchor).';
/** Gear pages list many items: point at the #item anchor. */
export const GEAR_HINT = ' Open a goods-and-services page (/equipment/goods-and-services/…) and copy the link with the #item anchor, e.g. …/hunting-camping-survival-gear/#bedroll.';
