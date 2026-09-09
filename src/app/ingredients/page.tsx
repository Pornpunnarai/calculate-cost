"use client";

import { useEffect, useState } from "react";
import { ErrorBanner } from "@/components/error-banner";
import { unitCost } from "@/lib/costing";
import { formatBaht } from "@/lib/money";
import { effectiveCostInput, type PurchaseRound } from "@/lib/purchase-cost";
import { asNumber, asOne, createBrowserClient } from "@/lib/supabase/client";
import type { Ingredient, StockPurchase, Unit } from "@/lib/types";
import {
  canChangeIngredientUnit,
  canDeleteIngredient,
  isPositiveNumber,
} from "@/lib/validation";

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
  const [units, setUnits] = useState<Unit[]>([]);
  const [items, setItems] = useState<IngredientRow[]>([]);
  const [purchasesByIngredient, setPurchasesByIngredient] = useState<
    Record<string, PurchaseRound[]>
  >({});
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitId, setUnitId] = useState("");
  const [price, setPrice] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [usedIds, setUsedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [purchaseWarning, setPurchaseWarning] = useState("");

  async function load() {
    setError("");
    setPurchaseWarning("");
    try {
      const supabase = createBrowserClient();
      const [unitsRes, ingredientsRes, usedRes, purchasesRes] = await Promise.all([
        supabase.from("units").select("*").order("created_at"),
        supabase
          .from("ingredients")
          .select("*, unit:units(*)")
          .order("created_at"),
        supabase.from("product_ingredients").select("ingredient_id"),
        supabase.from("stock_purchases").select("*"),
      ]);
      if (unitsRes.error || ingredientsRes.error || usedRes.error) {
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
      const unitList = (unitsRes.data ?? []) as Unit[];
      setUnits(unitList);
      if (!unitId && unitList[0]) {
        setUnitId(unitList[0].id);
      }
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
      setUsedIds(
        new Set(
          ((usedRes.data ?? []) as { ingredient_id: string }[]).map(
            (row) => row.ingredient_id,
          ),
        ),
      );
    } catch {
      setError("โหลดวัตถุดิบไม่สำเร็จ");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetForm() {
    setName("");
    setQuantity("");
    setPrice("");
    setEditingId(null);
    if (units[0]) {
      setUnitId(units[0].id);
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const purchaseQuantity = Number(quantity);
      const purchasePrice = Number(price);
      if (!name.trim() || !isPositiveNumber(purchaseQuantity) || !isPositiveNumber(purchasePrice) || !unitId) {
        setError("กรอกชื่อ ปริมาณ และราคาให้มากกว่า 0");
        return;
      }
      const supabase = createBrowserClient();
      if (editingId) {
        const used = usedIds.has(editingId);
        if (!canChangeIngredientUnit(used ? 1 : 0)) {
          const current = items.find((item) => item.id === editingId);
          if (current && current.purchase_unit_id !== unitId) {
            setError("แก้หน่วยไม่ได้ เพราะมีเมนูใช้วัตถุดิบนี้อยู่");
            return;
          }
        }
        const { error: updateError } = await supabase
          .from("ingredients")
          .update({
            name: name.trim(),
            purchase_quantity: purchaseQuantity,
            purchase_unit_id: unitId,
            purchase_price: purchasePrice,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingId);
        if (updateError) {
          setError("บันทึกไม่สำเร็จ");
          return;
        }
      } else {
        const { error: insertError } = await supabase.from("ingredients").insert({
          name: name.trim(),
          purchase_quantity: purchaseQuantity,
          purchase_unit_id: unitId,
          purchase_price: purchasePrice,
        });
        if (insertError) {
          setError("บันทึกไม่สำเร็จ");
          return;
        }
      }
      resetForm();
      await load();
    } catch {
      setError("บันทึกไม่สำเร็จ");
    }
  }

  async function onDelete(item: IngredientRow) {
    setError("");
    try {
      const supabase = createBrowserClient();
      const { count, error: countError } = await supabase
        .from("product_ingredients")
        .select("id", { count: "exact", head: true })
        .eq("ingredient_id", item.id);
      if (countError) {
        setError("ลบไม่สำเร็จ");
        return;
      }
      if (!canDeleteIngredient(count ?? 0)) {
        setError("ลบไม่ได้ เพราะมีเมนูใช้วัตถุดิบนี้อยู่");
        return;
      }
      const { error: deleteError } = await supabase
        .from("ingredients")
        .delete()
        .eq("id", item.id);
      if (deleteError) {
        setError(
          deleteError.code === "23503"
            ? "ลบไม่ได้ เพราะมีประวัติการซื้อวัตถุดิบนี้อยู่"
            : "ลบไม่สำเร็จ",
        );
        return;
      }
      if (editingId === item.id) {
        resetForm();
      }
      await load();
    } catch {
      setError("ลบไม่สำเร็จ");
    }
  }

  function startEdit(item: IngredientRow) {
    setEditingId(item.id);
    setName(item.name);
    setQuantity(String(item.purchase_quantity));
    setPrice(String(item.purchase_price));
    setUnitId(item.purchase_unit_id);
  }

  const unitLocked = editingId ? usedIds.has(editingId) : false;

  return (
    <section>
      <h1>วัตถุดิบ</h1>
      <p className="muted">เพิ่มของที่ซื้อมาให้ครบก่อน แล้วค่อยไปสร้างเมนู</p>
      {error ? <ErrorBanner message={error} /> : null}
      {purchaseWarning ? <ErrorBanner message={purchaseWarning} /> : null}
      <form onSubmit={onSubmit}>
        <label htmlFor="ing-name">ชื่อ</label>
        <input
          id="ing-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <label htmlFor="ing-qty">ปริมาณที่ซื้อ</label>
        <input
          id="ing-qty"
          inputMode="decimal"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
        />
        <label htmlFor="ing-unit">หน่วย</label>
        <select
          id="ing-unit"
          value={unitId}
          disabled={unitLocked}
          onChange={(event) => setUnitId(event.target.value)}
        >
          {units.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name} ({unit.symbol})
            </option>
          ))}
        </select>
        <label htmlFor="ing-price">ราคาแพ็ก (บาท)</label>
        <input
          id="ing-price"
          inputMode="decimal"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
        />
        <button type="submit">{editingId ? "บันทึกการแก้" : "เพิ่มวัตถุดิบ"}</button>
        {editingId ? (
          <button type="button" onClick={resetForm}>
            ยกเลิก
          </button>
        ) : null}
      </form>
      <table>
        <thead>
          <tr>
            <th>ชื่อ</th>
            <th>แพ็กที่ซื้อ</th>
            <th>คงเหลือ</th>
            <th>ต้นทุนต่อหน่วย</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.name}</td>
              <td>
                {item.purchase_quantity} {item.unit.symbol} / {formatBaht(item.purchase_price)} บาท
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
              <td>
                <button type="button" onClick={() => startEdit(item)}>
                  แก้
                </button>
                <button type="button" onClick={() => void onDelete(item)}>
                  ลบ
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
