import { describe, expect, it } from "vitest";
import {
  purchaseFormLoadError,
  sourceChoicesForForm,
  unresolvedPurchaseSourceMessage,
  unitsForPurchaseForm,
} from "./purchase-load";

describe("unitsForPurchaseForm", () => {
  it("keeps units when purchase history fails to load", () => {
    const units = [
      { id: "g" },
      { id: "ml" },
      { id: "piece" },
    ];
    expect(
      unitsForPurchaseForm({ rows: units, failed: false }),
    ).toEqual(units);
  });

  it("returns no units only when the units query itself failed", () => {
    expect(
      unitsForPurchaseForm({
        rows: [{ id: "g" }],
        failed: true,
      }),
    ).toEqual([]);
  });
});

describe("sourceChoicesForForm", () => {
  it("uses builtin names when the database returned no sources", () => {
    expect(sourceChoicesForForm([])).toEqual([
      { id: "Makro", name: "Makro" },
      { id: "ตลาด", name: "ตลาด" },
      { id: "Shopee", name: "Shopee" },
      { id: "TikTok", name: "TikTok" },
    ]);
  });

  it("uses database rows when they exist", () => {
    const rows = [{ id: "uuid-1", name: "Makro" }];
    expect(sourceChoicesForForm(rows)).toEqual(rows);
  });
});

describe("unresolvedPurchaseSourceMessage", () => {
  it("does not ask for date and source when the user already chose a source", () => {
    expect(unresolvedPurchaseSourceMessage(true)).toBe(
      "บันทึกไม่สำเร็จ ถ้าเพิ่งอัปเดต ให้รันไฟล์ SQL คลังซื้อเข้าใน Supabase",
    );
  });

  it("asks for source only when none was chosen", () => {
    expect(unresolvedPurchaseSourceMessage(false)).toBe(
      "กรอกวันที่ซื้อและแหล่งซื้อ",
    );
  });
});

describe("purchaseFormLoadError", () => {
  it("still explains history failure without blocking unit catalog", () => {
    expect(
      purchaseFormLoadError({ unitsFailed: false, historyFailed: true }),
    ).toBe(
      "โหลดประวัติซื้อไม่สำเร็จ ถ้าเพิ่งอัปเดต ให้รันไฟล์ SQL คลังซื้อเข้าใน Supabase",
    );
  });
});
