export function isPositiveNumber(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function isValidFeePercent(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

export function parseOptionalSellingPrice(
  raw: string,
): { ok: true; value: number | null } | { ok: false } {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: true, value: null };
  }
  const value = Number(trimmed);
  if (!isPositiveNumber(value)) {
    return { ok: false };
  }
  return { ok: true, value };
}

export function canDeleteUnit(
  isBuiltin: boolean,
  ingredientCountUsingUnit: number,
): boolean {
  return !isBuiltin && ingredientCountUsingUnit === 0;
}

export function canDeleteIngredient(
  productCountUsingIngredient: number,
): boolean {
  return productCountUsingIngredient === 0;
}

export function canCreateProduct(ingredientCount: number): boolean {
  return ingredientCount >= 1;
}

export function canChangeIngredientUnit(
  productCountUsingIngredient: number,
): boolean {
  return productCountUsingIngredient === 0;
}

export function parsePositiveQuantity(raw: string): number | null {
  const value = Number(raw.trim());
  return isPositiveNumber(value) ? value : null;
}
