# Purchase-first warehouse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ingredients exist only after a successful purchase; the ingredients page is a read-only warehouse; purchases capture date, list price, amount paid, and a supplier separate from sales channels.

**Architecture:** Pure TS computes displayed discount and validates money. A new SQL file adds `purchase_sources`, extra `stock_purchases` columns, and replaces `record_stock_purchase` so creating an ingredient and writing the first purchase happen in one transaction. Restock still averages unit cost from `amount_paid / quantity` and overwrites pack fields with that round. The purchases UI resolves or inserts a source, then calls the RPC. Do not edit already-applied migrations.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (`rpc` + tables), Vitest.

## Global Constraints

- UI language is Thai; currency is บาท
- Display money with round-half-up to 2 decimal places only after summing
- Average unit cost = mean of `(amount_paid / quantity)` per purchase round, equal weight; do not use remaining stock or quantity sold
- If zero purchases, use pack `purchase_price / purchase_quantity`
- On each purchase, overwrite pack: `purchase_quantity = qty`, `purchase_price = amount_paid` (not list price)
- Discount shown = list price − amount paid; do not store discount
- Amount paid must be > 0 and ≤ list price; list price > 0
- New ingredient + first purchase must be one Postgres RPC transaction
- Purchase sources are not sales channels; seed Makro, ตลาด, Shopee, TikTok
- Warehouse page: name, unit, remaining, unit cost only; no add/edit/delete; no pack column
- New SQL only in `supabase/migrations/20260909110000_purchase_first_warehouse.sql`; do not edit `20260908000000_init.sql` or `20260909000000_buy_sell.sql`
- Never commit `.env.local`
- Do not start implementation on `main`; use branch `feat/purchase-first-warehouse`

## File structure

- `src/lib/purchase-money.ts` — discount, money validation, legacy display helpers
- `src/lib/purchase-money.test.ts`
- `src/lib/types.ts` — `PurchaseSource`; extra `StockPurchase` fields
- `supabase/migrations/20260909110000_purchase_first_warehouse.sql`
- `src/app/ingredients/page.tsx` — read-only warehouse
- `src/app/purchases/page.tsx` — new vs existing purchase form
- `README.md` — run the new SQL file

---

### Task 1: Purchase money helpers

**Files:**
- Create: `src/lib/purchase-money.ts`
- Test: `src/lib/purchase-money.test.ts`

**Interfaces:**
- Consumes: `isPositiveNumber` from `src/lib/validation.ts`; `formatBaht` from `src/lib/money.ts`
- Produces:
  - `export function purchaseDiscount(listPrice: number, amountPaid: number): number` → `listPrice - amountPaid`
  - `export function isValidPurchaseMoney(listPrice: number, amountPaid: number): boolean` → both positive and `amountPaid <= listPrice`
  - `export function displayedListPrice(listPrice: number | null, amountPaid: number): number` → `listPrice` if not null, else `amountPaid`
  - `export function displayedPurchaseDate(purchasedAt: string | null, createdAt: string): string` → `purchasedAt` if not null, else first 10 characters of `createdAt` (`YYYY-MM-DD`)

- [ ] **Step 1: Write the failing tests**

Create `src/lib/purchase-money.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatBaht } from "./money";
import {
  displayedListPrice,
  displayedPurchaseDate,
  isValidPurchaseMoney,
  purchaseDiscount,
} from "./purchase-money";

describe("purchaseDiscount", () => {
  it("500 list 450 paid => 50", () => {
    expect(purchaseDiscount(500, 450)).toBe(50);
    expect(formatBaht(purchaseDiscount(500, 450))).toBe("50.00");
  });

  it("400 list 400 paid => 0", () => {
    expect(purchaseDiscount(400, 400)).toBe(0);
  });
});

describe("isValidPurchaseMoney", () => {
  it("allows paid equal to list", () => {
    expect(isValidPurchaseMoney(400, 400)).toBe(true);
  });

  it("allows paid below list", () => {
    expect(isValidPurchaseMoney(500, 450)).toBe(true);
  });

  it("rejects paid above list", () => {
    expect(isValidPurchaseMoney(400, 450)).toBe(false);
  });

  it("rejects non-positive amounts", () => {
    expect(isValidPurchaseMoney(0, 100)).toBe(false);
    expect(isValidPurchaseMoney(100, 0)).toBe(false);
  });
});

describe("legacy display", () => {
  it("uses amount paid when list price is missing", () => {
    expect(displayedListPrice(null, 400)).toBe(400);
    expect(purchaseDiscount(displayedListPrice(null, 400), 400)).toBe(0);
  });

  it("uses created_at date when purchased_at is missing", () => {
    expect(
      displayedPurchaseDate(null, "2026-09-01T10:00:00.000Z"),
    ).toBe("2026-09-01");
    expect(displayedPurchaseDate("2026-09-08", "2026-09-01T10:00:00.000Z")).toBe(
      "2026-09-08",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/purchase-money.test.ts`

Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/purchase-money.ts`:

```ts
import { isPositiveNumber } from "./validation";

export function purchaseDiscount(listPrice: number, amountPaid: number): number {
  return listPrice - amountPaid;
}

export function isValidPurchaseMoney(
  listPrice: number,
  amountPaid: number,
): boolean {
  return (
    isPositiveNumber(listPrice) &&
    isPositiveNumber(amountPaid) &&
    amountPaid <= listPrice
  );
}

export function displayedListPrice(
  listPrice: number | null,
  amountPaid: number,
): number {
  return listPrice ?? amountPaid;
}

export function displayedPurchaseDate(
  purchasedAt: string | null,
  createdAt: string,
): string {
  if (purchasedAt) {
    return purchasedAt;
  }
  return createdAt.slice(0, 10);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/purchase-money.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/purchase-money.ts src/lib/purchase-money.test.ts
git commit -m "feat: validate purchase list price and discount"
```

---

### Task 2: Schema, RPC, and types

**Files:**
- Create: `supabase/migrations/20260909110000_purchase_first_warehouse.sql`
- Modify: `src/lib/types.ts`

**Interfaces:**
- Consumes: existing `record_stock_purchase(uuid, numeric, numeric)` which this task drops
- Produces:
  - table `purchase_sources` (`id`, `name`, `is_builtin`, `created_at`)
  - `stock_purchases.purchased_at date null`
  - `stock_purchases.list_price numeric null`
  - `stock_purchases.purchase_source_id uuid null references purchase_sources(id) on delete restrict`
  - RPC `record_stock_purchase(p_ingredient_id uuid, p_name text, p_unit_id uuid, p_quantity numeric, p_amount_paid numeric, p_list_price numeric, p_purchased_at date, p_source_id uuid) returns stock_purchases`
  - `export type PurchaseSource = { id: string; name: string; is_builtin: boolean; created_at: string }`
  - `StockPurchase` adds `purchased_at: string | null`, `list_price: number | null`, `purchase_source_id: string | null`

When `p_ingredient_id` is null, RPC inserts ingredient (`name`, `purchase_unit_id`, `purchase_quantity = p_quantity`, `purchase_price = p_amount_paid`, `remaining_quantity = p_quantity`) then the purchase row. When it is set, lock that ingredient, add remaining, overwrite pack with `p_quantity` / `p_amount_paid`. Always write `purchased_at`, `list_price`, `purchase_source_id`. Reject if quantity/list/paid ≤ 0 or paid > list. Ignore `p_name` / `p_unit_id` when restocking.

- [ ] **Step 1: Extend types**

In `src/lib/types.ts` add after `SalesChannel`:

```ts
export type PurchaseSource = {
  id: string;
  name: string;
  is_builtin: boolean;
  created_at: string;
};
```

Change `StockPurchase` to:

```ts
export type StockPurchase = {
  id: string;
  ingredient_id: string;
  quantity: number;
  amount_paid: number;
  remaining_after: number;
  unit_cost_after: number;
  purchased_at: string | null;
  list_price: number | null;
  purchase_source_id: string | null;
  created_at: string;
};
```

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260909110000_purchase_first_warehouse.sql` with exactly this SQL:

```sql
create table purchase_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_builtin boolean not null default false,
  created_at timestamptz not null default now(),
  constraint purchase_sources_name_not_blank check (length(trim(name)) > 0)
);

alter table purchase_sources enable row level security;
create policy "purchase_sources_all" on purchase_sources
  for all to anon, authenticated using (true) with check (true);

insert into purchase_sources (name, is_builtin) values
  ('Makro', true),
  ('ตลาด', true),
  ('Shopee', true),
  ('TikTok', true);

alter table stock_purchases
  add column purchased_at date,
  add column list_price numeric,
  add column purchase_source_id uuid references purchase_sources (id) on delete restrict;

drop function if exists record_stock_purchase(uuid, numeric, numeric);

create function record_stock_purchase(
  p_ingredient_id uuid,
  p_name text,
  p_unit_id uuid,
  p_quantity numeric,
  p_amount_paid numeric,
  p_list_price numeric,
  p_purchased_at date,
  p_source_id uuid
)
returns stock_purchases
language plpgsql
as $$
declare
  v_id uuid;
  v_remaining numeric;
  v_avg numeric;
  v_row stock_purchases;
begin
  if p_quantity <= 0 or p_amount_paid <= 0 or p_list_price <= 0 then
    raise exception 'quantity and prices must be positive';
  end if;
  if p_amount_paid > p_list_price then
    raise exception 'amount paid cannot exceed list price';
  end if;
  if p_purchased_at is null then
    raise exception 'purchased_at is required';
  end if;
  if p_source_id is null then
    raise exception 'source is required';
  end if;

  if not exists (select 1 from purchase_sources where id = p_source_id) then
    raise exception 'source not found';
  end if;

  if p_ingredient_id is null then
    if p_name is null or length(trim(p_name)) = 0 or p_unit_id is null then
      raise exception 'name and unit are required for a new ingredient';
    end if;
    insert into ingredients (
      name,
      purchase_quantity,
      purchase_unit_id,
      purchase_price,
      remaining_quantity
    ) values (
      trim(p_name),
      p_quantity,
      p_unit_id,
      p_amount_paid,
      p_quantity
    ) returning id into v_id;
    v_remaining := p_quantity;
  else
    v_id := p_ingredient_id;
    select remaining_quantity into v_remaining
    from ingredients
    where id = v_id
    for update;
    if not found then
      raise exception 'ingredient not found';
    end if;
    v_remaining := v_remaining + p_quantity;
    update ingredients
    set remaining_quantity = v_remaining,
        purchase_quantity = p_quantity,
        purchase_price = p_amount_paid,
        updated_at = now()
    where id = v_id;
  end if;

  select avg(amount_paid / quantity) into v_avg
  from (
    select amount_paid, quantity from stock_purchases where ingredient_id = v_id
    union all
    select p_amount_paid, p_quantity
  ) as rounds;

  insert into stock_purchases (
    ingredient_id, quantity, amount_paid, remaining_after, unit_cost_after,
    purchased_at, list_price, purchase_source_id
  ) values (
    v_id, p_quantity, p_amount_paid, v_remaining, v_avg,
    p_purchased_at, p_list_price, p_source_id
  ) returning * into v_row;

  return v_row;
end;
$$;

grant execute on function record_stock_purchase(uuid, text, uuid, numeric, numeric, numeric, date, uuid)
  to anon, authenticated;
```

Do not add a check constraint that would fail on legacy null `list_price` rows.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`

Expected: PASS (purchases page still compiles; extra StockPurchase fields are optional at runtime until UI maps them)

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts supabase/migrations/20260909110000_purchase_first_warehouse.sql
git commit -m "feat: create ingredients inside the purchase rpc"
```

---

### Task 3: Read-only warehouse page

**Files:**
- Modify: `src/app/ingredients/page.tsx`

**Interfaces:**
- Consumes: `effectiveCostInput`, `unitCost`, `formatBaht`, `StockPurchase`, `Ingredient`, `Unit`
- Produces: warehouse table only — columns ชื่อ, หน่วย, คงเหลือ, ต้นทุนต่อหน่วย. No form, no แก้, no ลบ, no แพ็กที่ซื้อ.

- [ ] **Step 1: Replace the page**

Overwrite `src/app/ingredients/page.tsx` with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { ErrorBanner } from "@/components/error-banner";
import { unitCost } from "@/lib/costing";
import { formatBaht } from "@/lib/money";
import { effectiveCostInput, type PurchaseRound } from "@/lib/purchase-cost";
import { asNumber, asOne, createBrowserClient } from "@/lib/supabase/client";
import type { Ingredient, StockPurchase, Unit } from "@/lib/types";

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
  const [items, setItems] = useState<IngredientRow[]>([]);
  const [purchasesByIngredient, setPurchasesByIngredient] = useState<
    Record<string, PurchaseRound[]>
  >({});
  const [error, setError] = useState("");
  const [purchaseWarning, setPurchaseWarning] = useState("");

  async function load() {
    setError("");
    setPurchaseWarning("");
    try {
      const supabase = createBrowserClient();
      const [ingredientsRes, purchasesRes] = await Promise.all([
        supabase
          .from("ingredients")
          .select("*, unit:units(*)")
          .order("created_at"),
        supabase.from("stock_purchases").select("*"),
      ]);
      if (ingredientsRes.error) {
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
    } catch {
      setError("โหลดวัตถุดิบไม่สำเร็จ");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <section>
      <h1>วัตถุดิบ</h1>
      <p className="muted">ซื้อเข้าก่อน แล้วค่อยมาดูคลังและสร้างเมนู</p>
      {error ? <ErrorBanner message={error} /> : null}
      {purchaseWarning ? <ErrorBanner message={purchaseWarning} /> : null}
      <table>
        <thead>
          <tr>
            <th>ชื่อ</th>
            <th>หน่วย</th>
            <th>คงเหลือ</th>
            <th>ต้นทุนต่อหน่วย</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.name}</td>
              <td>
                {item.unit.name} ({item.unit.symbol})
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
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/ingredients/page.tsx
git commit -m "feat: show ingredients as a read-only warehouse"
```

---

### Task 4: Purchase form (new item or restock)

**Files:**
- Modify: `src/app/purchases/page.tsx`

**Interfaces:**
- Consumes: `record_stock_purchase` with `p_ingredient_id`, `p_name`, `p_unit_id`, `p_quantity`, `p_amount_paid`, `p_list_price`, `p_purchased_at`, `p_source_id`; `isValidPurchaseMoney`, `purchaseDiscount`, `displayedListPrice`, `displayedPurchaseDate`; `PurchaseSource`, `StockPurchase`, `Unit`, `Ingredient`
- Produces: Thai form with mode ของใหม่ / ของในคลัง; fields per spec; history table; stay on `/purchases` after save; `saving` guard

Resolve source before RPC: trim typed name; if non-empty, `select` `purchase_sources` where `name` equals the trimmed string; if missing, `insert` `{ name: trimmed }` and use the new id; if unique violation, select again. If typed name is empty, use the selected source id. If neither, show `กรอกวันที่ แหล่งซื้อ ให้ครบ`.

Error copy:

- missing new name/unit: `กรอกชื่อและหน่วย`
- invalid money/qty: `กรอกปริมาณ ราคาเต็ม และเงินที่จ่ายให้มากกว่า 0 และเงินที่จ่ายต้องไม่เกินราคาเต็ม`
- missing date/source: `กรอกวันที่ซื้อและแหล่งซื้อ`
- missing existing ingredient: `เลือกวัตถุดิบในคลัง`
- rpc/network: `บันทึกไม่สำเร็จ`

- [ ] **Step 1: Replace `src/app/purchases/page.tsx`**

Use this implementation (keep `groupPurchasesByIngredient` as in the current file):

```tsx
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
  const [sourceId, setSourceId] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

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
      if (
        ingredientsRes.error ||
        purchasesRes.error ||
        unitsRes.error ||
        sourcesRes.error
      ) {
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
      const unitList = (unitsRes.data ?? []) as Unit[];
      setUnits(unitList);
      if (!unitId && unitList[0]) {
        setUnitId(unitList[0].id);
      }
      const sourceList = (sourcesRes.data ?? []) as PurchaseSource[];
      setSources(sourceList);
      if (!sourceId && sourceList[0]) {
        setSourceId(sourceList[0].id);
      }
      setPurchases(
        ((purchasesRes.data ?? []) as Array<StockPurchase & { source: PurchaseSource | PurchaseSource[] | null }>).map(
          (row) => ({
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
          }),
        ),
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
    const typed = sourceName.trim();
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
    if (!isPositiveNumber(qty) || !isValidPurchaseMoney(listPriceNumber, paidNumber)) {
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
        setError("กรอกวันที่ซื้อและแหล่งซื้อ");
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

  const itemsById = Object.fromEntries(items.map((item) => [item.id, item]));

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
            >
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name} ({unit.symbol})
                </option>
              ))}
            </select>
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
          {sources.map((source) => (
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
          </tr>
        </thead>
        <tbody>
          {purchases.map((row) => {
            const ingredient = itemsById[row.ingredient_id];
            const symbol = ingredient?.unit.symbol ?? "";
            const shownList = displayedListPrice(row.list_price, row.amount_paid);
            return (
              <tr key={row.id}>
                <td>{displayedPurchaseDate(row.purchased_at, row.created_at)}</td>
                <td>{ingredient?.name ?? "—"}</td>
                <td>{row.source?.name ?? "—"}</td>
                <td>
                  {row.quantity} {symbol}
                </td>
                <td>{formatBaht(shownList)} บาท</td>
                <td>{formatBaht(row.amount_paid)} บาท</td>
                <td>{formatBaht(purchaseDiscount(shownList, row.amount_paid))} บาท</td>
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
```

- [ ] **Step 2: Run unit tests and typecheck**

Run: `npm test && npx tsc --noEmit`

Expected: all current tests PASS, tsc PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/purchases/page.tsx
git commit -m "feat: record new or existing stock from the purchase form"
```

---

### Task 5: README

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: migration filename `20260909110000_purchase_first_warehouse.sql`
- Produces: setup step telling the user to run that file after `20260909000000_buy_sell.sql`

- [ ] **Step 1: Update README**

Change the Supabase setup list to:

```markdown
1. สร้างโปรเจกต์ใหม่ที่ https://supabase.com
2. เปิด SQL Editor แล้วรันไฟล์ `supabase/migrations/20260908000000_init.sql`
3. จากนั้นรันไฟล์ `supabase/migrations/20260909000000_buy_sell.sql` ใน SQL Editor เช่นกัน
4. จากนั้นรันไฟล์ `supabase/migrations/20260909110000_purchase_first_warehouse.sql`
5. คัดลอก Project URL และ anon key
6. สร้าง `.env.local` จาก `.env.example` แล้วใส่ค่าจริง
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: run purchase-first warehouse sql after buy-sell"
```

---

## Spec coverage

- New purchase fields, modes, discount preview, source select-or-type → Task 4
- Money validation and legacy history display → Task 1 + Task 4
- Average cost unchanged → existing `purchase-cost.ts`; RPC still averages `amount_paid/quantity` in Task 2
- Pack overwrite with paid amount → Task 2
- Atomic create ingredient + purchase → Task 2
- `purchase_sources` seed Makro / ตลาด / Shopee / TikTok → Task 2
- Warehouse read-only, no pack column → Task 3
- Errors in spec table → Task 4 (copy) + Task 2 (RPC)
- Sales / channels / menu leftover behavior → no task (leave as-is)
- New SQL file only → Task 2 + Task 5
- Spec tests 1–3 numbers → existing purchase-cost tests plus Task 1 discount 50; remaining/pack happen in RPC
- Spec test 4 new source name → Task 4 `resolveSourceId`
- Spec test 5 paid > list → Task 1 + Task 4 + Task 2
- Spec test 6 no warehouse form → Task 3
