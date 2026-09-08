import { describe, expect, it } from "vitest";
import {
  canChangeIngredientUnit,
  canCreateProduct,
  canDeleteIngredient,
  canDeleteUnit,
  isPositiveNumber,
  isValidFeePercent,
  parseOptionalSellingPrice,
  parsePositiveQuantity,
} from "./validation";

describe("isPositiveNumber", () => {
  it("rejects 0 and negatives", () => {
    expect(isPositiveNumber(0)).toBe(false);
    expect(isPositiveNumber(-1)).toBe(false);
    expect(isPositiveNumber(0.01)).toBe(true);
  });
});

describe("isValidFeePercent", () => {
  it("allows 0 and 100 inclusive", () => {
    expect(isValidFeePercent(0)).toBe(true);
    expect(isValidFeePercent(12)).toBe(true);
    expect(isValidFeePercent(100)).toBe(true);
    expect(isValidFeePercent(-1)).toBe(false);
    expect(isValidFeePercent(101)).toBe(false);
  });
});

describe("parseOptionalSellingPrice", () => {
  it("empty means not set yet", () => {
    expect(parseOptionalSellingPrice("")).toEqual({ ok: true, value: null });
    expect(parseOptionalSellingPrice("   ")).toEqual({ ok: true, value: null });
  });

  it("rejects zero and negative", () => {
    expect(parseOptionalSellingPrice("0")).toEqual({ ok: false });
    expect(parseOptionalSellingPrice("-5")).toEqual({ ok: false });
  });

  it("accepts 80", () => {
    expect(parseOptionalSellingPrice("80")).toEqual({ ok: true, value: 80 });
  });
});

describe("delete and create rules", () => {
  it("cannot delete builtin units", () => {
    expect(canDeleteUnit(true, 0)).toBe(false);
  });

  it("cannot delete a unit still used by ingredients", () => {
    expect(canDeleteUnit(false, 1)).toBe(false);
    expect(canDeleteUnit(false, 0)).toBe(true);
  });

  it("cannot delete an ingredient used by a product", () => {
    expect(canDeleteIngredient(1)).toBe(false);
    expect(canDeleteIngredient(0)).toBe(true);
  });

  it("cannot create a product with zero ingredients in the catalog", () => {
    expect(canCreateProduct(0)).toBe(false);
    expect(canCreateProduct(10)).toBe(true);
  });

  it("cannot change ingredient unit when a product uses it", () => {
    expect(canChangeIngredientUnit(1)).toBe(false);
    expect(canChangeIngredientUnit(0)).toBe(true);
  });
});

describe("parsePositiveQuantity", () => {
  it("parses 3 g usage", () => {
    expect(parsePositiveQuantity("3")).toBe(3);
    expect(parsePositiveQuantity("0")).toBeNull();
    expect(parsePositiveQuantity("")).toBeNull();
  });
});
