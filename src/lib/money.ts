export function roundHalfUp(value: number, digits = 2): number {
  if (value < 0) {
    return -roundHalfUp(-value, digits);
  }
  const factor = 10 ** digits;
  return Math.floor(Number((value * factor).toPrecision(12)) + 0.5) / factor;
}

export function formatBaht(value: number): string {
  return roundHalfUp(value).toFixed(2);
}
