"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ErrorBanner } from "@/components/error-banner";
import { ProductForm } from "@/app/products/product-form";
import { productCost } from "@/lib/costing";
import { formatBaht } from "@/lib/money";
import { asNumber, asOne, createBrowserClient } from "@/lib/supabase/client";
import type {
  Ingredient,
  Product,
  ProductIngredient,
  SalesChannel,
  Unit,
} from "@/lib/types";
import { canCreateProduct } from "@/lib/validation";

type IngredientRow = Ingredient & { unit: Unit };

export default function ProductsPage() {
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [lines, setLines] = useState<ProductIngredient[]>([]);
  const [channels, setChannels] = useState<SalesChannel[]>([]);
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const supabase = createBrowserClient();
      const [ingRes, prodRes, lineRes, chRes] = await Promise.all([
        supabase.from("ingredients").select("*, unit:units(*)").order("created_at"),
        supabase.from("products").select("*").order("created_at"),
        supabase.from("product_ingredients").select("*"),
        supabase.from("sales_channels").select("*").order("created_at"),
      ]);
      if (ingRes.error || prodRes.error || lineRes.error || chRes.error) {
        setError("โหลดเมนูไม่สำเร็จ");
        return;
      }
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
            } as IngredientRow,
          ];
        }),
      );
      setProducts(
        (prodRes.data ?? []).map((row) => ({
          ...row,
          selling_price:
            row.selling_price == null ? null : asNumber(row.selling_price),
        })) as Product[],
      );
      setLines(
        (lineRes.data ?? []).map((row) => ({
          ...row,
          quantity: asNumber(row.quantity),
        })) as ProductIngredient[],
      );
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

  function costFor(product: Product): number {
    const recipe = lines.filter((line) => line.product_id === product.id);
    return productCost(
      recipe.flatMap((line) => {
        const ingredient = ingredients.find((item) => item.id === line.ingredient_id);
        if (!ingredient) {
          return [];
        }
        return [
          {
            ingredient: {
              purchasePrice: ingredient.purchase_price,
              purchaseQuantity: ingredient.purchase_quantity,
            },
            quantity: line.quantity,
          },
        ];
      }),
    );
  }

  async function onDelete(id: string) {
    setError("");
    try {
      const supabase = createBrowserClient();
      const { error: deleteError } = await supabase.from("products").delete().eq("id", id);
      if (deleteError) {
        setError("ลบไม่สำเร็จ");
        return;
      }
      await load();
    } catch {
      setError("ลบไม่สำเร็จ");
    }
  }

  const allowCreate = canCreateProduct(ingredients.length);
  const showForm = creating || editing !== null;

  return (
    <section>
      <h1>เมนู</h1>
      {error ? <ErrorBanner message={error} /> : null}
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
          channels={channels}
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
          {products.map((product) => (
            <tr key={product.id}>
              <td>{product.name}</td>
              <td>{formatBaht(costFor(product))} บาท</td>
              <td>
                {product.selling_price == null
                  ? "ยังไม่ตั้งราคา"
                  : `${formatBaht(product.selling_price)} บาท`}
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
          ))}
        </tbody>
      </table>
    </section>
  );
}
