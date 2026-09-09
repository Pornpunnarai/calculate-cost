"use client";

import { useEffect, useState } from "react";
import { ErrorBanner } from "@/components/error-banner";
import { unitCost } from "@/lib/costing";
import { formatBaht } from "@/lib/money";
import { effectiveCostInput, type PurchaseRound } from "@/lib/purchase-cost";
import { asNumber, asOne, createBrowserClient } from "@/lib/supabase/client";
import type { Ingredient, StockPurchase, Unit } from "@/lib/types";

type IngredientRow = Ingredient & { unit: Unit };

function groupPurchasesByIngredient(
  rows: StockPurchase[],
): Record<string, PurchaseRound[]> {
  const grouped: Record<string, PurchaseRound[]> = {};
  for (const row of rows) {
    const rounds = grouped[row.ingredient_id] ?? [];
    rounds.push({
      amountPaid: asNumber(row.amount_paid),
      quantity: asNumber(row.quantity),
    });
    grouped[row.ingredient_id] = rounds;
  }
  return grouped;
}

export default function IngredientsPage() {
  const [items, setItems] = useState<IngredientRow[]>([]);
  const [purchasesByIngredient, setPurchasesByIngredient] = useState<
    Record<string, PurchaseRound[]>
  >({});
  const [error, setError] = useState("");
  const [purchaseWarning, setPurchaseWarning] = useState("");

  async function load() {
    setError("");
    setPurchaseWarning("");
    try {
      const supabase = createBrowserClient();
      const [ingredientsRes, purchasesRes] = await Promise.all([
        supabase
          .from("ingredients")
          .select("*, unit:units(*)")
          .order("created_at"),
        supabase.from("stock_purchases").select("*"),
      ]);
      if (ingredientsRes.error) {
        setError("โหลดวัตถุดิบไม่สำเร็จ");
        return;
      }
      if (purchasesRes.error) {
        setPurchaseWarning("โหลดประวัติซื้อไม่ได้ ต้นทุนที่แสดงใช้แพ็กตั้งต้น");
      }
      setPurchasesByIngredient(
        groupPurchasesByIngredient(
          purchasesRes.error
            ? []
            : ((purchasesRes.data ?? []) as StockPurchase[]),
        ),
      );
      setItems(
        (ingredientsRes.data ?? []).flatMap((row) => {
          const unit = asOne<Unit>(row.unit as Unit | Unit[] | null);
          if (!unit) {
            return [];
          }
          return [
            {
              ...row,
              unit,
              purchase_quantity: asNumber(row.purchase_quantity),
              purchase_price: asNumber(row.purchase_price),
              remaining_quantity: asNumber(row.remaining_quantity ?? 0),
            } as IngredientRow,
          ];
        }),
      );
    } catch {
      setError("โหลดวัตถุดิบไม่สำเร็จ");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <section>
      <h1>วัตถุดิบ</h1>
      <p className="muted">ซื้อเข้าก่อน แล้วค่อยมาดูคลังและสร้างเมนู</p>
      {error ? <ErrorBanner message={error} /> : null}
      {purchaseWarning ? <ErrorBanner message={purchaseWarning} /> : null}
      <table>
        <thead>
          <tr>
            <th>ชื่อ</th>
            <th>หน่วย</th>
            <th>คงเหลือ</th>
            <th>ต้นทุนต่อหน่วย</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.name}</td>
              <td>
                {item.unit.name} ({item.unit.symbol})
              </td>
              <td>
                {item.remaining_quantity} {item.unit.symbol}
              </td>
              <td>
                {formatBaht(
                  unitCost(
                    effectiveCostInput(
                      {
                        purchasePrice: item.purchase_price,
                        purchaseQuantity: item.purchase_quantity,
                      },
                      purchasesByIngredient[item.id] ?? [],
                    ),
                  ),
                )}{" "}
                บาท/{item.unit.symbol}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
