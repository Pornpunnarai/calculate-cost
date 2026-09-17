"use client";

import { useEffect, useState } from "react";
import { ErrorBanner } from "@/components/error-banner";
import { channelProfit, unitCost } from "@/lib/costing";
import {
  deliveryCost,
  dineInCost,
  saleNeeds,
  type FulfillmentKind,
  type FulfillmentLine,
} from "@/lib/menu-fulfillment";
import { formatBaht } from "@/lib/money";
import { effectiveCostInput, type PurchaseRound } from "@/lib/purchase-cost";
import { formatShortage, stockShortages, type StockNeed } from "@/lib/stock";
import { asNumber, asOne, createBrowserClient } from "@/lib/supabase/client";
import type {
  Ingredient,
  Product,
  ProductIngredient,
  SalesChannel,
  StockPurchase,
  StockSale,
  Unit,
} from "@/lib/types";
import { parsePositiveQuantity } from "@/lib/validation";

type IngredientRow = Ingredient & { unit: Unit };

type SaleRpcShortage = {
  ingredientId: string;
  name: string;
  symbol: string;
  have: number | string;
  need: number | string;
};

type SaleRpcResult = {
  ok: boolean;
  shortages?: SaleRpcShortage[];
};

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

function coerceProduct(row: {
  selling_price?: number | string | null;
  is_delivery_package?: boolean | null;
  delivery_package_id?: string | null;
  selling_price_delivery?: number | string | null;
}): Product {
  return {
    ...(row as Product),
    selling_price:
      row.selling_price == null ? null : asNumber(row.selling_price),
    is_delivery_package: Boolean(row.is_delivery_package),
    delivery_package_id: row.delivery_package_id ?? null,
    selling_price_delivery:
      row.selling_price_delivery == null
        ? null
        : asNumber(row.selling_price_delivery),
  };
}

function coerceProductIngredient(row: {
  quantity?: number | string;
  is_packaging?: boolean | null;
}): ProductIngredient {
  return {
    ...(row as ProductIngredient),
    quantity: asNumber(row.quantity ?? 0),
    is_packaging: Boolean(row.is_packaging),
  };
}

function toStockNeed(item: SaleRpcShortage): StockNeed {
  return {
    ingredientId: item.ingredientId,
    name: item.name,
    symbol: item.symbol,
    have: asNumber(item.have),
    need: asNumber(item.need),
  };
}

function fulfillmentLinesFor(
  productId: string | null | undefined,
  recipeLines: ProductIngredient[],
  ingredients: IngredientRow[],
  purchasesByIngredient: Record<string, PurchaseRound[]>,
): FulfillmentLine[] {
  if (!productId) {
    return [];
  }
  return recipeLines.flatMap((line) => {
    if (line.product_id !== productId) {
      return [];
    }
    const ingredient = ingredients.find((item) => item.id === line.ingredient_id);
    if (!ingredient) {
      return [];
    }
    return [
      {
        ingredientId: ingredient.id,
        quantity: line.quantity,
        unitCost: unitCost(
          effectiveCostInput(
            {
              purchasePrice: ingredient.purchase_price,
              purchaseQuantity: ingredient.purchase_quantity,
            },
            purchasesByIngredient[ingredient.id] ?? [],
          ),
        ),
      },
    ];
  });
}

function recipeCount(recipeLines: ProductIngredient[], productId: string): number {
  return recipeLines.filter((line) => line.product_id === productId).length;
}

export default function SalesPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [channels, setChannels] = useState<SalesChannel[]>([]);
  const [lines, setLines] = useState<ProductIngredient[]>([]);
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [purchasesByIngredient, setPurchasesByIngredient] = useState<
    Record<string, PurchaseRound[]>
  >({});
  const [sales, setSales] = useState<StockSale[]>([]);
  const [productId, setProductId] = useState("");
  const [channelId, setChannelId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [fulfillment, setFulfillment] = useState<FulfillmentKind>("dine_in");
  const [error, setError] = useState("");
  const [rpcShortages, setRpcShortages] = useState<StockNeed[]>([]);
  const [saving, setSaving] = useState(false);

  async function load() {
    setError("");
    setRpcShortages([]);
    try {
      const supabase = createBrowserClient();
      const [
        productsRes,
        channelsRes,
        linesRes,
        ingredientsRes,
        purchasesRes,
        salesRes,
      ] = await Promise.all([
        supabase.from("products").select("*").order("created_at"),
        supabase.from("sales_channels").select("*").order("created_at"),
        supabase.from("product_ingredients").select("*"),
        supabase
          .from("ingredients")
          .select("*, unit:units(*)")
          .order("created_at"),
        supabase.from("stock_purchases").select("*"),
        supabase
          .from("stock_sales")
          .select("*")
          .order("created_at", { ascending: false }),
      ]);
      if (
        productsRes.error ||
        channelsRes.error ||
        linesRes.error ||
        ingredientsRes.error ||
        purchasesRes.error ||
        salesRes.error
      ) {
        setError("โหลดประวัติขายไม่สำเร็จ");
        return;
      }
      setProducts((productsRes.data ?? []).map(coerceProduct));
      setChannels(
        (channelsRes.data ?? []).map((row) => ({
          ...row,
          fee_percent: asNumber(row.fee_percent),
        })) as SalesChannel[],
      );
      setLines((linesRes.data ?? []).map(coerceProductIngredient));
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
      setIngredients(ingredientRows);
      setPurchasesByIngredient(
        groupPurchasesByIngredient(
          ((purchasesRes.data ?? []) as StockPurchase[]).map((row) => ({
            ...row,
            quantity: asNumber(row.quantity),
            amount_paid: asNumber(row.amount_paid),
          })),
        ),
      );
      setSales(
        ((salesRes.data ?? []) as StockSale[]).map((row) => ({
          ...row,
          quantity: asNumber(row.quantity),
          selling_price_each: asNumber(row.selling_price_each),
          fee_percent: asNumber(row.fee_percent),
          product_cost_each: asNumber(row.product_cost_each),
          fulfillment:
            row.fulfillment === "delivery" ? "delivery" : "dine_in",
        })),
      );
    } catch {
      setError("โหลดประวัติขายไม่สำเร็จ");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const drinkProducts = products.filter((item) => !item.is_delivery_package);
  const selectedProduct = drinkProducts.find((item) => item.id === productId);
  const selectedChannel = channels.find((item) => item.id === channelId);
  const soldQty = parsePositiveQuantity(quantity);
  const canDeliver = Boolean(selectedProduct?.delivery_package_id);
  const drinkLines = fulfillmentLinesFor(
    selectedProduct?.id,
    lines,
    ingredients,
    purchasesByIngredient,
  );
  const packageLines = fulfillmentLinesFor(
    selectedProduct?.delivery_package_id,
    lines,
    ingredients,
    purchasesByIngredient,
  );
  const drinkRecipeCount = selectedProduct
    ? recipeCount(lines, selectedProduct.id)
    : 0;
  const recipeReady =
    selectedProduct != null &&
    drinkRecipeCount > 0 &&
    (fulfillment === "delivery"
      ? selectedProduct.selling_price_delivery != null && canDeliver
      : selectedProduct.selling_price != null);
  const sellingPriceEach =
    selectedProduct == null
      ? null
      : fulfillment === "delivery"
        ? selectedProduct.selling_price_delivery
        : selectedProduct.selling_price;
  const needs: StockNeed[] =
    selectedProduct && soldQty != null
      ? saleNeeds(fulfillment, drinkLines, packageLines, soldQty).flatMap(
          (need) => {
            const ingredient = ingredients.find(
              (item) => item.id === need.ingredientId,
            );
            if (!ingredient) {
              return [];
            }
            return [
              {
                ingredientId: ingredient.id,
                name: ingredient.name,
                symbol: ingredient.unit.symbol,
                have: ingredient.remaining_quantity,
                need: need.quantity,
              },
            ];
          },
        )
      : [];
  const shortages = stockShortages(needs);
  const productCostEach =
    fulfillment === "delivery"
      ? deliveryCost(drinkLines, packageLines)
      : dineInCost(drinkLines);
  const previewProfit =
    sellingPriceEach != null && selectedChannel && soldQty != null
      ? channelProfit(
          sellingPriceEach * soldQty,
          productCostEach * soldQty,
          selectedChannel.fee_percent,
        )
      : null;
  const canSubmit =
    Boolean(selectedProduct) &&
    Boolean(selectedChannel) &&
    soldQty != null &&
    recipeReady &&
    shortages.length === 0 &&
    rpcShortages.length === 0 &&
    !saving;
  const productsById = Object.fromEntries(
    products.map((item) => [item.id, item]),
  );
  const channelsById = Object.fromEntries(
    channels.map((item) => [item.id, item]),
  );

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (
      !selectedProduct ||
      selectedProduct.is_delivery_package ||
      !selectedChannel ||
      soldQty == null ||
      !recipeReady ||
      sellingPriceEach == null
    ) {
      return;
    }
    if (fulfillment === "delivery" && !selectedProduct.delivery_package_id) {
      return;
    }
    if (shortages.length > 0) {
      return;
    }
    if (rpcShortages.length > 0) {
      return;
    }
    if (saving) {
      return;
    }
    setSaving(true);
    try {
      const supabase = createBrowserClient();
      const [
        productRes,
        channelRes,
        linesRes,
        ingredientsRes,
        purchasesRes,
      ] = await Promise.all([
        supabase.from("products").select("*").eq("id", selectedProduct.id).single(),
        supabase
          .from("sales_channels")
          .select("*")
          .eq("id", selectedChannel.id)
          .single(),
        supabase.from("product_ingredients").select("*"),
        supabase.from("ingredients").select("*, unit:units(*)"),
        supabase.from("stock_purchases").select("*"),
      ]);
      if (
        productRes.error ||
        channelRes.error ||
        linesRes.error ||
        ingredientsRes.error ||
        purchasesRes.error ||
        !productRes.data ||
        !channelRes.data
      ) {
        setError("บันทึกไม่สำเร็จ");
        return;
      }

      const freshProduct = coerceProduct(productRes.data);
      const freshRecipe = (linesRes.data ?? []).map(coerceProductIngredient);
      const freshSellingPriceEach =
        fulfillment === "delivery"
          ? freshProduct.selling_price_delivery
          : freshProduct.selling_price;
      const freshDrinkCount = recipeCount(freshRecipe, freshProduct.id);
      if (
        freshProduct.is_delivery_package ||
        freshSellingPriceEach == null ||
        freshDrinkCount === 0 ||
        (fulfillment === "delivery" && !freshProduct.delivery_package_id)
      ) {
        setError("เมนูนี้ยังไม่มีสูตรหรือยังไม่ตั้งราคาขาย");
        return;
      }
      const freshChannel = {
        ...channelRes.data,
        fee_percent: asNumber(channelRes.data.fee_percent),
      } as SalesChannel;
      const freshIngredients = (ingredientsRes.data ?? []).flatMap((row) => {
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
      const freshPurchases = groupPurchasesByIngredient(
        ((purchasesRes.data ?? []) as StockPurchase[]).map((row) => ({
          ...row,
          quantity: asNumber(row.quantity),
          amount_paid: asNumber(row.amount_paid),
        })),
      );
      const freshDrinkLines = fulfillmentLinesFor(
        freshProduct.id,
        freshRecipe,
        freshIngredients,
        freshPurchases,
      );
      const freshPackageLines = fulfillmentLinesFor(
        freshProduct.delivery_package_id,
        freshRecipe,
        freshIngredients,
        freshPurchases,
      );
      const freshPackageCount = freshProduct.delivery_package_id
        ? recipeCount(freshRecipe, freshProduct.delivery_package_id)
        : 0;
      if (freshDrinkLines.length !== freshDrinkCount) {
        setError("บันทึกไม่สำเร็จ");
        return;
      }
      if (
        fulfillment === "delivery" &&
        freshPackageLines.length !== freshPackageCount
      ) {
        setError("บันทึกไม่สำเร็จ");
        return;
      }
      const freshProductCostEach =
        fulfillment === "delivery"
          ? deliveryCost(freshDrinkLines, freshPackageLines)
          : dineInCost(freshDrinkLines);
      const { data, error: rpcError } = await supabase.rpc(
        "record_stock_sale",
        {
          p_product_id: freshProduct.id,
          p_sales_channel_id: freshChannel.id,
          p_quantity: soldQty,
          p_selling_price_each: freshSellingPriceEach,
          p_fee_percent: freshChannel.fee_percent,
          p_product_cost_each: freshProductCostEach,
          p_fulfillment: fulfillment,
        },
      );
      if (rpcError) {
        setError("บันทึกไม่สำเร็จ");
        return;
      }
      const result = data as SaleRpcResult | null;
      if (result?.ok === false) {
        const rpcShortageRows = result.shortages ?? [];
        if (rpcShortageRows.length === 0) {
          setError("บันทึกไม่สำเร็จ");
          return;
        }
        setRpcShortages(rpcShortageRows.map(toStockNeed));
        return;
      }
      if (!result?.ok) {
        setError("บันทึกไม่สำเร็จ");
        return;
      }
      setQuantity("");
      await load();
    } catch {
      setError("บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  const shownShortages = rpcShortages.length > 0 ? rpcShortages : shortages;

  return (
    <section>
      <h1>ขายออก</h1>
      {error ? <ErrorBanner message={error} /> : null}
      {shownShortages.map((item) => (
        <ErrorBanner
          key={item.ingredientId}
          message={formatShortage(item)}
        />
      ))}
      <form onSubmit={onSubmit}>
        <label htmlFor="sale-product">เมนู</label>
        <select
          id="sale-product"
          value={productId}
          onChange={(event) => {
            setRpcShortages([]);
            setFulfillment("dine_in");
            setProductId(event.target.value);
          }}
        >
          <option value="">เลือกเมนู</option>
          {drinkProducts.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <fieldset>
          <legend>รูปแบบการขาย</legend>
          <label>
            <input
              type="radio"
              name="sale-fulfillment"
              checked={fulfillment === "dine_in"}
              onChange={() => {
                setRpcShortages([]);
                setFulfillment("dine_in");
              }}
              style={{ width: "auto" }}
            />
            หน้าร้าน
          </label>
          <label>
            <input
              type="radio"
              name="sale-fulfillment"
              checked={fulfillment === "delivery"}
              disabled={!canDeliver}
              onChange={() => {
                setRpcShortages([]);
                setFulfillment("delivery");
              }}
              style={{ width: "auto" }}
            />
            เดลิเวอรี
          </label>
        </fieldset>
        <label htmlFor="sale-qty">จำนวน</label>
        <input
          id="sale-qty"
          inputMode="decimal"
          value={quantity}
          onChange={(event) => {
            setRpcShortages([]);
            setQuantity(event.target.value);
          }}
        />
        <label htmlFor="sale-channel">ช่องทาง</label>
        <select
          id="sale-channel"
          value={channelId}
          onChange={(event) => {
            setRpcShortages([]);
            setChannelId(event.target.value);
          }}
        >
          <option value="">เลือกช่องทาง</option>
          {channels.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} ({item.fee_percent}%)
            </option>
          ))}
        </select>
        {selectedProduct && !recipeReady ? (
          <p className="muted">
            เมนูนี้ยังไม่มีสูตรหรือยังไม่ตั้งราคาขาย
          </p>
        ) : null}
        {selectedProduct && soldQty != null && recipeReady ? (
          <div>
            <h2>สรุปก่อนบันทึก</h2>
            <p>ของที่จะตัด</p>
            <ul>
              {needs.map((item) => (
                <li key={item.ingredientId}>
                  {item.name} {item.need} {item.symbol} (มี {item.have}{" "}
                  {item.symbol})
                </li>
              ))}
            </ul>
            {previewProfit && sellingPriceEach != null ? (
              <ul>
                <li>
                  ยอดขาย {formatBaht(sellingPriceEach * soldQty)} บาท
                </li>
                <li>
                  GP {selectedChannel?.fee_percent}% ={" "}
                  {formatBaht(previewProfit.channelFee)} บาท
                </li>
                <li>
                  ได้เงินจริง {formatBaht(previewProfit.netReceived)} บาท
                </li>
                <li>
                  กำไรสุทธิ {formatBaht(previewProfit.netProfit)} บาท
                </li>
              </ul>
            ) : null}
          </div>
        ) : null}
        <button type="submit" disabled={!canSubmit}>
          บันทึกการขาย
        </button>
      </form>
      <table>
        <thead>
          <tr>
            <th>วันเวลา</th>
            <th>เมนู</th>
            <th>จำนวน</th>
            <th>ช่องทาง</th>
            <th>ได้เงินจริง</th>
            <th>กำไรสุทธิ</th>
          </tr>
        </thead>
        <tbody>
          {sales.map((row) => {
            const product = productsById[row.product_id];
            const channel = channelsById[row.sales_channel_id];
            const profit = channelProfit(
              row.selling_price_each * row.quantity,
              row.product_cost_each * row.quantity,
              row.fee_percent,
            );
            return (
              <tr key={row.id}>
                <td>{new Date(row.created_at).toLocaleString("th-TH")}</td>
                <td>{product?.name ?? "—"}</td>
                <td>{row.quantity}</td>
                <td>{channel?.name ?? "—"}</td>
                <td>
                  {profit ? `${formatBaht(profit.netReceived)} บาท` : "—"}
                </td>
                <td>
                  {profit ? `${formatBaht(profit.netProfit)} บาท` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
