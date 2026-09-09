import { isPositiveNumber } from "./validation";

export function purchaseDiscount(listPrice: number, amountPaid: number): number {
  return listPrice - amountPaid;
}

export function isValidPurchaseMoney(
  listPrice: number,
  amountPaid: number,
): boolean {
  return (
    isPositiveNumber(listPrice) &&
    isPositiveNumber(amountPaid) &&
    amountPaid <= listPrice
  );
}

export function displayedListPrice(
  listPrice: number | null,
  amountPaid: number,
): number {
  return listPrice ?? amountPaid;
}

export function displayedPurchaseDate(
  purchasedAt: string | null,
  createdAt: string,
): string {
  if (purchasedAt) {
    return purchasedAt;
  }
  return createdAt.slice(0, 10);
}
