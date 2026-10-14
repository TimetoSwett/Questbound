export const HALLS = {
  armory: {
    title: 'Armory',
    path: '/armory',
    blurb: 'Weapons and armor. Nothing is imported in bulk — bring in one piece with an Archives of Nethys link, or write it in by hand.',
    filters: [
      { id: 'weapon', label: 'Weapons', kind: 'weapon' },
      { id: 'armor', label: 'Armor', kind: 'armor', slot: 'armor' },
      { id: 'shield', label: 'Shields', kind: 'armor', slot: 'shield' },
    ],
  },
  shop: {
    title: 'Shop',
    path: '/shop',
    blurb: 'Adventuring gear and wondrous items. Add an item from a link, or write your own.',
    filters: [{ id: 'gear', label: 'Gear', kind: 'gear' }],
  },
  training: {
    title: 'Training Grounds',
    path: '/training',
    blurb: 'Feats and special abilities. Import one from a link, or write your own.',
    filters: [
      { id: 'feat', label: 'Feats', kind: 'feat' },
      { id: 'ability', label: 'Special abilities', kind: 'ability' },
    ],
  },
} as const;

export type HallId = keyof typeof HALLS;
export type HallFilter = (typeof HALLS)[HallId]['filters'][number];

export const HALL_LINKS = [
  { href: '/dashboard', label: 'Campaigns' },
  { href: '/dashboard?view=vault', label: 'Character Vault' },
  { href: '/library', label: 'Library' },
  { href: '/armory', label: 'Armory' },
  { href: '/shop', label: 'Shop' },
  { href: '/training', label: 'Training Grounds' },
] as const;
