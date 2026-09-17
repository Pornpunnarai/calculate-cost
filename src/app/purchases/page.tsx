"use client";

import { useEffect, useState } from "react";
import { ErrorBanner } from "@/components/error-banner";
import { formatBaht } from "@/lib/money";
import {
  displayedListPrice,
  displayedPurchaseDate,
  isValidPurchaseMoney,
  purchaseDiscount,
} from "@/lib/purchase-money";
import { asNumber, asOne, createBrowserClient } from "@/lib/supabase/client";
import type {
  Ingredient,
  PurchaseSource,
  StockPurchase,
  Unit,
} from "@/lib/types";
import {
  purchaseFormLoadError,
  sourceChoicesForForm,
  unresolvedPurchaseSourceMessage,
  unitsForPurchaseForm,
} from "@/lib/purchase-load";
import { isPositiveNumber } from "@/lib/validation";

type IngredientRow = Ingredient & { unit: Unit };
type PurchaseRow = StockPurchase & { source: PurchaseSource | null };

function todayIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export default function PurchasesPage() {
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [items, setItems] = useState<IngredientRow[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [sources, setSources] = useState<PurchaseSource[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [ingredientId, setIngredientId] = useState("");
  const [name, setName] = useState("");
  const [unitId, setUnitId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [purchasedAt, setPurchasedAt] = useState(todayIsoDate);
  const [listPrice, setListPrice] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [sourceId, setSourceId] = useState("Makro");
  const [sourceName, setSourceName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPurchasedAt, setEditPurchasedAt] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const [editListPrice, setEditListPrice] = useState("");
  const [editAmountPaid, setEditAmountPaid] = useState("");

  const listPriceNumber = Number(listPrice);
  const paidNumber = Number(amountPaid);
  const discountPreview =
    isValidPurchaseMoney(listPriceNumber, paidNumber)
      ? purchaseDiscount(listPriceNumber, paidNumber)
      : null;

  async function load() {
    setError("");
    try {
      const supabase = createBrowserClient();
      const [ingredientsRes, purchasesRes, unitsRes, sourcesRes] =
        await Promise.all([
          supabase
            .from("ingredients")
            .select("*, unit:units(*)")
            .order("created_at"),
          supabase
            .from("stock_purchases")
            .select("*, source:purchase_sources(*)")
            .order("created_at", { ascending: false }),
          supabase.from("units").select("*").order("created_at"),
          supabase.from("purchase_sources").select("*").order("created_at"),
        ]);
      const unitList = unitsForPurchaseForm({
        rows: (unitsRes.data ?? []) as Unit[],
        failed: Boolean(unitsRes.error),
      });
      setUnits(unitList);
      setUnitId((current) =>
        current && unitList.some((unit) => unit.id === current)
          ? current
          : (unitList[0]?.id ?? ""),
      );

      if (!ingredientsRes.error) {
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
        setIngredientId((current) =>
          current && ingredientRows.some((item) => item.id === current)
            ? current
            : (ingredientRows[0]?.id ?? ""),
        );
      }

      const historyFailed = Boolean(purchasesRes.error || sourcesRes.error);
      setError(
        purchaseFormLoadError({
          unitsFailed: Boolean(unitsRes.error),
          historyFailed,
        }),
      );
      if (historyFailed) {
        const fallback = sourceChoicesForForm([]);
        setSourceId((current) =>
          current && fallback.some((source) => source.id === current)
            ? current
            : (fallback[0]?.id ?? ""),
        );
        return;
      }
      const sourceList = (sourcesRes.data ?? []) as PurchaseSource[];
      setSources(sourceList);
      const sourceChoices = sourceChoicesForForm(sourceList);
      setSourceId((current) =>
        current && sourceChoices.some((source) => source.id === current)
          ? current
          : (sourceChoices[0]?.id ?? ""),
      );
      setPurchases(
        ((purchasesRes.data ?? []) as Array<
          StockPurchase & {
            source: PurchaseSource | PurchaseSource[] | null;
          }
        >).map((row) => ({
          ...row,
          quantity: asNumber(row.quantity),
          amount_paid: asNumber(row.amount_paid),
          remaining_after: asNumber(row.remaining_after),
          unit_cost_after: asNumber(row.unit_cost_after),
          list_price:
            row.list_price == null ? null : asNumber(row.list_price),
          purchased_at: row.purchased_at ?? null,
          purchase_source_id: row.purchase_source_id ?? null,
          source: asOne<PurchaseSource>(row.source),
        })),
      );
    } catch {
      setError("โหลดประวัติซื้อไม่สำเร็จ");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function resolveSourceId(): Promise<string | null> {
    const supabase = createBrowserClient();
    const typed = sourceName.trim() || (!sources.some((source) => source.id === sourceId)
      ? sourceId.trim()
      : "");
    if (typed) {
      const existing = sources.find((source) => source.name === typed);
      if (existing) {
        return existing.id;
      }
      const { data, error: insertError } = await supabase
        .from("purchase_sources")
        .insert({ name: typed })
        .select("id")
        .single();
      if (!insertError && data) {
        return data.id as string;
      }
      const { data: again } = await supabase
        .from("purchase_sources")
        .select("id")
        .eq("name", typed)
        .maybeSingle();
      return again?.id ?? null;
    }
    return sourceId || null;
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) {
      return;
    }
    setError("");
    const qty = Number(quantity);
    if (
      !isPositiveNumber(qty) ||
      !isValidPurchaseMoney(listPriceNumber, paidNumber)
    ) {
      setError(
        "กรอกปริมาณ ราคาเต็ม และเงินที่จ่ายให้มากกว่า 0 และเงินที่จ่ายต้องไม่เกินราคาเต็ม",
      );
      return;
    }
    if (!purchasedAt) {
      setError("กรอกวันที่ซื้อและแหล่งซื้อ");
      return;
    }
    if (mode === "new" && (!name.trim() || !unitId)) {
      setError("กรอกชื่อและหน่วย");
      return;
    }
    if (mode === "existing" && !ingredientId) {
      setError("เลือกวัตถุดิบในคลัง");
      return;
    }
    setSaving(true);
    try {
      const resolvedSourceId = await resolveSourceId();
      if (!resolvedSourceId) {
        setError(
          unresolvedPurchaseSourceMessage(Boolean(sourceName.trim() || sourceId)),
        );
        return;
      }
      const supabase = createBrowserClient();
      const { error: rpcError } = await supabase.rpc("record_stock_purchase", {
        p_ingredient_id: mode === "existing" ? ingredientId : null,
        p_name: mode === "new" ? name.trim() : "",
        p_unit_id: mode === "new" ? unitId : null,
        p_quantity: qty,
        p_amount_paid: paidNumber,
        p_list_price: listPriceNumber,
        p_purchased_at: purchasedAt,
        p_source_id: resolvedSourceId,
      });
      if (rpcError) {
        setError("บันทึกไม่สำเร็จ");
        return;
      }
      setName("");
      setQuantity("");
      setListPrice("");
      setAmountPaid("");
      setSourceName("");
      await load();
    } catch {
      setError("บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(row: PurchaseRow) {
    setError("");
    setEditingId(row.id);
    setEditPurchasedAt(
      displayedPurchaseDate(row.purchased_at, row.created_at),
    );
    setEditQuantity(String(row.quantity));
    setEditListPrice(String(displayedListPrice(row.list_price, row.amount_paid)));
    setEditAmountPaid(String(row.amount_paid));
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(row: PurchaseRow) {
    const qty = Number(editQuantity);
    const list = Number(editListPrice);
    const paid = Number(editAmountPaid);
    if (!editPurchasedAt.trim()) {
      setError("กรอกวันที่ซื้อและแหล่งซื้อ");
      return;
    }
    if (!isPositiveNumber(qty)) {
      setError("ปริมาณต้องมากกว่า 0");
      return;
    }
    if (!isValidPurchaseMoney(list, paid)) {
      setError("กรอกราคาเต็มและเงินที่จ่ายให้ถูกต้อง");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const supabase = createBrowserClient();
      const { data, error: rpcError } = await supabase.rpc(
        "update_stock_purchase",
        {
          p_id: row.id,
          p_purchased_at: editPurchasedAt,
          p_quantity: qty,
          p_amount_paid: paid,
          p_list_price: list,
        },
      );
      if (rpcError) {
        setError("บันทึกไม่สำเร็จ");
        return;
      }
      const payload = data as { ok?: boolean; reason?: string } | null;
      if (payload && payload.ok === false && payload.reason === "shortage") {
        setError("แก้ไม่ได้ คงเหลือจะไม่พอ");
        return;
      }
      if (!payload || payload.ok !== true) {
        setError("บันทึกไม่สำเร็จ");
        return;
      }
      setEditingId(null);
      await load();
    } catch {
      setError("บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function removePurchase(row: PurchaseRow) {
    if (!window.confirm("ลบรอบซื้อนี้?")) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      const supabase = createBrowserClient();
      const { data, error: rpcError } = await supabase.rpc(
        "delete_stock_purchase",
        { p_id: row.id },
      );
      if (rpcError) {
        setError("ลบไม่สำเร็จ");
        return;
      }
      const payload = data as { ok?: boolean; reason?: string } | null;
      if (payload && payload.ok === false && payload.reason === "shortage") {
        setError("ลบไม่ได้ คงเหลือจะไม่พอ");
        return;
      }
      if (!payload || payload.ok !== true) {
        setError("ลบไม่สำเร็จ");
        return;
      }
      if (editingId === row.id) {
        setEditingId(null);
      }
      await load();
    } catch {
      setError("ลบไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  const itemsById = Object.fromEntries(items.map((item) => [item.id, item]));
  const sourceChoices = sourceChoicesForForm(sources);
  const editListNumber = Number(editListPrice);
  const editPaidNumber = Number(editAmountPaid);
  const editDiscount = isValidPurchaseMoney(editListNumber, editPaidNumber)
    ? purchaseDiscount(editListNumber, editPaidNumber)
    : null;

  return (
    <section>
      <h1>ซื้อเข้า</h1>
      {error ? <ErrorBanner message={error} /> : null}
      <form onSubmit={onSubmit}>
        <fieldset>
          <legend>ประเภท</legend>
          <label>
            <input
              type="radio"
              name="purchase-mode"
              checked={mode === "new"}
              onChange={() => setMode("new")}
            />
            ของใหม่
          </label>
          <label>
            <input
              type="radio"
              name="purchase-mode"
              checked={mode === "existing"}
              onChange={() => setMode("existing")}
            />
            ของในคลัง
          </label>
        </fieldset>
        {mode === "new" ? (
          <>
            <label htmlFor="purchase-name">ชื่อ</label>
            <input
              id="purchase-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <label htmlFor="purchase-unit">หน่วย</label>
            <select
              id="purchase-unit"
              value={unitId}
              onChange={(event) => setUnitId(event.target.value)}
              disabled={units.length === 0}
            >
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name} ({unit.symbol})
                </option>
              ))}
            </select>
            {units.length === 0 ? (
              <p className="muted">ยังไม่มีหน่วย ให้ไปเพิ่มที่หน้าหน่วยก่อน</p>
            ) : null}
          </>
        ) : (
          <>
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
          </>
        )}
        <label htmlFor="purchase-qty">ปริมาณที่ซื้อ</label>
        <input
          id="purchase-qty"
          inputMode="decimal"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
        />
        <label htmlFor="purchase-date">วันที่ซื้อ</label>
        <input
          id="purchase-date"
          type="date"
          value={purchasedAt}
          onChange={(event) => setPurchasedAt(event.target.value)}
        />
        <label htmlFor="purchase-list">ราคาเต็ม (บาท)</label>
        <input
          id="purchase-list"
          inputMode="decimal"
          value={listPrice}
          onChange={(event) => setListPrice(event.target.value)}
        />
        <label htmlFor="purchase-paid">เงินที่จ่าย (บาท)</label>
        <input
          id="purchase-paid"
          inputMode="decimal"
          value={amountPaid}
          onChange={(event) => setAmountPaid(event.target.value)}
        />
        <p className="muted">
          ส่วนลด{" "}
          {discountPreview == null ? "—" : `${formatBaht(discountPreview)} บาท`}
        </p>
        <label htmlFor="purchase-source">แหล่งซื้อ</label>
        <select
          id="purchase-source"
          value={sourceId}
          onChange={(event) => setSourceId(event.target.value)}
        >
          {sourceChoices.map((source) => (
            <option key={source.id} value={source.id}>
              {source.name}
            </option>
          ))}
        </select>
        <label htmlFor="purchase-source-new">หรือพิมพ์ร้านใหม่</label>
        <input
          id="purchase-source-new"
          value={sourceName}
          onChange={(event) => setSourceName(event.target.value)}
        />
        <button type="submit" disabled={saving}>
          บันทึกการซื้อ
        </button>
      </form>
      <table>
        <thead>
          <tr>
            <th>วันที่ซื้อ</th>
            <th>วัตถุดิบ</th>
            <th>แหล่งซื้อ</th>
            <th>ปริมาณ</th>
            <th>ราคาเต็ม</th>
            <th>เงินที่จ่าย</th>
            <th>ส่วนลด</th>
            <th>คงเหลือหลังซื้อ</th>
            <th>ต้นทุนเฉลี่ยหลังซื้อ</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {purchases.map((row) => {
            const ingredient = itemsById[row.ingredient_id];
            const symbol = ingredient?.unit.symbol ?? "";
            const shownList = displayedListPrice(
              row.list_price,
              row.amount_paid,
            );
            const isEditing = editingId === row.id;
            return (
              <tr key={row.id}>
                <td>
                  {isEditing ? (
                    <input
                      type="date"
                      value={editPurchasedAt}
                      onChange={(event) =>
                        setEditPurchasedAt(event.target.value)
                      }
                    />
                  ) : (
                    displayedPurchaseDate(row.purchased_at, row.created_at)
                  )}
                </td>
                <td>{ingredient?.name ?? "—"}</td>
                <td>{row.source?.name ?? "—"}</td>
                <td>
                  {isEditing ? (
                    <>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={editQuantity}
                        onChange={(event) =>
                          setEditQuantity(event.target.value)
                        }
                      />{" "}
                      {symbol}
                    </>
                  ) : (
                    <>
                      {row.quantity} {symbol}
                    </>
                  )}
                </td>
                <td>
                  {isEditing ? (
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={editListPrice}
                      onChange={(event) =>
                        setEditListPrice(event.target.value)
                      }
                    />
                  ) : (
                    `${formatBaht(shownList)} บาท`
                  )}
                </td>
                <td>
                  {isEditing ? (
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={editAmountPaid}
                      onChange={(event) =>
                        setEditAmountPaid(event.target.value)
                      }
                    />
                  ) : (
                    `${formatBaht(row.amount_paid)} บาท`
                  )}
                </td>
                <td>
                  {isEditing
                    ? editDiscount == null
                      ? "—"
                      : `${formatBaht(editDiscount)} บาท`
                    : `${formatBaht(purchaseDiscount(shownList, row.amount_paid))} บาท`}
                </td>
                <td>
                  {row.remaining_after} {symbol}
                </td>
                <td>
                  {formatBaht(row.unit_cost_after)} บาท
                  {symbol ? `/${symbol}` : ""}
                </td>
                <td>
                  {isEditing ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void saveEdit(row)}
                        disabled={saving}
                      >
                        บันทึก
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        disabled={saving}
                      >
                        ยกเลิก
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => startEdit(row)}
                        disabled={saving}
                      >
                        แก้ไข
                      </button>
                      <button
                        type="button"
                        onClick={() => void removePurchase(row)}
                        disabled={saving}
                      >
                        ลบ
                      </button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
