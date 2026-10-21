# Menu Packaging and Delivery Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้เมนูน้ำติ๊กบรรทัดแพ็ก เลือกชุดแพ็กส่งจากรายการได้โดยไม่บังคับ โชว์ต้นทุน/ราคา/กำไรหน้าร้านกับเดลิเวอรี และขายออกตัดของตามโหมดนั้น

**Architecture:** คณิตต้นทุนสองโหมดและคำราคาจากเป้ากำไรอยู่ใน TypeScript ที่เทสด้วย Vitest ก่อน คอลัมน์ใหม่บน `products` / `product_ingredients` / `stock_sales` กับ RPC ขายออกที่รวมความต้องการต่อวัตถุดิบก่อนตัดของ หน้าเมนูและหน้าขายออกอ่านค่าเหล่านี้ ไม่เก็บผลลัพธ์ต้นทุนในฐานข้อมูล

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase Postgres RPC, Vitest

## Global Constraints

- ภาษา UI เป็นภาษาไทย
- ห้ามแก้ migration ที่รันไปแล้ว — ไฟล์ใหม่เท่านั้น `supabase/migrations/20260918100000_menu_packaging_delivery.sql`
- เลือกชุดแพ็กส่งบนเมนูน้ำเป็น dropdown หนึ่งชุด **ไม่บังคับ** ไม่ใช่ติ๊ก
- ชุดแพ็กส่งไม่โชว์ในหน้าขายออก
- กำไร% = กำไรสุทธิหลังหัก GP ÷ ราคาขาย
- ไม่เปลี่ยนสูตรเฉลี่ยต้นทุนวัตถุดิบ
- ทำงานบน branch `feat/menu-packaging-delivery` ไม่ใช่ `main`
- อย่า commit `.env.local`
- Git ใช้ `/Applications/Xcode.app/Contents/Developer/usr/bin/git` เพราะ `/usr/bin/git` ติดใบอนุญาต Xcode
- รัน `npx tsc --noEmit` และ `npm test` หลังแต่ละ task ที่แตะโค้ด

---

## File map

| File | Responsibility |
|---|---|
| `src/lib/costing.ts` | เพิ่มกำไร% และคำราคาจากเป้า % / บาท |
| `src/lib/costing.test.ts` | เคสสเปก 104.17 และ 95.59 |
| `src/lib/menu-fulfillment.ts` | รวมบรรทัดเมนูน้ำ + ชุดแพ็กส่ง เป็นต้นทุนและรายการตัดสต็อก |
| `src/lib/menu-fulfillment.test.ts` | เดลิเวอรี = หน้าร้าน + ชุดแพ็ก; รวมปริมาณวัตถุดิบซ้ำ |
| `src/lib/types.ts` | ฟิลด์ใหม่บน Product, ProductIngredient, StockSale |
| `supabase/migrations/20260918100000_menu_packaging_delivery.sql` | คอลัมน์ + กฎ + `record_stock_sale` รับโหมด |
| `src/app/products/product-form.tsx` | ติ๊กชุดแพ็กส่ง, ติ๊กบรรทัด Package, dropdown ชุดแพ็กส่ง, สองคอลัมน์ราคา |
| `src/app/products/page.tsx` | ป้ายชุดแพ็กส่ง, ต้นทุน/ราคาสองแบบ, ลบไม่ได้ถ้ามีเมนูชี้ |
| `src/app/sales/page.tsx` | กรองเมนูน้ำ, เลือกหน้าร้าน/เดลิเวอรี |
| `README.md` | ขั้นรัน SQL ใหม่ |

---

### Task 1: Costing and fulfillment math

**Files:**
- Modify: `src/lib/costing.ts`
- Modify: `src/lib/costing.test.ts`
- Create: `src/lib/menu-fulfillment.ts`
- Create: `src/lib/menu-fulfillment.test.ts`

- [ ] **Step 1: Write failing costing tests**

เพิ่มท้าย `src/lib/costing.test.ts`:

```ts
import {
  profitPercent,
  sellingPriceFromMarginPercent,
  sellingPriceFromProfitBaht,
} from "./costing";

describe("profitPercent", () => {
  it("is net profit over selling price", () => {
    expect(profitPercent(20, 100)).toBe(0.2);
  });
});

describe("sellingPriceFromMarginPercent", () => {
  it("cost 50 GP 32% margin 20% is 104.17", () => {
    expect(formatBaht(sellingPriceFromMarginPercent(50, 32, 20)!)).toBe(
      "104.17",
    );
  });

  it("returns null when GP plus margin covers 100%", () => {
    expect(sellingPriceFromMarginPercent(50, 32, 70)).toBeNull();
  });
});

describe("sellingPriceFromProfitBaht", () => {
  it("cost 50 GP 32% profit 15 is 95.59", () => {
    expect(formatBaht(sellingPriceFromProfitBaht(50, 32, 15)!)).toBe("95.59");
  });

  it("returns null when GP is 100%", () => {
    expect(sellingPriceFromProfitBaht(50, 100, 15)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/costing.test.ts`  
Expected: FAIL because the new exports do not exist

- [ ] **Step 3: Implement costing helpers**

ใน `src/lib/costing.ts` เพิ่ม:

```ts
export function profitPercent(
  netProfit: number,
  sellingPrice: number,
): number {
  return netProfit / sellingPrice;
}

export function sellingPriceFromMarginPercent(
  cost: number,
  feePercent: number,
  marginPercent: number,
): number | null {
  if (cost < 0 || feePercent < 0 || marginPercent <= 0) {
    return null;
  }
  const denominator = 1 - feePercent / 100 - marginPercent / 100;
  if (denominator <= 0) {
    return null;
  }
  return cost / denominator;
}

export function sellingPriceFromProfitBaht(
  cost: number,
  feePercent: number,
  targetBaht: number,
): number | null {
  if (cost < 0 || feePercent < 0 || targetBaht <= 0) {
    return null;
  }
  const denominator = 1 - feePercent / 100;
  if (denominator <= 0) {
    return null;
  }
  return (cost + targetBaht) / denominator;
}
```

- [ ] **Step 4: Write failing fulfillment tests**

สร้าง `src/lib/menu-fulfillment.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatBaht } from "./money";
import {
  deliveryCost,
  dineInCost,
  saleNeeds,
  type FulfillmentLine,
} from "./menu-fulfillment";

const drink: FulfillmentLine[] = [
  { ingredientId: "tea", quantity: 3, unitCost: 4 },
  { ingredientId: "cup", quantity: 1, unitCost: 2 },
];
const pack: FulfillmentLine[] = [
  { ingredientId: "bag", quantity: 1, unitCost: 1.5 },
  { ingredientId: "cup", quantity: 1, unitCost: 2 },
];

describe("dineInCost", () => {
  it("sums every drink-menu line including packaging ticks", () => {
    expect(dineInCost(drink)).toBe(14);
  });
});

describe("deliveryCost", () => {
  it("is dine-in plus the selected package set", () => {
    expect(deliveryCost(drink, pack)).toBe(17.5);
    expect(formatBaht(deliveryCost(drink, pack))).toBe("17.50");
  });
});

describe("saleNeeds", () => {
  it("dine-in does not include package-set rows", () => {
    expect(saleNeeds("dine_in", drink, pack, 2)).toEqual([
      { ingredientId: "tea", quantity: 6 },
      { ingredientId: "cup", quantity: 2 },
    ]);
  });

  it("delivery merges the same ingredient from drink and package", () => {
    expect(saleNeeds("delivery", drink, pack, 1)).toEqual([
      { ingredientId: "tea", quantity: 3 },
      { ingredientId: "cup", quantity: 2 },
      { ingredientId: "bag", quantity: 1 },
    ]);
  });
});
```

- [ ] **Step 5: Run fulfillment test to verify it fails**

Run: `npx vitest run src/lib/menu-fulfillment.test.ts`  
Expected: FAIL because the file does not exist

- [ ] **Step 6: Implement fulfillment helpers**

สร้าง `src/lib/menu-fulfillment.ts`:

```ts
export type FulfillmentKind = "dine_in" | "delivery";

export type FulfillmentLine = {
  ingredientId: string;
  quantity: number;
  unitCost: number;
};

export function dineInCost(drinkLines: FulfillmentLine[]): number {
  return drinkLines.reduce(
    (sum, line) => sum + line.unitCost * line.quantity,
    0,
  );
}

export function deliveryCost(
  drinkLines: FulfillmentLine[],
  packageLines: FulfillmentLine[],
): number {
  return dineInCost(drinkLines) + dineInCost(packageLines);
}

export function saleNeeds(
  kind: FulfillmentKind,
  drinkLines: FulfillmentLine[],
  packageLines: FulfillmentLine[],
  soldQty: number,
): Array<{ ingredientId: string; quantity: number }> {
  const source =
    kind === "delivery" ? [...drinkLines, ...packageLines] : drinkLines;
  const merged = new Map<string, number>();
  for (const line of source) {
    merged.set(
      line.ingredientId,
      (merged.get(line.ingredientId) ?? 0) + line.quantity * soldQty,
    );
  }
  return [...merged.entries()].map(([ingredientId, quantity]) => ({
    ingredientId,
    quantity,
  }));
}
```

ลำดับในเทส delivery merge ต้องตรงกับลำดับ Map (tea, cup, bag ตามที่เจอ)

- [ ] **Step 7: Run tests and typecheck**

Run: `npx vitest run src/lib/costing.test.ts src/lib/menu-fulfillment.test.ts`  
แล้ว `npx tsc --noEmit` และ `npm test`  
Expected: PASS

- [ ] **Step 8: Commit**

Commit เฉพาะไฟล์ task นี้

```bash
git add src/lib/costing.ts src/lib/costing.test.ts src/lib/menu-fulfillment.ts src/lib/menu-fulfillment.test.ts
git commit -m "$(cat <<'EOF'
Add dine-in vs delivery cost and target-price helpers.

EOF
)"
```

---

### Task 2: Schema and sale RPC

**Files:**
- Create: `supabase/migrations/20260918100000_menu_packaging_delivery.sql`

อย่าแก้ `20260909000000_buy_sell.sql` — `create or replace` `record_stock_sale` ในไฟล์ใหม่ และเพิ่มพารามิเตอร์ `p_fulfillment text`

ลายเซ็นใหม่:  
`record_stock_sale(p_product_id uuid, p_sales_channel_id uuid, p_quantity numeric, p_selling_price_each numeric, p_fee_percent numeric, p_product_cost_each numeric, p_fulfillment text)`

ต้อง grant ลายเซ็นใหม่ และถ้าลายเซ็นเก่ายังอยู่ให้ drop ลายเซ็น 6 อาร์กิวเมนต์หลังสร้างของใหม่ เพื่อไม่ให้ client ยิงของเก่า

รวมความต้องการต่อ `ingredient_id` ก่อนเช็ค shortage และก่อนตัดของ — ห้ามวนเช็คทีละบรรทัดของคนละเมนูโดยไม่วนรวม เพราะถุงใบเดียวกันในเมนูน้ำกับชุดแพ็กส่งจะหลุด

- [ ] **Step 1: Write the migration**

สร้างไฟล์ให้ครบ:

```sql
alter table products
  add column if not exists is_delivery_package boolean not null default false,
  add column if not exists delivery_package_id uuid references products(id),
  add column if not exists selling_price_delivery numeric;

alter table products
  drop constraint if exists products_selling_price_delivery_positive;
alter table products
  add constraint products_selling_price_delivery_positive
  check (selling_price_delivery is null or selling_price_delivery > 0);

alter table products
  drop constraint if exists products_delivery_package_rules;
alter table products
  add constraint products_delivery_package_rules
  check (
    is_delivery_package = false
    or delivery_package_id is null
  );

alter table product_ingredients
  add column if not exists is_packaging boolean not null default false;

alter table stock_sales
  add column if not exists fulfillment text not null default 'dine_in';

alter table stock_sales
  drop constraint if exists stock_sales_fulfillment_check;
alter table stock_sales
  add constraint stock_sales_fulfillment_check
  check (fulfillment in ('dine_in', 'delivery'));
```

จากนั้น trigger หรือฟังก์ชันตรวจว่า `delivery_package_id` ชี้แถวที่ `is_delivery_package = true` และไม่ชี้ตัวเอง ถ้าไม่ใช่ `raise exception`

จากนั้น `create or replace function record_stock_sale(..., p_fulfillment text)`:

- ถ้า `p_fulfillment` ไม่ใช่ `dine_in` หรือ `delivery` ให้ exception
- อ่านสินค้า ถ้า `is_delivery_package` ให้ `{ok:false}` ไม่ขายชุดแพ็กส่ง
- ถ้า `delivery` แล้ว `delivery_package_id` เป็น null ให้ exception หรือ `{ok:false}`
- สร้าง temp ของ `(ingredient_id, need)` จากบรรทัดเมนูน้ำ ถ้า delivery ให้บวกบรรทัดชุดแพ็กส่งเข้า ingredient เดียวกัน
- ล็อกวัตถุดิบ `for update` เช็ค shortage จากยอดรวม แล้วตัดด้วยยอดรวม
- insert `stock_sales` รวม `fulfillment`

grant execute ลายเซ็น 7 อาร์กิวเมนต์  
`drop function if exists record_stock_sale(uuid, uuid, numeric, numeric, numeric, numeric);`

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260918100000_menu_packaging_delivery.sql
git commit -m "$(cat <<'EOF'
Add packaging columns and fulfillment to stock sale RPC.

EOF
)"
```

---

### Task 3: Product types and form

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/app/products/product-form.tsx`
- Modify: `src/app/products/page.tsx`

- [ ] **Step 1: Extend types**

`Product` เพิ่ม `is_delivery_package: boolean`, `delivery_package_id: string | null`, `selling_price_delivery: number | null`  
`ProductIngredient` เพิ่ม `is_packaging: boolean`  
`StockSale` เพิ่ม `fulfillment: "dine_in" | "delivery"`

- [ ] **Step 2: Product form**

รับ `packageProducts: Product[]` (รายการที่ `is_delivery_package` ยกเว้นตัวเองตอนแก้)

State เพิ่ม: `isDeliveryPackage`, `is_packaging` ต่อบรรทัด, `deliveryPackageId`, `sellingPriceDeliveryRaw`, เป้ากำไรต่อคอลัมน์ (โหมด `%` หรือ `บาท`, ค่า, ช่องทางที่เลือก)

ติ๊ก label ตรงสเปก: `นี่คือ delivery package ไม่ใช่เมนูน้ำ` และต่อบรรทัด `ค่า Package ไม่ใช่เมนูน้ำ`

ถ้าติ๊กชุดแพ็กส่ง: ซ่อน dropdown ชุดแพ็กส่ง ซ่อนสองราคา โชว์ต้นทุนอย่างเดียว บังคับมีอย่างน้อยหนึ่งบรรทัด ข้อความ `ใส่ของในชุดแพ็กส่ง`

ถ้าเมนูน้ำ: dropdown `ชุดแพ็กส่ง` ตัวเลือกเว้นว่างได้ label ชุดจากชื่อเมนู **ไม่บังคับ**

ต้นทุนหน้าร้านจากทุกบรรทัดของฟอร์ม  
ต้นทุนเดลิเวอรี = หน้าร้าน + ต้นทุนชุดที่เลือก (คำจาก `existing` lines ของชุดนั้น — ส่ง `packageLinesByProductId` จากหน้า page)

สองคอลัมน์เมื่อ `deliveryPackageId` ไม่ว่าง แต่ละคอลัมน์มีเป้ากำไร ปุ่มหรือการเปลี่ยนช่องทางแล้วใส่ราคาแนะนำด้วย `sellingPriceFromMarginPercent` / `sellingPriceFromProfitBaht` ข้อความ `ตั้งเป้ากำไรต่ำกว่านี้ เพราะบวก GP แล้วเต็มหรือเกิน 100%` เมื่อได้ null

บันทึก: `is_delivery_package`, `delivery_package_id` (null ถ้าเป็นชุดแพ็กส่งหรือไม่เลือก), `selling_price`, `selling_price_delivery`, `product_ingredients.is_packaging`

ชุดแพ็กส่งไม่บันทึก `delivery_package_id` และไม่บันทึกราคาขายลูกค้า (เซ็ต null)

ถ้าชี้ id ที่ไม่ใช่ชุดแพ็กส่ง: `เลือกชุดแพ็กส่งจากรายการ`

- [ ] **Step 3: Products list**

ชุดแพ็กส่งติดข้อความว่าเป็นแพ็กส่ง โชว์ต้นทุน ไม่โชว์ราคาขาย  
เมนูน้ำโชว์ต้นทุน/ราคาหน้าร้าน และถ้ามีชุดแพ็กส่งโชว์ต้นทุน/ราคาเดลิเวอรี  
ลบชุดแพ็กส่ง: ถ้ามีเมนูน้ำ `delivery_package_id` ชี้มา แสดง `ลบไม่ได้ เพราะมีเมนูใช้อยู่` อย่าลบ

โหลด `is_packaging` และฟิลด์สินค้าใหม่ตอน select

- [ ] **Step 4: Typecheck and full tests**

Run: `npx tsc --noEmit` และ `npm test`

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/app/products/product-form.tsx src/app/products/page.tsx
git commit -m "$(cat <<'EOF'
Let drink menus pick an optional delivery package.

EOF
)"
```

---

### Task 4: Sales fulfillment

**Files:**
- Modify: `src/app/sales/page.tsx`

- [ ] **Step 1: Filter and mode**

รายการเลือกเมนูเฉพาะ `!is_delivery_package`  
radio **หน้าร้าน** / **เดลิเวอรี** default หน้าร้าน  
ถ้าไม่มี `delivery_package_id` disable เดลิเวอรี  
ถ้าเดลิเวอรีและ `selling_price_delivery` ว่าง ขายไม่ได้

needs / productCostEach / preview ใช้ `saleNeeds` + `dineInCost` / `deliveryCost` จากบรรทัดเมนูน้ำและบรรทัดชุดแพ็กส่ง (โหลด `product_ingredients` ของชุดที่ถูกชี้ด้วย)

RPC:

```ts
await supabase.rpc("record_stock_sale", {
  p_product_id: ...,
  p_sales_channel_id: ...,
  p_quantity: ...,
  p_selling_price_each: fulfillment === "delivery"
    ? selectedProduct.selling_price_delivery
    : selectedProduct.selling_price,
  p_fee_percent: ...,
  p_product_cost_each: ...,
  p_fulfillment: fulfillment,
});
```

ประวัติขายไม่ต้องเพิ่มคอลัมน์ UI ในรอบนี้ถ้าไม่ได้ขอ แต่ส่ง fulfillment ตอนบันทึก

- [ ] **Step 2: Typecheck and tests**

Run: `npx tsc --noEmit` และ `npm test`

- [ ] **Step 3: Manual checks after SQL is applied**

เคสสเปก 1–8 รวมสร้างชุด Package Delivery Matcha Latte แล้วไม่ขึ้นหน้าขายออก

- [ ] **Step 4: Commit**

```bash
git add src/app/sales/page.tsx
git commit -m "$(cat <<'EOF'
Sell drinks as dine-in or delivery with matching stock.

EOF
)"
```

---

### Task 5: README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add SQL step**

หลังขั้น `20260918000000_purchase_edit_security_definer.sql` เพิ่มรัน  
`supabase/migrations/20260918100000_menu_packaging_delivery.sql`  
แล้วเลื่อนเลขขั้นถัดไป

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
Document the menu packaging SQL migration.

EOF
)"
```

---

## Self-review

| Spec | Plan |
|---|---|
| ติ๊กเมนูว่าเป็นชุดแพ็กส่ง | Task 3 |
| ติ๊กบรรทัดค่า Package | Task 3 |
| dropdown ชุดแพ็กส่งไม่บังคับ | Task 3 |
| สองคอลัมน์ต้นทุน/ราคา/กำไร | Task 1 + 3 |
| คำราคา 104.17 / 95.59 | Task 1 |
| ชุดแพ็กส่งไม่ขึ้นขายออก | Task 4 |
| ตัดของตามโหมด รวมวัตถุดิบซ้ำ | Task 1 + 2 + 4 |
| ลบชุดที่ถูกชี้ไม่ได้ | Task 3 |
| migration ใหม่ | Task 2 |
| README | Task 5 |
