export type FulfillmentKind = "dine_in" | "delivery";

export type FulfillmentLine = {
  ingredientId: string;
  quantity: number;
  unitCost: number;
};

export function dineInCost(drinkLines: FulfillmentLine[]): number {
  return drinkLines.reduce(
    (sum, line) => sum + line.unitCost * line.quantity,
    0,
  );
}

export function deliveryCost(
  drinkLines: FulfillmentLine[],
  packageLines: FulfillmentLine[],
): number {
  return dineInCost(drinkLines) + dineInCost(packageLines);
}

export function saleNeeds(
  kind: FulfillmentKind,
  drinkLines: FulfillmentLine[],
  packageLines: FulfillmentLine[],
  soldQty: number,
): Array<{ ingredientId: string; quantity: number }> {
  const source =
    kind === "delivery" ? [...drinkLines, ...packageLines] : drinkLines;
  const merged = new Map<string, number>();
  for (const line of source) {
    merged.set(
      line.ingredientId,
      (merged.get(line.ingredientId) ?? 0) + line.quantity * soldQty,
    );
  }
  return [...merged.entries()].map(([ingredientId, quantity]) => ({
    ingredientId,
    quantity,
  }));
}
