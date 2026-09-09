"use client";

import { useEffect, useState } from "react";
import { ErrorBanner } from "@/components/error-banner";
import { channelProfit, productCost } from "@/lib/costing";
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

function toStockNeed(item: SaleRpcShortage): StockNeed {
  return {
    ingredientId: item.ingredientId,
    name: item.name,
    symbol: item.symbol,
    have: asNumber(item.have),
    need: asNumber(item.need),
  };
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
      setProducts(
        (productsRes.data ?? []).map((row) => ({
          ...row,
          selling_price:
            row.selling_price == null ? null : asNumber(row.selling_price),
        })) as Product[],
      );
      setChannels(
        (channelsRes.data ?? []).map((row) => ({
          ...row,
          fee_percent: asNumber(row.fee_percent),
        })) as SalesChannel[],
      );
      setLines(
        (linesRes.data ?? []).map((row) => ({
          ...row,
          quantity: asNumber(row.quantity),
        })) as ProductIngredient[],
      );
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
        })),
      );
    } catch {
      setError("โหลดประวัติขายไม่สำเร็จ");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const selectedProduct = products.find((item) => item.id === productId);
  const selectedChannel = channels.find((item) => item.id === channelId);
  const soldQty = parsePositiveQuantity(quantity);
  const recipe = selectedProduct
    ? lines.filter((line) => line.product_id === selectedProduct.id)
    : [];
  const recipeReady = recipe.length > 0 && selectedProduct?.selling_price != null;
  const needs: StockNeed[] =
    selectedProduct && soldQty != null
      ? recipe.flatMap((line) => {
          const ingredient = ingredients.find(
            (item) => item.id === line.ingredient_id,
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
              need: line.quantity * soldQty,
            },
          ];
        })
      : [];
  const shortages = stockShortages(needs);
  const productCostEach = selectedProduct
    ? productCost(
        recipe.flatMap((line) => {
          const ingredient = ingredients.find(
            (item) => item.id === line.ingredient_id,
          );
          if (!ingredient) {
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
              quantity: line.quantity,
            },
          ];
        }),
      )
    : 0;
  const previewProfit =
    selectedProduct?.selling_price != null &&
    selectedChannel &&
    soldQty != null
      ? channelProfit(
          selectedProduct.selling_price * soldQty,
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
      !selectedChannel ||
      soldQty == null ||
      !recipeReady ||
      selectedProduct.selling_price == null
    ) {
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
        supabase
          .from("product_ingredients")
          .select("*")
          .eq("product_id", selectedProduct.id),
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

      const freshProduct = {
        ...productRes.data,
        selling_price:
          productRes.data.selling_price == null
            ? null
            : asNumber(productRes.data.selling_price),
      } as Product;
      const freshRecipe = (linesRes.data ?? []).map((row) => ({
        ...row,
        quantity: asNumber(row.quantity),
      })) as ProductIngredient[];
      if (freshProduct.selling_price == null || freshRecipe.length === 0) {
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
      const freshCostLines = freshRecipe.flatMap((line) => {
        const ingredient = freshIngredients.find(
          (item) => item.id === line.ingredient_id,
        );
        if (!ingredient) {
          return [];
        }
        return [
          {
            ingredient: effectiveCostInput(
              {
                purchasePrice: ingredient.purchase_price,
                purchaseQuantity: ingredient.purchase_quantity,
              },
              freshPurchases[ingredient.id] ?? [],
            ),
            quantity: line.quantity,
          },
        ];
      });
      if (freshCostLines.length !== freshRecipe.length) {
        setError("บันทึกไม่สำเร็จ");
        return;
      }
      const freshProductCostEach = productCost(freshCostLines);
      const { data, error: rpcError } = await supabase.rpc(
        "record_stock_sale",
        {
          p_product_id: freshProduct.id,
          p_sales_channel_id: freshChannel.id,
          p_quantity: soldQty,
          p_selling_price_each: freshProduct.selling_price,
          p_fee_percent: freshChannel.fee_percent,
          p_product_cost_each: freshProductCostEach,
        },
      );
      if (rpcError) {
        setError("บันทึกไม่สำเร็จ");
        return;
      }
      const result = data as SaleRpcResult | null;
      if (result?.ok === false) {
        setRpcShortages((result.shortages ?? []).map(toStockNeed));
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
            setProductId(event.target.value);
          }}
        >
          <option value="">เลือกเมนู</option>
          {products.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
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
            {previewProfit && selectedProduct.selling_price != null ? (
              <ul>
                <li>
                  ยอดขาย{" "}
                  {formatBaht(selectedProduct.selling_price * soldQty)} บาท
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
