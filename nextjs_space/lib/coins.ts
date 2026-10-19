// Coin display helpers for the Loot tab and loot toasts.
// Coins are stored as copper (Campaign.partyCp); display intentionally breaks out
// platinum (1 pp = 10 gp = 1000 cp).
export function breakdownCoins(cp: number): { pp: number; gp: number; sp: number; cp: number } {
  const pp = Math.floor(cp / 1000);
  const r1 = cp % 1000;
  const gp = Math.floor(r1 / 100);
  const r2 = r1 % 100;
  const sp = Math.floor(r2 / 10);
  const c = r2 % 10;
  return { pp, gp, sp, cp: c };
}

export function formatCoins(cp: number): string {
  const { pp, gp, sp, cp: c } = breakdownCoins(cp);
  const parts: string[] = [];
  if (pp) parts.push(`${pp} pp`);
  if (gp) parts.push(`${gp} gp`);
  if (sp) parts.push(`${sp} sp`);
  if (c || parts.length === 0) parts.push(`${c} cp`);
  return parts.join(', ');
}
