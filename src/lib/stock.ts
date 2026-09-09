export type StockNeed = {
  ingredientId: string;
  name: string;
  symbol: string;
  have: number;
  need: number;
};

export function stockShortages(needs: StockNeed[]): StockNeed[] {
  return needs.filter((item) => item.have < item.need);
}

export function formatShortage(item: StockNeed): string {
  const missing = item.need - item.have;
  return `${item.name} ขาดอีก ${missing} ${item.symbol} (มี ${item.have} ${item.symbol} ต้องใช้ ${item.need} ${item.symbol})`;
}
