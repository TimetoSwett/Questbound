// Coin display helpers for the Loot tab and loot toasts.
// Coins are stored as copper (Campaign.partyCp); display is always gp/sp/cp —
// never auto-convert into platinum.
export function breakdownCoins(cp: number): { gp: number; sp: number; cp: number } {
  const gp = Math.floor(cp / 100);
  const r = cp % 100;
  const sp = Math.floor(r / 10);
  const c = r % 10;
  return { gp, sp, cp: c };
}

export function formatCoins(cp: number): string {
  const { gp, sp, cp: c } = breakdownCoins(cp);
  const parts: string[] = [];
  if (gp) parts.push(`${gp} gp`);
  if (sp) parts.push(`${sp} sp`);
  if (c || parts.length === 0) parts.push(`${c} cp`);
  return parts.join(', ');
}
