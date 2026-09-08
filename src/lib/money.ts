export function roundHalfUp(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.floor(value * factor + 0.5) / factor;
}

export function formatBaht(value: number): string {
  return roundHalfUp(value).toFixed(2);
}
