import { describe, expect, it } from "vitest";
import { formatBaht, roundHalfUp } from "./money";

describe("roundHalfUp", () => {
  it("rounds 10.5 to 10.50 scale as 10.5", () => {
    expect(roundHalfUp(10.5)).toBe(10.5);
  });

  it("rounds 1.225 to 1.23", () => {
    expect(roundHalfUp(1.225)).toBe(1.23);
  });

  it("rounds 1.224 to 1.22", () => {
    expect(roundHalfUp(1.224)).toBe(1.22);
  });
});

describe("formatBaht", () => {
  it("formats 10.5 as 10.50", () => {
    expect(formatBaht(10.5)).toBe("10.50");
  });

  it("formats 45.4 as 45.40", () => {
    expect(formatBaht(45.4)).toBe("45.40");
  });
});
