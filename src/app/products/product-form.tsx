"use client";

import { useMemo, useState } from "react";
import { ErrorBanner } from "@/components/error-banner";
import { channelProfit, lineCost, productCost } from "@/lib/costing";
import { formatBaht } from "@/lib/money";
import { asNumber, createBrowserClient } from "@/lib/supabase/client";
import type { Ingredient, Product, ProductIngredient, SalesChannel, Unit } from "@/lib/types";
import { parseOptionalSellingPrice, parsePositiveQuantity } from "@/lib/validation";

type IngredientRow = Ingredient & { unit: Unit };

type RecipeLine = {
  ingredientId: string;
  quantity: string;
};

export function ProductForm({
  ingredients,
  channels,
  existing,
  existingLines,
  onSaved,
  onCancel,
}: {
  ingredients: IngredientRow[];
  channels: SalesChannel[];
  existing: Product | null;
  existingLines: ProductIngredient[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [lines, setLines] = useState<RecipeLine[]>(
    existingLines.map((line) => ({
      ingredientId: line.ingredient_id,
      quantity: String(asNumber(line.quantity)),
    })),
  );
  const [sellingPriceRaw, setSellingPriceRaw] = useState(
    existing?.selling_price == null ? "" : String(existing.selling_price),
  );
  const [error, setError] = useState("");

  const selectedIds = new Set(lines.map((line) => line.ingredientId));

  const cost = useMemo(() => {
    const parsed = lines.flatMap((line) => {
      const ingredient = ingredients.find((item) => item.id === line.ingredientId);
      const quantity = parsePositiveQuantity(line.quantity);
      if (!ingredient || quantity == null) {
        return [];
      }
      return [
        {
          ingredient: {
            purchasePrice: ingredient.purchase_price,
            purchaseQuantity: ingredient.purchase_quantity,
          },
          quantity,
          ingredientId: ingredient.id,
          ingredientRow: ingredient,
        },
      ];
    });
    return {
      total: productCost(parsed),
      breakdown: parsed.map((line) => ({
        ingredientId: line.ingredientId,
        name: line.ingredientRow.name,
        unit: line.ingredientRow.unit.symbol,
        quantity: line.quantity,
        cost: lineCost(line.ingredient, line.quantity),
      })),
    };
  }, [ingredients, lines]);

  const selling = parseOptionalSellingPrice(sellingPriceRaw);
  const profits =
    selling.ok && selling.value !== null
      ? channels.map((channel) => ({
          channel,
          profit: channelProfit(selling.value, cost.total, channel.fee_percent),
        }))
      : [];

  function addLine() {
    const next = ingredients.find((item) => !selectedIds.has(item.id));
    if (!next) {
      return;
    }
    setLines((current) => [...current, { ingredientId: next.id, quantity: "" }]);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("กรอกชื่อเมนู");
      return;
    }
    const parsedPrice = parseOptionalSellingPrice(sellingPriceRaw);
    if (!parsedPrice.ok) {
      setError("ราคาขายต้องมากกว่า 0 หรือเว้นว่างถ้ายังไม่ตั้งราคา");
      return;
    }
    for (const line of lines) {
      if (parsePositiveQuantity(line.quantity) == null) {
        setError("ปริมาณในสูตรต้องมากกว่า 0");
        return;
      }
    }
    const supabase = createBrowserClient();
    let productId = existing?.id;
    if (productId) {
      const { error: updateError } = await supabase
        .from("products")
        .update({
          name: name.trim(),
          selling_price: parsedPrice.value,
          updated_at: new Date().toISOString(),
        })
        .eq("id", productId);
      if (updateError) {
        setError("บันทึกไม่สำเร็จ");
        return;
      }
      const { error: deleteLinesError } = await supabase
        .from("product_ingredients")
        .delete()
        .eq("product_id", productId);
      if (deleteLinesError) {
        setError("บันทึกไม่สำเร็จ");
        return;
      }
    } else {
      const { data, error: insertError } = await supabase
        .from("products")
        .insert({
          name: name.trim(),
          selling_price: parsedPrice.value,
        })
        .select("id")
        .single();
      if (insertError || !data) {
        setError("บันทึกไม่สำเร็จ");
        return;
      }
      productId = data.id as string;
    }
    if (lines.length > 0) {
      const { error: linesError } = await supabase.from("product_ingredients").insert(
        lines.map((line) => ({
          product_id: productId,
          ingredient_id: line.ingredientId,
          quantity: parsePositiveQuantity(line.quantity),
        })),
      );
      if (linesError) {
        setError("บันทึกไม่สำเร็จ");
        return;
      }
    }
    onSaved();
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)}>
      {error ? <ErrorBanner message={error} /> : null}
      <label htmlFor="product-name">ชื่อเมนู</label>
      <input
        id="product-name"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <h2>วัตถุดิบในสูตร</h2>
      {lines.map((line, index) => {
        const ingredient = ingredients.find((item) => item.id === line.ingredientId);
        return (
          <div key={`${line.ingredientId}-${index}`}>
            <label>วัตถุดิบ</label>
            <select
              value={line.ingredientId}
              onChange={(event) => {
                const ingredientId = event.target.value;
                setLines((current) =>
                  current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, ingredientId } : item,
                  ),
                );
              }}
            >
              {ingredients
                .filter(
                  (item) =>
                    item.id === line.ingredientId || !selectedIds.has(item.id),
                )
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.unit.symbol})
                  </option>
                ))}
            </select>
            <label>ปริมาณที่ใช้ ({ingredient?.unit.symbol ?? ""})</label>
            <input
              inputMode="decimal"
              value={line.quantity}
              onChange={(event) => {
                const quantity = event.target.value;
                setLines((current) =>
                  current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, quantity } : item,
                  ),
                );
              }}
            />
            <button
              type="button"
              onClick={() =>
                setLines((current) => current.filter((_, itemIndex) => itemIndex !== index))
              }
            >
              เอาออก
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={addLine}
        disabled={selectedIds.size >= ingredients.length}
      >
        เพิ่มวัตถุดิบในสูตร
      </button>
      <p className="cost-hero">ต้นทุน {formatBaht(cost.total)} บาท</p>
      <ul>
        {cost.breakdown.map((row) => (
          <li key={row.ingredientId}>
            {row.name} {row.quantity} {row.unit} = {formatBaht(row.cost)} บาท
          </li>
        ))}
      </ul>
      <label htmlFor="selling-price">อยากขายเท่าไหร่</label>
      <input
        id="selling-price"
        inputMode="decimal"
        value={sellingPriceRaw}
        onChange={(event) => setSellingPriceRaw(event.target.value)}
      />
      {!selling.ok ? (
        <p className="muted">ราคาขายต้องมากกว่า 0 หรือเว้นว่าง</p>
      ) : null}
      {profits.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>ช่องทาง</th>
              <th>ค่า GP</th>
              <th>ได้เงินจริง</th>
              <th>กำไรสุทธิ</th>
            </tr>
          </thead>
          <tbody>
            {profits.map(({ channel, profit }) =>
              profit ? (
                <tr key={channel.id}>
                  <td>
                    {channel.name} ({channel.fee_percent}%)
                  </td>
                  <td>{formatBaht(profit.channelFee)}</td>
                  <td>{formatBaht(profit.netReceived)}</td>
                  <td>{formatBaht(profit.netProfit)}</td>
                </tr>
              ) : null,
            )}
          </tbody>
        </table>
      ) : (
        <p className="muted">
          ตั้งราคาขายและเพิ่มช่องทางขายก่อน จึงจะเห็นกำไรสุทธิ
        </p>
      )}
      <button type="submit">บันทึกเมนู</button>
      <button type="button" onClick={onCancel}>
        ยกเลิก
      </button>
    </form>
  );
}
