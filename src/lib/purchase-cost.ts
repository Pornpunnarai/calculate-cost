import type { IngredientCostInput } from "./costing";

export type PurchaseRound = {
  amountPaid: number;
  quantity: number;
};

export function roundUnitCost(round: PurchaseRound): number {
  return round.amountPaid / round.quantity;
}

export function averagePurchaseUnitCost(
  rounds: PurchaseRound[],
): number | null {
  if (rounds.length === 0) {
    return null;
  }
  const sum = rounds.reduce((total, round) => total + roundUnitCost(round), 0);
  return sum / rounds.length;
}

export function effectiveCostInput(
  pack: IngredientCostInput,
  rounds: PurchaseRound[],
): IngredientCostInput {
  const average = averagePurchaseUnitCost(rounds);
  if (average === null) {
    return pack;
  }
  return { purchasePrice: average, purchaseQuantity: 1 };
}
