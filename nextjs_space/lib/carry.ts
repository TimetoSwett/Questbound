// Medium biped carrying capacity, Pathfinder 1e. Scores above 20 repeat the
// table four times heavier for every 10 Strength.
const LIGHT = [0, 3, 6, 10, 13, 16, 20, 23, 26, 30, 33, 38, 43, 50, 58, 66, 76, 86, 100, 116, 133];
const HEAVY = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 115, 130, 150, 175, 200, 230, 260, 300, 350, 400];
const SIZE_FACTOR: Record<string, number> = {
  Fine: 1 / 8, Diminutive: 1 / 4, Tiny: 1 / 2, Small: 3 / 4, Medium: 1, Large: 2, Huge: 4, Gargantuan: 8, Colossal: 16,
};

function baseLimits(score: number): { light: number; medium: number; heavy: number } {
  const str = Math.max(0, Math.floor(score));
  if (str <= 20) return { light: LIGHT[str] ?? 0, medium: (LIGHT[str] ?? 0) * 2, heavy: HEAVY[str] ?? 0 };
  const steps = Math.floor((str - 1) / 10) - 1;
  const lower = baseLimits(str - steps * 10);
  const factor = 4 ** steps;
  return { light: lower.light * factor, medium: lower.medium * factor, heavy: lower.heavy * factor };
}

export function carryLimits(strength: number, size = 'Medium') {
  const factor = SIZE_FACTOR[size] ?? 1;
  const base = baseLimits(strength);
  const round = (value: number) => Math.floor(value * factor);
  return { light: round(base.light), medium: round(base.medium), heavy: round(base.heavy) };
}

export function loadBracket(weight: number, limits: { light: number; medium: number; heavy: number }) {
  if (weight <= limits.light) return 'Light';
  if (weight <= limits.medium) return 'Medium';
  if (weight <= limits.heavy) return 'Heavy';
  return 'Over';
}
