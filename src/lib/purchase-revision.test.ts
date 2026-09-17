import { describe, expect, it } from "vitest";
import { formatBaht } from "./money";
import {
  canApplyPurchaseChange,
  remainingAfterChange,
  replayPurchaseRounds,
  soldQuantity,
  sortPurchaseRounds,
  type PurchaseRevisionRound,
} from "./purchase-revision";

function round(
  id: string,
  quantity: number,
  amountPaid: number,
  purchasedAt: string,
  createdAt: string,
): PurchaseRevisionRound {
  return { id, quantity, amountPaid, purchasedAt, createdAt };
}

describe("soldQuantity", () => {
  it("is total purchased minus remaining", () => {
    expect(soldQuantity(200, 50)).toBe(150);
  });
});

describe("remainingAfterChange", () => {
  it("blocks deleting 100g when 150g was sold and 50 remains", () => {
    const sold = soldQuantity(200, 50);
    const next = remainingAfterChange(100, sold);
    expect(next).toBe(-50);
    expect(canApplyPurchaseChange(next)).toBe(false);
  });

  it("allows deleting a round that does not eat sold stock", () => {
    const sold = soldQuantity(200, 150);
    const next = remainingAfterChange(100, sold);
    expect(next).toBe(50);
    expect(canApplyPurchaseChange(next)).toBe(true);
  });
});

describe("sortPurchaseRounds", () => {
  it("sorts unsorted rounds by purchased date, created_at, then id", () => {
    const sorted = sortPurchaseRounds([
      round("c", 10, 40, "2026-09-02", "2026-09-02T11:00:00Z"),
      round("a", 10, 40, "2026-09-01", "2026-09-01T10:00:00Z"),
      round("b", 10, 40, "2026-09-02", "2026-09-02T10:00:00Z"),
    ]);
    expect(sorted.map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("falls back to createdAt date when purchasedAt is null", () => {
    const sorted = sortPurchaseRounds([
      {
        id: "later",
        quantity: 10,
        amountPaid: 40,
        purchasedAt: null,
        createdAt: "2026-09-03T08:00:00Z",
      },
      {
        id: "earlier",
        quantity: 10,
        amountPaid: 40,
        purchasedAt: "2026-09-01",
        createdAt: "2026-09-04T08:00:00Z",
      },
    ]);
    expect(sorted.map((item) => item.id)).toEqual(["earlier", "later"]);
  });
});

describe("replayPurchaseRounds", () => {
  it("recomputes equal-weight mean after changing the second payment to 500", () => {
    const after = replayPurchaseRounds([
      round("a", 100, 400, "2026-09-01", "2026-09-01T10:00:00Z"),
      round("b", 100, 500, "2026-09-02", "2026-09-02T10:00:00Z"),
    ]);
    expect(after[0]).toEqual({
      id: "a",
      remainingAfter: 100,
      unitCostAfter: 4,
    });
    expect(after[1].id).toBe("b");
    expect(after[1].remainingAfter).toBe(200);
    expect(after[1].unitCostAfter).toBe(4.5);
    expect(formatBaht(after[1].unitCostAfter)).toBe("4.50");
  });

  it("replays remaining rounds after deleting the first unused round", () => {
    const after = replayPurchaseRounds([
      round("b", 100, 450, "2026-09-02", "2026-09-02T10:00:00Z"),
    ]);
    expect(after).toEqual([
      { id: "b", remainingAfter: 100, unitCostAfter: 4.5 },
    ]);
  });
});
