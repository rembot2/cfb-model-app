export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

export function mean(values: number[]): number {
  const clean = values.filter(value => Number.isFinite(value));
  if (!clean.length) return 0;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

export function median(values: number[]): number {
  const clean = values
    .filter(value => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!clean.length) return 0;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
}

export function normalizeRate(value: number | null | undefined): number {
  let n = Number(value);
  if (!Number.isFinite(n)) return 0.5;
  if (n > 1) n /= 100;
  return Math.max(0.2, Math.min(0.8, n));
}
