import { describe, expect, it } from "vitest";
import { formatBaht } from "./money";
import {
  displayedListPrice,
  displayedPurchaseDate,
  isValidPurchaseMoney,
  purchaseDiscount,
} from "./purchase-money";

describe("purchaseDiscount", () => {
  it("500 list 450 paid => 50", () => {
    expect(purchaseDiscount(500, 450)).toBe(50);
    expect(formatBaht(purchaseDiscount(500, 450))).toBe("50.00");
  });

  it("400 list 400 paid => 0", () => {
    expect(purchaseDiscount(400, 400)).toBe(0);
  });
});

describe("isValidPurchaseMoney", () => {
  it("allows paid equal to list", () => {
    expect(isValidPurchaseMoney(400, 400)).toBe(true);
  });

  it("allows paid below list", () => {
    expect(isValidPurchaseMoney(500, 450)).toBe(true);
  });

  it("rejects paid above list", () => {
    expect(isValidPurchaseMoney(400, 450)).toBe(false);
  });

  it("rejects non-positive amounts", () => {
    expect(isValidPurchaseMoney(0, 100)).toBe(false);
    expect(isValidPurchaseMoney(100, 0)).toBe(false);
  });
});

describe("legacy display", () => {
  it("uses amount paid when list price is missing", () => {
    expect(displayedListPrice(null, 400)).toBe(400);
    expect(purchaseDiscount(displayedListPrice(null, 400), 400)).toBe(0);
  });

  it("uses created_at date when purchased_at is missing", () => {
    expect(
      displayedPurchaseDate(null, "2026-09-01T10:00:00.000Z"),
    ).toBe("2026-09-01");
    expect(displayedPurchaseDate("2026-09-08", "2026-09-01T10:00:00.000Z")).toBe(
      "2026-09-08",
    );
  });
});
