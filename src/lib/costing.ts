export type IngredientCostInput = {
  purchasePrice: number;
  purchaseQuantity: number;
};

export function unitCost(ingredient: IngredientCostInput): number {
  return ingredient.purchasePrice / ingredient.purchaseQuantity;
}

export function lineCost(
  ingredient: IngredientCostInput,
  quantity: number,
): number {
  return unitCost(ingredient) * quantity;
}

export function productCost(
  lines: Array<{ ingredient: IngredientCostInput; quantity: number }>,
): number {
  return lines.reduce(
    (sum, line) => sum + lineCost(line.ingredient, line.quantity),
    0,
  );
}

export type ChannelProfit = {
  channelFee: number;
  netReceived: number;
  netProfit: number;
};

export function channelProfit(
  sellingPrice: number | null,
  productCostValue: number,
  feePercent: number,
): ChannelProfit | null {
  if (sellingPrice === null) {
    return null;
  }
  const channelFee = sellingPrice * (feePercent / 100);
  const netReceived = sellingPrice - channelFee;
  const netProfit = netReceived - productCostValue;
  return { channelFee, netReceived, netProfit };
}

export function profitPercent(
  netProfit: number,
  sellingPrice: number,
): number {
  return netProfit / sellingPrice;
}

export function sellingPriceFromMarginPercent(
  cost: number,
  feePercent: number,
  marginPercent: number,
): number | null {
  if (cost < 0 || feePercent < 0 || marginPercent <= 0) {
    return null;
  }
  const denominator = 1 - feePercent / 100 - marginPercent / 100;
  if (denominator <= 0) {
    return null;
  }
  return cost / denominator;
}

export function sellingPriceFromProfitBaht(
  cost: number,
  feePercent: number,
  targetBaht: number,
): number | null {
  if (cost < 0 || feePercent < 0 || targetBaht <= 0) {
    return null;
  }
  const denominator = 1 - feePercent / 100;
  if (denominator <= 0) {
    return null;
  }
  return (cost + targetBaht) / denominator;
}
