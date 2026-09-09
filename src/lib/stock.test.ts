import { describe, expect, it } from "vitest";
import { formatShortage, stockShortages } from "./stock";

const matchaNeed = {
  ingredientId: "m",
  name: "Matcha A",
  symbol: "g",
  have: 2,
  need: 6,
};

describe("stockShortages", () => {
  it("returns ingredients that do not cover the need", () => {
    const milk = {
      ingredientId: "n",
      name: "นม",
      symbol: "ml",
      have: 500,
      need: 300,
    };
    expect(stockShortages([matchaNeed, milk])).toEqual([matchaNeed]);
  });

  it("is empty when every line has enough", () => {
    expect(
      stockShortages([{ ...matchaNeed, have: 6, need: 6 }]),
    ).toEqual([]);
  });
});

describe("formatShortage", () => {
  it("names the missing amount", () => {
    expect(formatShortage(matchaNeed)).toBe(
      "Matcha A ขาดอีก 4 g (มี 2 g ต้องใช้ 6 g)",
    );
  });
});
