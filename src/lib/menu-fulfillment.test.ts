import { describe, expect, it } from "vitest";
import { formatBaht } from "./money";
import {
  deliveryCost,
  dineInCost,
  saleNeeds,
  type FulfillmentLine,
} from "./menu-fulfillment";

const drink: FulfillmentLine[] = [
  { ingredientId: "tea", quantity: 3, unitCost: 4 },
  { ingredientId: "cup", quantity: 1, unitCost: 2 },
];
const pack: FulfillmentLine[] = [
  { ingredientId: "bag", quantity: 1, unitCost: 1.5 },
  { ingredientId: "cup", quantity: 1, unitCost: 2 },
];

describe("dineInCost", () => {
  it("sums every drink-menu line including packaging ticks", () => {
    expect(dineInCost(drink)).toBe(14);
  });
});

describe("deliveryCost", () => {
  it("is dine-in plus the selected package set", () => {
    expect(deliveryCost(drink, pack)).toBe(17.5);
    expect(formatBaht(deliveryCost(drink, pack))).toBe("17.50");
  });
});

describe("saleNeeds", () => {
  it("dine-in does not include package-set rows", () => {
    expect(saleNeeds("dine_in", drink, pack, 2)).toEqual([
      { ingredientId: "tea", quantity: 6 },
      { ingredientId: "cup", quantity: 2 },
    ]);
  });

  it("delivery merges the same ingredient from drink and package", () => {
    expect(saleNeeds("delivery", drink, pack, 1)).toEqual([
      { ingredientId: "tea", quantity: 3 },
      { ingredientId: "cup", quantity: 2 },
      { ingredientId: "bag", quantity: 1 },
    ]);
  });
});
