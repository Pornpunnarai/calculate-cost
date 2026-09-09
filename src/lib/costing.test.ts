import { describe, expect, it } from "vitest";
import { formatBaht } from "./money";
import {
  channelProfit,
  lineCost,
  productCost,
  unitCost,
} from "./costing";

const matcha = { purchasePrice: 350, purchaseQuantity: 100 };

describe("unitCost", () => {
  it("is purchase price divided by purchase quantity", () => {
    expect(unitCost(matcha)).toBe(3.5);
  });
});

describe("lineCost", () => {
  it("Matcha 100g/350 used 3g costs 10.50", () => {
    expect(formatBaht(lineCost(matcha, 3))).toBe("10.50");
  });
});

describe("productCost", () => {
  it("sums multiple lines without rounding each line first", () => {
    const milk = { purchasePrice: 70, purchaseQuantity: 1000 };
    const syrup = { purchasePrice: 80, purchaseQuantity: 750 };
    const cost = productCost([
      { ingredient: matcha, quantity: 3 },
      { ingredient: milk, quantity: 150 },
      { ingredient: syrup, quantity: 10 },
    ]);
    expect(formatBaht(cost)).toBe("22.07");
  });

  it("is 0 when the recipe is empty", () => {
    expect(productCost([])).toBe(0);
  });

  it("updates when purchase price changes", () => {
    const before = productCost([{ ingredient: matcha, quantity: 3 }]);
    const after = productCost([
      { ingredient: { purchasePrice: 400, purchaseQuantity: 100 }, quantity: 3 },
    ]);
    expect(before).not.toBe(after);
    expect(formatBaht(after)).toBe("12.00");
  });
});

describe("channelProfit", () => {
  it("returns null when selling price is missing", () => {
    expect(channelProfit(null, 25, 12)).toBeNull();
  });

  it("sell 80 GP 12% cost 25 => fee 9.60 received 70.40 profit 45.40", () => {
    const result = channelProfit(80, 25, 12);
    expect(result).not.toBeNull();
    expect(formatBaht(result!.channelFee)).toBe("9.60");
    expect(formatBaht(result!.netReceived)).toBe("70.40");
    expect(formatBaht(result!.netProfit)).toBe("45.40");
  });

  it("sell 2 × 80 GP 12% cost 25 => received 140.80 profit 90.80", () => {
    const result = channelProfit(80 * 2, 25 * 2, 12);
    expect(result).not.toBeNull();
    expect(formatBaht(result!.netReceived)).toBe("140.80");
    expect(formatBaht(result!.netProfit)).toBe("90.80");
  });

  it("GP 0% received equals selling price", () => {
    const result = channelProfit(80, 25, 0);
    expect(result).not.toBeNull();
    expect(formatBaht(result!.channelFee)).toBe("0.00");
    expect(formatBaht(result!.netReceived)).toBe("80.00");
    expect(formatBaht(result!.netProfit)).toBe("55.00");
  });
});
