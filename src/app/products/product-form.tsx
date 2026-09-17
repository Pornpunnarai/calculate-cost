"use client";

import { useMemo, useRef, useState } from "react";
import { ErrorBanner } from "@/components/error-banner";
import {
  channelProfit,
  lineCost,
  profitPercent,
  sellingPriceFromMarginPercent,
  sellingPriceFromProfitBaht,
  unitCost,
} from "@/lib/costing";
import { deliveryCost, dineInCost, type FulfillmentLine } from "@/lib/menu-fulfillment";
import { formatBaht } from "@/lib/money";
import { effectiveCostInput, type PurchaseRound } from "@/lib/purchase-cost";
import { asNumber, createBrowserClient } from "@/lib/supabase/client";
import type { Ingredient, Product, ProductIngredient, SalesChannel, Unit } from "@/lib/types";
import { parseOptionalSellingPrice, parsePositiveQuantity } from "@/lib/validation";

type IngredientRow = Ingredient & { unit: Unit };

type RecipeLine = {
  ingredientId: string;
  quantity: string;
  isPackaging: boolean;
};

type ProfitMode = "percent" | "baht";

type ProfitTarget = {
  mode: ProfitMode;
  amount: string;
  channelId: string;
  suggestError: string;
};

const SUGGEST_ERROR =
  "กรอกเป้ากำไรให้ถูก หรือตั้งต่ำกว่านี้ เพราะบวก GP แล้วเต็มหรือเกิน 100%";

function emptyProfitTarget(channels: SalesChannel[]): ProfitTarget {
  return {
    mode: "percent",
    amount: "",
    channelId: channels[0]?.id ?? "",
    suggestError: "",
  };
}

function toFulfillmentLines(
  recipeLines: Array<{ ingredientId: string; quantity: string }>,
  ingredients: IngredientRow[],
  purchasesByIngredient: Record<string, PurchaseRound[]>,
): FulfillmentLine[] {
  return recipeLines.flatMap((line) => {
    const ingredient = ingredients.find((item) => item.id === line.ingredientId);
    const quantity = parsePositiveQuantity(line.quantity);
    if (!ingredient || quantity == null) {
      return [];
    }
    const costInput = effectiveCostInput(
      {
        purchasePrice: ingredient.purchase_price,
        purchaseQuantity: ingredient.purchase_quantity,
      },
      purchasesByIngredient[ingredient.id] ?? [],
    );
    return [
      {
        ingredientId: ingredient.id,
        quantity,
        unitCost: unitCost(costInput),
      },
    ];
  });
}

function savedLinesToFulfillment(
  recipeLines: ProductIngredient[],
  ingredients: IngredientRow[],
  purchasesByIngredient: Record<string, PurchaseRound[]>,
): FulfillmentLine[] {
  return toFulfillmentLines(
    recipeLines.map((line) => ({
      ingredientId: line.ingredient_id,
      quantity: String(line.quantity),
    })),
    ingredients,
    purchasesByIngredient,
  );
}

function suggestedPriceForTarget(
  cost: number,
  feePercent: number,
  mode: ProfitMode,
  amountRaw: string,
): number | null {
  const amount = Number(amountRaw.trim());
  if (!Number.isFinite(amount)) {
    return null;
  }
  return mode === "percent"
    ? sellingPriceFromMarginPercent(cost, feePercent, amount)
    : sellingPriceFromProfitBaht(cost, feePercent, amount);
}

function ChannelProfitTable({
  sellingPrice,
  cost,
  channels,
}: {
  sellingPrice: number | null;
  cost: number;
  channels: SalesChannel[];
}) {
  if (sellingPrice === null || channels.length === 0) {
    return (
      <p className="muted">ตั้งราคาขายและเพิ่มช่องทางขายก่อน จึงจะเห็นกำไรสุทธิ</p>
    );
  }
  return (
    <table>
      <thead>
        <tr>
          <th>ช่องทาง</th>
          <th>GP</th>
          <th>ได้เงินจริง</th>
          <th>กำไรบาท</th>
          <th>กำไร%</th>
        </tr>
      </thead>
      <tbody>
        {channels.map((channel) => {
          const profit = channelProfit(sellingPrice, cost, channel.fee_percent);
          if (!profit) {
            return null;
          }
          return (
            <tr key={channel.id}>
              <td>
                {channel.name} ({channel.fee_percent}%)
              </td>
              <td>{formatBaht(profit.channelFee)} บาท</td>
              <td>{formatBaht(profit.netReceived)} บาท</td>
              <td>{formatBaht(profit.netProfit)} บาท</td>
              <td>
                {formatBaht(profitPercent(profit.netProfit, sellingPrice) * 100)}%
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function PriceColumn({
  title,
  inputId,
  cost,
  sellingRaw,
  onSellingRawChange,
  channels,
  target,
  onTargetChange,
  onApplySuggested,
}: {
  title: string;
  inputId: string;
  cost: number;
  sellingRaw: string;
  onSellingRawChange: (value: string) => void;
  channels: SalesChannel[];
  target: ProfitTarget;
  onTargetChange: (next: ProfitTarget) => void;
  onApplySuggested: () => void;
}) {
  const selling = parseOptionalSellingPrice(sellingRaw);
  const radioName = `${inputId}-profit-mode`;
  return (
    <section>
      <h2>{title}</h2>
      <p className="cost-hero">ต้นทุน {formatBaht(cost)} บาท</p>
      <fieldset>
        <legend>เป้ากำไร</legend>
        <label>
          <input
            type="radio"
            name={radioName}
            checked={target.mode === "percent"}
            onChange={() => onTargetChange({ ...target, mode: "percent" })}
            style={{ width: "auto" }}
          />
          %
        </label>
        <label>
          <input
            type="radio"
            name={radioName}
            checked={target.mode === "baht"}
            onChange={() => onTargetChange({ ...target, mode: "baht" })}
            style={{ width: "auto" }}
          />
          บาท
        </label>
      </fieldset>
      <label htmlFor={`${inputId}-target`}>ค่าเป้ากำไร</label>
      <input
        id={`${inputId}-target`}
        inputMode="decimal"
        value={target.amount}
        onChange={(event) =>
          onTargetChange({ ...target, amount: event.target.value, suggestError: "" })
        }
      />
      <label htmlFor={`${inputId}-channel`}>ช่องทาง</label>
      <select
        id={`${inputId}-channel`}
        value={target.channelId}
        onChange={(event) =>
          onTargetChange({
            ...target,
            channelId: event.target.value,
            suggestError: "",
          })
        }
      >
        {channels.length === 0 ? <option value="">ยังไม่มีช่องทาง</option> : null}
        {channels.map((channel) => (
          <option key={channel.id} value={channel.id}>
            {channel.name} ({channel.fee_percent}%)
          </option>
        ))}
      </select>
      <button type="button" onClick={onApplySuggested} disabled={channels.length === 0}>
        ใส่ราคาแนะนำ
      </button>
      {target.suggestError ? <p className="muted">{target.suggestError}</p> : null}
      <label htmlFor={inputId}>อยากขายเท่าไหร่</label>
      <input
        id={inputId}
        inputMode="decimal"
        value={sellingRaw}
        onChange={(event) => onSellingRawChange(event.target.value)}
      />
      {!selling.ok ? (
        <p className="muted">ราคาขายต้องมากกว่า 0 หรือเว้นว่าง</p>
      ) : null}
      <ChannelProfitTable
        sellingPrice={selling.ok ? selling.value : null}
        cost={cost}
        channels={channels}
      />
    </section>
  );
}

export function ProductForm({
  ingredients,
  purchasesByIngredient,
  channels,
  packageProducts,
  packageLinesByProductId,
  existing,
  existingLines,
  products,
  onSaved,
  onCancel,
}: {
  ingredients: IngredientRow[];
  purchasesByIngredient: Record<string, PurchaseRound[]>;
  channels: SalesChannel[];
  packageProducts: Product[];
  packageLinesByProductId: Record<string, ProductIngredient[]>;
  existing: Product | null;
  existingLines: ProductIngredient[];
  products: Product[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const savedProductIdRef = useRef<string | null>(existing?.id ?? null);
  const [name, setName] = useState(existing?.name ?? "");
  const [isDeliveryPackage, setIsDeliveryPackage] = useState(
    Boolean(existing?.is_delivery_package),
  );
  const [deliveryPackageId, setDeliveryPackageId] = useState(
    existing?.delivery_package_id ?? "",
  );
  const [lines, setLines] = useState<RecipeLine[]>(
    existingLines.map((line) => ({
      ingredientId: line.ingredient_id,
      quantity: String(asNumber(line.quantity)),
      isPackaging: Boolean(line.is_packaging),
    })),
  );
  const [sellingPriceRaw, setSellingPriceRaw] = useState(
    existing?.selling_price == null ? "" : String(existing.selling_price),
  );
  const [sellingPriceDeliveryRaw, setSellingPriceDeliveryRaw] = useState(
    existing?.selling_price_delivery == null
      ? ""
      : String(existing.selling_price_delivery),
  );
  const [dineInTarget, setDineInTarget] = useState<ProfitTarget>(() =>
    emptyProfitTarget(channels),
  );
  const [deliveryTarget, setDeliveryTarget] = useState<ProfitTarget>(() =>
    emptyProfitTarget(channels),
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedIds = new Set(lines.map((line) => line.ingredientId));
  const selectedPackage = packageProducts.find(
    (item) => item.id === deliveryPackageId && item.is_delivery_package,
  );
  const showDeliveryColumn = !isDeliveryPackage && deliveryPackageId !== "";

  const cost = useMemo(() => {
    const parsed = lines.flatMap((line) => {
      const ingredient = ingredients.find((item) => item.id === line.ingredientId);
      const quantity = parsePositiveQuantity(line.quantity);
      if (!ingredient || quantity == null) {
        return [];
      }
      return [
        {
          ingredient: effectiveCostInput(
            {
              purchasePrice: ingredient.purchase_price,
              purchaseQuantity: ingredient.purchase_quantity,
            },
            purchasesByIngredient[ingredient.id] ?? [],
          ),
          quantity,
          ingredientId: ingredient.id,
          ingredientRow: ingredient,
        },
      ];
    });
    const drinkLines = toFulfillmentLines(lines, ingredients, purchasesByIngredient);
    const packageLines = savedLinesToFulfillment(
      packageLinesByProductId[deliveryPackageId] ?? [],
      ingredients,
      purchasesByIngredient,
    );
    return {
      dineIn: dineInCost(drinkLines),
      delivery: deliveryCost(drinkLines, packageLines),
      breakdown: parsed.map((line) => ({
        ingredientId: line.ingredientId,
        name: line.ingredientRow.name,
        unit: line.ingredientRow.unit.symbol,
        quantity: line.quantity,
        cost: lineCost(line.ingredient, line.quantity),
      })),
    };
  }, [deliveryPackageId, ingredients, lines, packageLinesByProductId, purchasesByIngredient]);

  function addLine() {
    const next = ingredients.find((item) => !selectedIds.has(item.id));
    if (!next) {
      return;
    }
    setLines((current) => [
      ...current,
      { ingredientId: next.id, quantity: "", isPackaging: false },
    ]);
  }

  function applySuggested(column: "dine_in" | "delivery") {
    const target = column === "dine_in" ? dineInTarget : deliveryTarget;
    const setTarget = column === "dine_in" ? setDineInTarget : setDeliveryTarget;
    const setPrice =
      column === "dine_in" ? setSellingPriceRaw : setSellingPriceDeliveryRaw;
    const columnCost = column === "dine_in" ? cost.dineIn : cost.delivery;
    const channel = channels.find((item) => item.id === target.channelId);
    if (!channel) {
      setTarget({ ...target, suggestError: SUGGEST_ERROR });
      return;
    }
    const suggested = suggestedPriceForTarget(
      columnCost,
      channel.fee_percent,
      target.mode,
      target.amount,
    );
    if (suggested == null) {
      setTarget({ ...target, suggestError: SUGGEST_ERROR });
      return;
    }
    setTarget({ ...target, suggestError: "" });
    setPrice(formatBaht(suggested));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (!name.trim()) {
        setError("กรอกชื่อเมนู");
        return;
      }
      if (
        existing?.is_delivery_package &&
        !isDeliveryPackage &&
        products.some((item) => item.delivery_package_id === existing.id)
      ) {
        setError("เลิกเป็นชุดแพ็กส่งไม่ได้ เพราะมีเมนูใช้อยู่");
        return;
      }
      if (isDeliveryPackage && lines.length === 0) {
        setError("ใส่ของในชุดแพ็กส่ง");
        return;
      }
      if (
        !isDeliveryPackage &&
        deliveryPackageId !== "" &&
        selectedPackage == null
      ) {
        setError("เลือกชุดแพ็กส่งจากรายการ");
        return;
      }
      const parsedPrice = parseOptionalSellingPrice(sellingPriceRaw);
      const parsedDeliveryPrice = parseOptionalSellingPrice(sellingPriceDeliveryRaw);
      if (!isDeliveryPackage && !parsedPrice.ok) {
        setError("ราคาขายต้องมากกว่า 0 หรือเว้นว่างถ้ายังไม่ตั้งราคา");
        return;
      }
      if (!isDeliveryPackage && showDeliveryColumn && !parsedDeliveryPrice.ok) {
        setError("ราคาขายต้องมากกว่า 0 หรือเว้นว่างถ้ายังไม่ตั้งราคา");
        return;
      }
      for (const line of lines) {
        if (parsePositiveQuantity(line.quantity) == null) {
          setError("ปริมาณในสูตรต้องมากกว่า 0");
          return;
        }
      }
      const payload = {
        name: name.trim(),
        is_delivery_package: isDeliveryPackage,
        delivery_package_id:
          isDeliveryPackage || deliveryPackageId === "" ? null : deliveryPackageId,
        selling_price: isDeliveryPackage ? null : parsedPrice.ok ? parsedPrice.value : null,
        selling_price_delivery:
          isDeliveryPackage || !showDeliveryColumn
            ? null
            : parsedDeliveryPrice.ok
              ? parsedDeliveryPrice.value
              : null,
      };
      const supabase = createBrowserClient();
      let productId = savedProductIdRef.current;
      if (productId) {
        const { error: updateError } = await supabase
          .from("products")
          .update({
            ...payload,
            updated_at: new Date().toISOString(),
          })
          .eq("id", productId);
        if (updateError) {
          setError("บันทึกไม่สำเร็จ");
          return;
        }
      } else {
        const { data, error: insertError } = await supabase
          .from("products")
          .insert(payload)
          .select("id")
          .single();
        if (insertError || !data) {
          setError("บันทึกไม่สำเร็จ");
          return;
        }
        productId = data.id as string;
        savedProductIdRef.current = productId;
      }
      const ingredientIds = lines.map((line) => line.ingredientId);
      if (lines.length > 0) {
        const { error: linesError } = await supabase.from("product_ingredients").upsert(
          lines.map((line) => ({
            product_id: productId,
            ingredient_id: line.ingredientId,
            quantity: parsePositiveQuantity(line.quantity),
            is_packaging: line.isPackaging,
          })),
          { onConflict: "product_id,ingredient_id" },
        );
        if (linesError) {
          setError("บันทึกไม่สำเร็จ");
          return;
        }
        const { error: deleteRemovedError } = await supabase
          .from("product_ingredients")
          .delete()
          .eq("product_id", productId)
          .not("ingredient_id", "in", `(${ingredientIds.join(",")})`);
        if (deleteRemovedError) {
          setError("บันทึกไม่สำเร็จ");
          return;
        }
      } else {
        const { error: deleteAllError } = await supabase
          .from("product_ingredients")
          .delete()
          .eq("product_id", productId);
        if (deleteAllError) {
          setError("บันทึกไม่สำเร็จ");
          return;
        }
      }
      onSaved();
    } catch {
      setError("บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
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
      <label>
        <input
          type="checkbox"
          checked={isDeliveryPackage}
          onChange={(event) => {
            const checked = event.target.checked;
            if (
              !checked &&
              existing?.is_delivery_package &&
              products.some((item) => item.delivery_package_id === existing.id)
            ) {
              setError("เลิกเป็นชุดแพ็กส่งไม่ได้ เพราะมีเมนูใช้อยู่");
              return;
            }
            setIsDeliveryPackage(checked);
            if (checked) {
              setDeliveryPackageId("");
            }
          }}
          style={{ width: "auto" }}
        />
        นี่คือ delivery package ไม่ใช่เมนูน้ำ
      </label>
      {!isDeliveryPackage ? (
        <>
          <label htmlFor="delivery-package">ชุดแพ็กส่ง</label>
          <select
            id="delivery-package"
            value={deliveryPackageId}
            onChange={(event) => setDeliveryPackageId(event.target.value)}
          >
            <option value=""></option>
            {packageProducts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </>
      ) : null}
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
            <label>
              <input
                type="checkbox"
                checked={line.isPackaging}
                onChange={(event) => {
                  const isPackaging = event.target.checked;
                  setLines((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, isPackaging } : item,
                    ),
                  );
                }}
                style={{ width: "auto" }}
              />
              ค่า Package ไม่ใช่เมนูน้ำ
            </label>
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
      <ul>
        {cost.breakdown.map((row) => (
          <li key={row.ingredientId}>
            {row.name} {row.quantity} {row.unit} = {formatBaht(row.cost)} บาท
          </li>
        ))}
      </ul>
      {isDeliveryPackage ? (
        <p className="cost-hero">ต้นทุน {formatBaht(cost.dineIn)} บาท</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: showDeliveryColumn ? "1fr 1fr" : "1fr",
            gap: "1rem",
            alignItems: "start",
          }}
        >
          <PriceColumn
            title="หน้าร้าน"
            inputId="selling-price"
            cost={cost.dineIn}
            sellingRaw={sellingPriceRaw}
            onSellingRawChange={setSellingPriceRaw}
            channels={channels}
            target={dineInTarget}
            onTargetChange={setDineInTarget}
            onApplySuggested={() => applySuggested("dine_in")}
          />
          {showDeliveryColumn ? (
            <PriceColumn
              title="เดลิเวอรี"
              inputId="selling-price-delivery"
              cost={cost.delivery}
              sellingRaw={sellingPriceDeliveryRaw}
              onSellingRawChange={setSellingPriceDeliveryRaw}
              channels={channels}
              target={deliveryTarget}
              onTargetChange={setDeliveryTarget}
              onApplySuggested={() => applySuggested("delivery")}
            />
          ) : null}
        </div>
      )}
      <button type="submit" disabled={saving}>
        บันทึกเมนู
      </button>
      <button type="button" onClick={onCancel}>
        ยกเลิก
      </button>
    </form>
  );
}
