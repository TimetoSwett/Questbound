// Shared d20pfsrd import error texts. A leaf module (no imports) so the parser
// and the per-kind parsers can all use it without import cycles.

export const D20PFSRD_UNSUPPORTED = 'd20pfsrd import currently supports spells, feats, magic items and mundane gear only.';
export const HINT = ' Open a single spell (/magic/all-spells/…), feat (/feats/…), magic item (/magic-items/…) or gear (/equipment/goods-and-services/…#item) page.';
/** Gear pages list many items: point at the #item anchor. */
export const GEAR_HINT = ' Open a goods-and-services page (/equipment/goods-and-services/…) and copy the link with the #item anchor, e.g. …/hunting-camping-survival-gear/#bedroll.';
