"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ErrorBanner } from "@/components/error-banner";
import { ProductForm } from "@/app/products/product-form";
import { unitCost } from "@/lib/costing";
import { deliveryCost, dineInCost, type FulfillmentLine } from "@/lib/menu-fulfillment";
import { formatBaht } from "@/lib/money";
import { effectiveCostInput, type PurchaseRound } from "@/lib/purchase-cost";
import { asNumber, asOne, createBrowserClient } from "@/lib/supabase/client";
import type {
  Ingredient,
  Product,
  ProductIngredient,
  SalesChannel,
  StockPurchase,
  Unit,
} from "@/lib/types";
import { canCreateProduct } from "@/lib/validation";

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

function groupLinesByProductId(
  rows: ProductIngredient[],
): Record<string, ProductIngredient[]> {
  const grouped: Record<string, ProductIngredient[]> = {};
  for (const row of rows) {
    const current = grouped[row.product_id] ?? [];
    current.push(row);
    grouped[row.product_id] = current;
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

export default function ProductsPage() {
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [purchasesByIngredient, setPurchasesByIngredient] = useState<
    Record<string, PurchaseRound[]>
  >({});
  const [products, setProducts] = useState<Product[]>([]);
  const [lines, setLines] = useState<ProductIngredient[]>([]);
  const [channels, setChannels] = useState<SalesChannel[]>([]);
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [purchaseWarning, setPurchaseWarning] = useState("");

  async function load() {
    setError("");
    setPurchaseWarning("");
    try {
      const supabase = createBrowserClient();
      const [ingRes, prodRes, lineRes, chRes, purchasesRes] = await Promise.all([
        supabase.from("ingredients").select("*, unit:units(*)").order("created_at"),
        supabase.from("products").select("*").order("created_at"),
        supabase.from("product_ingredients").select("*"),
        supabase.from("sales_channels").select("*").order("created_at"),
        supabase.from("stock_purchases").select("*"),
      ]);
      if (ingRes.error || prodRes.error || lineRes.error || chRes.error) {
        setError("โหลดเมนูไม่สำเร็จ");
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
      setIngredients(
        (ingRes.data ?? []).flatMap((row) => {
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
      setProducts((prodRes.data ?? []).map((row) => coerceProduct(row)));
      setLines((lineRes.data ?? []).map((row) => coerceProductIngredient(row)));
      setChannels(
        (chRes.data ?? []).map((row) => ({
          ...row,
          fee_percent: asNumber(row.fee_percent),
        })) as SalesChannel[],
      );
    } catch {
      setError("โหลดเมนูไม่สำเร็จ");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function fulfillmentFor(productId: string): FulfillmentLine[] {
    return lines.flatMap((line) => {
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

  function dineInCostFor(product: Product): number {
    return dineInCost(fulfillmentFor(product.id));
  }

  function deliveryCostFor(product: Product): number | null {
    if (product.is_delivery_package || !product.delivery_package_id) {
      return null;
    }
    return deliveryCost(
      fulfillmentFor(product.id),
      fulfillmentFor(product.delivery_package_id),
    );
  }

  async function onDelete(id: string) {
    setError("");
    const target = products.find((item) => item.id === id);
    if (
      target?.is_delivery_package &&
      products.some((item) => item.delivery_package_id === id)
    ) {
      setError("ลบไม่ได้ เพราะมีเมนูใช้อยู่");
      return;
    }
    try {
      const supabase = createBrowserClient();
      const { error: deleteError } = await supabase.from("products").delete().eq("id", id);
      if (deleteError) {
        setError(
          target?.is_delivery_package && deleteError.code === "23503"
            ? "ลบไม่ได้ เพราะมีเมนูใช้อยู่"
            : deleteError.code === "23503"
              ? "ลบไม่ได้ เพราะมีประวัติการขายเมนูนี้อยู่"
              : "ลบไม่สำเร็จ",
        );
        return;
      }
      await load();
    } catch {
      setError("ลบไม่สำเร็จ");
    }
  }

  const allowCreate = canCreateProduct(ingredients.length);
  const showForm = creating || editing !== null;
  const packageProducts = products.filter(
    (product) =>
      product.is_delivery_package && product.id !== (editing?.id ?? ""),
  );
  const packageLinesByProductId = groupLinesByProductId(
    lines.filter((line) =>
      products.some(
        (product) =>
          product.is_delivery_package && product.id === line.product_id,
      ),
    ),
  );

  return (
    <section>
      <h1>เมนู</h1>
      {error ? <ErrorBanner message={error} /> : null}
      {purchaseWarning ? <ErrorBanner message={purchaseWarning} /> : null}
      {!allowCreate ? (
        <p>
          ยังไม่มีวัตถุดิบ กรุณา
          <Link href="/ingredients"> ไปเพิ่มวัตถุดิบก่อน</Link>
        </p>
      ) : null}
      {allowCreate && !showForm ? (
        <button type="button" onClick={() => setCreating(true)}>
          เพิ่มเมนู
        </button>
      ) : null}
      {showForm ? (
        <ProductForm
          key={editing?.id ?? "new"}
          ingredients={ingredients}
          purchasesByIngredient={purchasesByIngredient}
          channels={channels}
          packageProducts={packageProducts}
          packageLinesByProductId={packageLinesByProductId}
          existing={editing}
          existingLines={
            editing ? lines.filter((line) => line.product_id === editing.id) : []
          }
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            void load();
          }}
          onCancel={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      ) : null}
      <table>
        <thead>
          <tr>
            <th>ชื่อ</th>
            <th>ต้นทุน</th>
            <th>ราคาขาย</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => {
            const dineIn = dineInCostFor(product);
            const delivery = deliveryCostFor(product);
            return (
              <tr key={product.id}>
                <td>
                  {product.name}
                  {product.is_delivery_package ? (
                    <span className="muted"> เป็นแพ็กส่ง</span>
                  ) : null}
                </td>
                <td>
                  {product.is_delivery_package ? (
                    `${formatBaht(dineIn)} บาท`
                  ) : (
                    <>
                      <div>หน้าร้าน {formatBaht(dineIn)} บาท</div>
                      {delivery != null ? (
                        <div>เดลิเวอรี {formatBaht(delivery)} บาท</div>
                      ) : null}
                    </>
                  )}
                </td>
                <td>
                  {product.is_delivery_package ? null : (
                    <>
                      <div>
                        หน้าร้าน{" "}
                        {product.selling_price == null
                          ? "ยังไม่ตั้งราคา"
                          : `${formatBaht(product.selling_price)} บาท`}
                      </div>
                      {delivery != null ? (
                        <div>
                          เดลิเวอรี{" "}
                          {product.selling_price_delivery == null
                            ? "ยังไม่ตั้งราคา"
                            : `${formatBaht(product.selling_price_delivery)} บาท`}
                        </div>
                      ) : null}
                    </>
                  )}
                </td>
                <td>
                  <button type="button" onClick={() => setEditing(product)}>
                    แก้
                  </button>
                  <button type="button" onClick={() => void onDelete(product.id)}>
                    ลบ
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
