"use client";

import { useEffect, useState } from "react";
import { ErrorBanner } from "@/components/error-banner";
import { unitCost } from "@/lib/costing";
import { formatBaht } from "@/lib/money";
import { effectiveCostInput, type PurchaseRound } from "@/lib/purchase-cost";
import { asNumber, asOne, createBrowserClient } from "@/lib/supabase/client";
import type { Ingredient, StockPurchase, Unit } from "@/lib/types";
import { isPositiveNumber } from "@/lib/validation";

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

export default function PurchasesPage() {
  const [items, setItems] = useState<IngredientRow[]>([]);
  const [purchases, setPurchases] = useState<StockPurchase[]>([]);
  const [purchasesByIngredient, setPurchasesByIngredient] = useState<
    Record<string, PurchaseRound[]>
  >({});
  const [ingredientId, setIngredientId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const supabase = createBrowserClient();
      const [ingredientsRes, purchasesRes] = await Promise.all([
        supabase
          .from("ingredients")
          .select("*, unit:units(*)")
          .order("created_at"),
        supabase
          .from("stock_purchases")
          .select("*")
          .order("created_at", { ascending: false }),
      ]);
      if (ingredientsRes.error || purchasesRes.error) {
        setError("โหลดประวัติซื้อไม่สำเร็จ");
        return;
      }
      const ingredientRows = (ingredientsRes.data ?? []).flatMap((row) => {
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
      });
      setItems(ingredientRows);
      if (!ingredientId && ingredientRows[0]) {
        setIngredientId(ingredientRows[0].id);
      }
      const purchaseRows = ((purchasesRes.data ?? []) as StockPurchase[]).map(
        (row) => ({
          ...row,
          quantity: asNumber(row.quantity),
          amount_paid: asNumber(row.amount_paid),
          remaining_after: asNumber(row.remaining_after),
          unit_cost_after: asNumber(row.unit_cost_after),
        }),
      );
      setPurchases(purchaseRows);
      setPurchasesByIngredient(groupPurchasesByIngredient(purchaseRows));
    } catch {
      setError("โหลดประวัติซื้อไม่สำเร็จ");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const purchaseQuantity = Number(quantity);
      const paid = Number(amountPaid);
      if (
        !ingredientId ||
        !isPositiveNumber(purchaseQuantity) ||
        !isPositiveNumber(paid)
      ) {
        setError("กรอกปริมาณและเงินที่จ่ายให้มากกว่า 0");
        return;
      }
      const supabase = createBrowserClient();
      const { error: rpcError } = await supabase.rpc("record_stock_purchase", {
        p_ingredient_id: ingredientId,
        p_quantity: purchaseQuantity,
        p_amount_paid: paid,
      });
      if (rpcError) {
        setError("บันทึกไม่สำเร็จ");
        return;
      }
      setQuantity("");
      setAmountPaid("");
      await load();
    } catch {
      setError("บันทึกไม่สำเร็จ");
    }
  }

  const selected = items.find((item) => item.id === ingredientId);
  const itemsById = Object.fromEntries(items.map((item) => [item.id, item]));

  return (
    <section>
      <h1>ซื้อเข้า</h1>
      {error ? <ErrorBanner message={error} /> : null}
      <form onSubmit={onSubmit}>
        <label htmlFor="purchase-ingredient">วัตถุดิบ</label>
        <select
          id="purchase-ingredient"
          value={ingredientId}
          onChange={(event) => setIngredientId(event.target.value)}
        >
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        {selected ? (
          <p className="muted">
            คงเหลือ {selected.remaining_quantity} {selected.unit.symbol} · ต้นทุน{" "}
            {formatBaht(
              unitCost(
                effectiveCostInput(
                  {
                    purchasePrice: selected.purchase_price,
                    purchaseQuantity: selected.purchase_quantity,
                  },
                  purchasesByIngredient[selected.id] ?? [],
                ),
              ),
            )}{" "}
            บาท/{selected.unit.symbol}
          </p>
        ) : null}
        <label htmlFor="purchase-qty">ปริมาณที่ซื้อ</label>
        <input
          id="purchase-qty"
          inputMode="decimal"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
        />
        <label htmlFor="purchase-paid">เงินที่จ่าย (บาท)</label>
        <input
          id="purchase-paid"
          inputMode="decimal"
          value={amountPaid}
          onChange={(event) => setAmountPaid(event.target.value)}
        />
        <button type="submit">บันทึกการซื้อ</button>
      </form>
      <table>
        <thead>
          <tr>
            <th>วันเวลา</th>
            <th>วัตถุดิบ</th>
            <th>ปริมาณ</th>
            <th>เงินที่จ่าย</th>
            <th>คงเหลือหลังซื้อ</th>
            <th>ต้นทุนเฉลี่ยหลังซื้อ</th>
          </tr>
        </thead>
        <tbody>
          {purchases.map((row) => {
            const ingredient = itemsById[row.ingredient_id];
            const symbol = ingredient?.unit.symbol ?? "";
            return (
              <tr key={row.id}>
                <td>{new Date(row.created_at).toLocaleString("th-TH")}</td>
                <td>{ingredient?.name ?? "—"}</td>
                <td>
                  {row.quantity} {symbol}
                </td>
                <td>{formatBaht(row.amount_paid)} บาท</td>
                <td>
                  {row.remaining_after} {symbol}
                </td>
                <td>
                  {formatBaht(row.unit_cost_after)} บาท
                  {symbol ? `/${symbol}` : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
