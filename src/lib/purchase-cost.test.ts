import { describe, expect, it } from "vitest";
import { formatBaht } from "./money";
import { lineCost } from "./costing";
import {
  averagePurchaseUnitCost,
  effectiveCostInput,
  roundUnitCost,
} from "./purchase-cost";

describe("roundUnitCost", () => {
  it("100g 400 = 4", () => {
    expect(roundUnitCost({ amountPaid: 400, quantity: 100 })).toBe(4);
  });

  it("50g 300 = 6", () => {
    expect(roundUnitCost({ amountPaid: 300, quantity: 50 })).toBe(6);
  });
});

describe("averagePurchaseUnitCost", () => {
  it("is null with no purchases", () => {
    expect(averagePurchaseUnitCost([])).toBeNull();
  });

  it("averages three rounds equally (4 + 4.5 + 6) / 3", () => {
    const avg = averagePurchaseUnitCost([
      { amountPaid: 400, quantity: 100 },
      { amountPaid: 450, quantity: 100 },
      { amountPaid: 300, quantity: 50 },
    ]);
    expect(avg).not.toBeNull();
    expect(formatBaht(avg!)).toBe("4.83");
  });
});

describe("effectiveCostInput", () => {
  const pack = { purchasePrice: 350, purchaseQuantity: 100 };

  it("uses the pack when there are no purchases", () => {
    expect(effectiveCostInput(pack, [])).toEqual(pack);
  });

  it("uses average unit cost for recipe costing after purchases", () => {
    const input = effectiveCostInput(pack, [
      { amountPaid: 400, quantity: 100 },
      { amountPaid: 450, quantity: 100 },
      { amountPaid: 300, quantity: 50 },
    ]);
    expect(formatBaht(lineCost(input, 3))).toBe("14.50");
  });
});
