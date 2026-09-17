// Replay sort and remaining_after/unit_cost_after must match
// rebuild_stock_purchases in supabase/migrations/20260917100000_purchase_row_edit.sql.
export type PurchaseRevisionRound = {
  id: string;
  quantity: number;
  amountPaid: number;
  purchasedAt: string | null;
  createdAt: string;
};

export type ReplayedPurchaseRound = {
  id: string;
  remainingAfter: number;
  unitCostAfter: number;
};

export function soldQuantity(
  totalPurchased: number,
  remaining: number,
): number {
  return totalPurchased - remaining;
}

export function remainingAfterChange(
  newTotalPurchased: number,
  sold: number,
): number {
  return newTotalPurchased - sold;
}

export function canApplyPurchaseChange(newRemaining: number): boolean {
  return newRemaining >= 0;
}

export function sortPurchaseRounds(
  rounds: PurchaseRevisionRound[],
): PurchaseRevisionRound[] {
  return [...rounds].sort((left, right) => {
    const leftDate = left.purchasedAt ?? left.createdAt.slice(0, 10);
    const rightDate = right.purchasedAt ?? right.createdAt.slice(0, 10);
    if (leftDate !== rightDate) {
      return leftDate < rightDate ? -1 : 1;
    }
    if (left.createdAt !== right.createdAt) {
      return left.createdAt < right.createdAt ? -1 : 1;
    }
    return left.id < right.id ? -1 : 1;
  });
}

export function replayPurchaseRounds(
  rounds: PurchaseRevisionRound[],
): ReplayedPurchaseRound[] {
  const sorted = sortPurchaseRounds(rounds);
  let quantitySum = 0;
  const unitCosts: number[] = [];
  return sorted.map((round) => {
    quantitySum += round.quantity;
    unitCosts.push(round.amountPaid / round.quantity);
    const mean =
      unitCosts.reduce((sum, unitCost) => sum + unitCost, 0) / unitCosts.length;
    return {
      id: round.id,
      remainingAfter: quantitySum,
      unitCostAfter: mean,
    };
  });
}
