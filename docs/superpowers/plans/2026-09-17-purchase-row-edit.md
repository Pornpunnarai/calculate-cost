# Inline Purchase Edit/Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้แก้และลบรอบซื้อในตารางหน้า `/purchases` ได้ โดยคงเหลือกับต้นทุนเฉลี่ยคำนวณใหม่ใน transaction เดียว และห้ามทำถ้าคงเหลือจะติดลบ

**Architecture:** ตรรกะ sold / remaining / replay ค่าเฉลี่ยอยู่ใน TypeScript เพื่อทดสอบด้วย Vitest ก่อน Postgres RPC `update_stock_purchase` และ `delete_stock_purchase` ทำชุดเดียวกันใน transaction แล้วล็อกแถววัตถุดิบ หน้าซื้อเข้าแก้ในแถวทีละแถว ไม่แก้ชื่อวัตถุดิบหรือแหล่งซื้อ

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase Postgres RPC + RLS, Vitest

## Global Constraints

- ภาษา UI เป็นภาษาไทย
- ห้ามแก้ migration ที่รันไปแล้ว — ไฟล์ใหม่เท่านั้น `supabase/migrations/20260917100000_purchase_row_edit.sql`
- ต้นทุนเฉลี่ยยังเป็นค่าเฉลี่ยถ่วงน้ำหนักเท่ากันของ `(amount_paid / quantity)` ของแต่ละรอบ
- ไม่ลบวัตถุดิบแม้ลบรอบซื้อสุดท้าย (คลังยังมีชื่อ คงเหลือ 0 และไม่ทับแพ็ก)
- ไม่แก้หรือลบประวัติขายออก
- ทำงานบน branch `feat/purchase-row-edit` ไม่ใช่ `main`
- อย่า commit `.env.local`
- รัน `npx tsc --noEmit` และ `npm test` หลังแต่ละ task ที่แตะโค้ด

---

## File map

| File | Responsibility |
|---|---|
| `src/lib/purchase-revision.ts` | คำนวณ sold, remaining หลังเปลี่ยน, เรียงรอบ, replay `remaining_after` / `unit_cost_after` |
| `src/lib/purchase-revision.test.ts` | เคสสเปก: แก้ราคา, ลบแล้วคงเหลือติดลบ, replay หลังลบรอบที่ไม่กระทบของขาย |
| `supabase/migrations/20260917100000_purchase_row_edit.sql` | RPC `update_stock_purchase` และ `delete_stock_purchase` + helper ภายใน |
| `src/app/purchases/page.tsx` | ปุ่มแก้ไข/ลบ, แก้ในแถว, เรียก RPC, ข้อความผิดพลาดตามสเปก |
| `README.md` | ขั้นรัน SQL ไฟล์ใหม่ |

ไม่แตะหน้าขายออก หน้าคลัง หรือสูตรเฉลี่ยใน `src/lib/costing.ts`

---

### Task 1: Pure remaining/replay math

**Files:**
- Create: `src/lib/purchase-revision.ts`
- Create: `src/lib/purchase-revision.test.ts`

- [ ] **Step 1: Write the failing test**

สร้าง `src/lib/purchase-revision.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatBaht } from "./money";
import {
  canApplyPurchaseChange,
  remainingAfterChange,
  replayPurchaseRounds,
  soldQuantity,
  type PurchaseRevisionRound,
} from "./purchase-revision";

function round(
  id: string,
  quantity: number,
  amountPaid: number,
  purchasedAt: string,
  createdAt: string,
): PurchaseRevisionRound {
  return { id, quantity, amountPaid, purchasedAt, createdAt };
}

describe("soldQuantity", () => {
  it("is total purchased minus remaining", () => {
    expect(soldQuantity(200, 50)).toBe(150);
  });
});

describe("remainingAfterChange", () => {
  it("blocks deleting 100g when 150g was sold and 50 remains", () => {
    const sold = soldQuantity(200, 50);
    const next = remainingAfterChange(100, sold);
    expect(next).toBe(-50);
    expect(canApplyPurchaseChange(next)).toBe(false);
  });

  it("allows deleting a round that does not eat sold stock", () => {
    const sold = soldQuantity(200, 150);
    const next = remainingAfterChange(100, sold);
    expect(next).toBe(50);
    expect(canApplyPurchaseChange(next)).toBe(true);
  });
});

describe("replayPurchaseRounds", () => {
  it("recomputes equal-weight mean after changing the second payment to 500", () => {
    const after = replayPurchaseRounds([
      round("a", 100, 400, "2026-09-01", "2026-09-01T10:00:00Z"),
      round("b", 100, 500, "2026-09-02", "2026-09-02T10:00:00Z"),
    ]);
    expect(after[0]).toEqual({
      id: "a",
      remainingAfter: 100,
      unitCostAfter: 4,
    });
    expect(after[1].id).toBe("b");
    expect(after[1].remainingAfter).toBe(200);
    expect(after[1].unitCostAfter).toBe(4.5);
    expect(formatBaht(after[1].unitCostAfter)).toBe("4.50");
  });

  it("replays remaining rounds after deleting the first unused round", () => {
    const after = replayPurchaseRounds([
      round("b", 100, 450, "2026-09-02", "2026-09-02T10:00:00Z"),
    ]);
    expect(after).toEqual([
      { id: "b", remainingAfter: 100, unitCostAfter: 4.5 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/purchase-revision.test.ts`  
Expected: FAIL because `src/lib/purchase-revision.ts` does not exist

- [ ] **Step 3: Implement**

สร้าง `src/lib/purchase-revision.ts`:

```ts
export type PurchaseRevisionRound = {
  id: string;
  quantity: number;
  amountPaid: number;
  purchasedAt: string | null;
  createdAt: string;
};

export type ReplayedPurchaseRound = {
  id: string;
  remainingAfter: number;
  unitCostAfter: number;
};

export function soldQuantity(
  totalPurchased: number,
  remaining: number,
): number {
  return totalPurchased - remaining;
}

export function remainingAfterChange(
  newTotalPurchased: number,
  sold: number,
): number {
  return newTotalPurchased - sold;
}

export function canApplyPurchaseChange(newRemaining: number): boolean {
  return newRemaining >= 0;
}

export function sortPurchaseRounds(
  rounds: PurchaseRevisionRound[],
): PurchaseRevisionRound[] {
  return [...rounds].sort((left, right) => {
    const leftDate = left.purchasedAt ?? left.createdAt.slice(0, 10);
    const rightDate = right.purchasedAt ?? right.createdAt.slice(0, 10);
    if (leftDate !== rightDate) {
      return leftDate < rightDate ? -1 : 1;
    }
    if (left.createdAt !== right.createdAt) {
      return left.createdAt < right.createdAt ? -1 : 1;
    }
    return left.id < right.id ? -1 : 1;
  });
}

export function replayPurchaseRounds(
  rounds: PurchaseRevisionRound[],
): ReplayedPurchaseRound[] {
  const sorted = sortPurchaseRounds(rounds);
  let quantitySum = 0;
  const unitCosts: number[] = [];
  return sorted.map((round) => {
    quantitySum += round.quantity;
    unitCosts.push(round.amountPaid / round.quantity);
    const mean =
      unitCosts.reduce((sum, unitCost) => sum + unitCost, 0) / unitCosts.length;
    return {
      id: round.id,
      remainingAfter: quantitySum,
      unitCostAfter: mean,
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/purchase-revision.test.ts`  
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/purchase-revision.ts src/lib/purchase-revision.test.ts
git commit -m "$(cat <<'EOF'
Add purchase remaining and average replay helpers.

EOF
)"
```

---

### Task 2: Atomic update/delete RPCs

**Files:**
- Create: `supabase/migrations/20260917100000_purchase_row_edit.sql`

ลำดับ replay ใน SQL ต้องตรง helper: `coalesce(purchased_at, created_at::date)`, แล้ว `created_at`, แล้ว `id`

ล็อกแถววัตถุดิบด้วย `for update` ก่อนอ่านผลรวม

- [ ] **Step 1: Write the migration**

สร้าง `supabase/migrations/20260917100000_purchase_row_edit.sql` ทั้งไฟล์:

```sql
create or replace function rebuild_stock_purchases(p_ingredient_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  r record;
  v_qty_sum numeric := 0;
  v_cost_sum numeric := 0;
  v_n int := 0;
  v_last_qty numeric;
  v_last_paid numeric;
  v_has boolean := false;
  v_remaining numeric;
  v_sold numeric;
  v_old_sum numeric;
begin
  select remaining_quantity, coalesce((
    select sum(quantity) from stock_purchases where ingredient_id = p_ingredient_id
  ), 0)
    into v_remaining, v_old_sum
  from ingredients
  where id = p_ingredient_id;

  v_sold := v_old_sum - v_remaining;

  for r in
    select id, quantity, amount_paid
    from stock_purchases
    where ingredient_id = p_ingredient_id
    order by coalesce(purchased_at, created_at::date), created_at, id
  loop
    v_has := true;
    v_qty_sum := v_qty_sum + r.quantity;
    v_n := v_n + 1;
    v_cost_sum := v_cost_sum + (r.amount_paid / r.quantity);
    v_last_qty := r.quantity;
    v_last_paid := r.amount_paid;
    update stock_purchases
    set remaining_after = v_qty_sum,
        unit_cost_after = v_cost_sum / v_n
    where id = r.id;
  end loop;

  if v_has then
    update ingredients
    set remaining_quantity = v_qty_sum - v_sold,
        purchase_quantity = v_last_qty,
        purchase_price = v_last_paid
    where id = p_ingredient_id;
  else
    update ingredients
    set remaining_quantity = 0
    where id = p_ingredient_id;
  end if;
end;
$$;

create or replace function update_stock_purchase(
  p_id uuid,
  p_purchased_at date,
  p_quantity numeric,
  p_amount_paid numeric,
  p_list_price numeric
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ingredient_id uuid;
  v_old_qty numeric;
  v_old_sum numeric;
  v_remaining numeric;
  v_sold numeric;
  v_new_remaining numeric;
begin
  if p_purchased_at is null
     or p_quantity is null or p_quantity <= 0
     or p_amount_paid is null or p_amount_paid <= 0
     or p_list_price is null or p_list_price <= 0
     or p_amount_paid > p_list_price then
    raise exception 'invalid purchase money';
  end if;

  select ingredient_id, quantity
    into v_ingredient_id, v_old_qty
  from stock_purchases
  where id = p_id;

  if v_ingredient_id is null then
    raise exception 'purchase not found';
  end if;

  perform 1 from ingredients where id = v_ingredient_id for update;

  select remaining_quantity into v_remaining
  from ingredients where id = v_ingredient_id;

  select coalesce(sum(quantity), 0) into v_old_sum
  from stock_purchases
  where ingredient_id = v_ingredient_id;

  v_sold := v_old_sum - v_remaining;
  v_new_remaining := (v_old_sum - v_old_qty + p_quantity) - v_sold;

  if v_new_remaining < 0 then
    return jsonb_build_object('ok', false, 'reason', 'shortage');
  end if;

  update stock_purchases
  set purchased_at = p_purchased_at,
      quantity = p_quantity,
      amount_paid = p_amount_paid,
      list_price = p_list_price
  where id = p_id;

  perform rebuild_stock_purchases(v_ingredient_id);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function delete_stock_purchase(p_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ingredient_id uuid;
  v_old_qty numeric;
  v_old_sum numeric;
  v_remaining numeric;
  v_sold numeric;
  v_new_remaining numeric;
begin
  select ingredient_id, quantity
    into v_ingredient_id, v_old_qty
  from stock_purchases
  where id = p_id;

  if v_ingredient_id is null then
    raise exception 'purchase not found';
  end if;

  perform 1 from ingredients where id = v_ingredient_id for update;

  select remaining_quantity into v_remaining
  from ingredients where id = v_ingredient_id;

  select coalesce(sum(quantity), 0) into v_old_sum
  from stock_purchases
  where ingredient_id = v_ingredient_id;

  v_sold := v_old_sum - v_remaining;
  v_new_remaining := (v_old_sum - v_old_qty) - v_sold;

  if v_new_remaining < 0 then
    return jsonb_build_object('ok', false, 'reason', 'shortage');
  end if;

  delete from stock_purchases where id = p_id;
  perform rebuild_stock_purchases(v_ingredient_id);
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function rebuild_stock_purchases(uuid) to anon, authenticated;
grant execute on function update_stock_purchase(uuid, date, numeric, numeric, numeric) to anon, authenticated;
grant execute on function delete_stock_purchase(uuid) to anon, authenticated;
```

หมายเหตุ implementer: `rebuild_stock_purchases` อ่าน remaining หลังอัปเดตแถวแล้ว ดังนั้น `v_sold` ต้องใช้ผลรวม**ก่อน**เปลี่ยน เก็บ sold ในตัวแปรของ update/delete แล้วส่งเข้า rebuild จะชัวร์กว่า — ถ้าทำตามไฟล์ด้านบนตรง ๆ sold ใน rebuild จะเพี้ยนหลัง `update quantity` เพราะ `remaining_quantity` ยังเป็นค่าเก่าแต่ `sum(quantity)` เป็นค่าใหม่

แก้ให้ helper รับ sold เข้าไป:

```sql
create or replace function rebuild_stock_purchases(
  p_ingredient_id uuid,
  p_sold numeric
)
returns void
```

ในลูป replay เหมือนเดิม จากนั้น:

```sql
  if v_has then
    update ingredients
    set remaining_quantity = v_qty_sum - p_sold,
        purchase_quantity = v_last_qty,
        purchase_price = v_last_paid
    where id = p_ingredient_id;
  else
    update ingredients
    set remaining_quantity = 0
    where id = p_ingredient_id;
  end if;
```

`update_stock_purchase` / `delete_stock_purchase` คำนวณ `v_sold` จากผลรวม**ก่อน**เขียน แล้วเรียก `perform rebuild_stock_purchases(v_ingredient_id, v_sold);`

grant ให้ตรงลายเซ็นใหม่: `rebuild_stock_purchases(uuid, numeric)`

อย่า grant ถ้าไม่จำเป็นให้ client เรียก helper โดยตรง — ถ้ายกเลิก grant ของ helper ได้ ให้ revoke จาก anon หลังสร้าง เหลือแค่สอง RPC หลัก

- [ ] **Step 2: Manual SQL check (ผู้ใช้รันใน SQL Editor หลัง merge หรือตอนทดสอบเครื่อง)**

เคสสเปก 1: ซื้อ 100/400 และ 100/450 แล้ว `update_stock_purchase` รอบสองจ่าย 500 → `unit_cost_after` รอบล่าสุด 4.5 คงเหลือเท่าเดิม

เคสสเปก 2: ตั้ง remaining เป็น 50 (จำลองขาย 150) แล้ว `delete_stock_purchase` รอบ 100 → `{ ok: false, reason: "shortage" }` และแถวยังอยู่

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260917100000_purchase_row_edit.sql
git commit -m "$(cat <<'EOF'
Add RPCs to update or delete a purchase round.

EOF
)"
```

---

### Task 3: Inline edit and delete on `/purchases`

**Files:**
- Modify: `src/app/purchases/page.tsx`

ใช้ `isValidPurchaseMoney` และ `purchaseDiscount` ที่มีอยู่แล้ว  
ข้อความ validation ตอนแก้ในแถวใช้ชุดเดียวกับฟอร์มซื้อเข้า (วันที่ / ปริมาณ / ราคาเต็ม / เงินที่จ่าย)

- [ ] **Step 1: Add row action state and RPC handlers**

เหนือ `return` ของ `PurchasesPage` เพิ่ม state:

```ts
const [editingId, setEditingId] = useState<string | null>(null);
const [editPurchasedAt, setEditPurchasedAt] = useState("");
const [editQuantity, setEditQuantity] = useState("");
const [editListPrice, setEditListPrice] = useState("");
const [editAmountPaid, setEditAmountPaid] = useState("");
```

ฟังก์ชัน:

```ts
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
```

- [ ] **Step 2: Render action column**

ใน `<thead>` เพิ่ม `<th></th>` ท้ายแถว

ใน `<tbody>` เมื่อ `editingId === row.id` แสดง:

- วันที่: `<input type="date" value={editPurchasedAt} onChange=... />`
- ปริมาณ: `<input type="number" min="0" step="any" value={editQuantity} />` คู่กับ `symbol`
- ราคาเต็ม / เงินที่จ่าย: number inputs
- ส่วนลด: อ่านอย่างเดียวจาก `purchaseDiscount` ถ้าเงินผ่านกฎ มิฉะนั้น `"—"`
- คงเหลือหลังซื้อ / ต้นทุนเฉลี่ย: ค่าเดิมในแถวจนกว่าจะบันทึกสำเร็จ
- ชื่อวัตถุดิบและแหล่งซื้อ: ข้อความเดิม ไม่เป็น input
- ปุ่ม **บันทึก** (`saveEdit(row)`), **ยกเลิก** (`cancelEdit`) — `disabled={saving}`

เมื่อไม่ได้แก้ แสดงค่าเดิม แล้วปุ่ม **แก้ไข** (`startEdit(row)`), **ลบ** (`removePurchase(row)`) — `disabled={saving}`  
กดแก้ไขแถวใหม่ได้ทีละแถว (แค่ `setEditingId` ทับค่า)

ส่วนลดตอนแก้:

```ts
const editListNumber = Number(editListPrice);
const editPaidNumber = Number(editAmountPaid);
const editDiscount = isValidPurchaseMoney(editListNumber, editPaidNumber)
  ? purchaseDiscount(editListNumber, editPaidNumber)
  : null;
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`  
Expected: exit 0

- [ ] **Step 4: Manual UI checks after SQL is applied**

1. ซื้อสองรอบ 100/400 และ 100/450 แก้รอบสองจ่าย 500 → เฉลี่ย 4.50 คงเหลือเท่าเดิม  
2. ขายจนเหลือ 50 ลบรอบ 100 → `ลบไม่ได้ คงเหลือจะไม่พอ`  
3. ลดปริมาณรอบหนึ่งจนคงเหลือจะติดลบ → `แก้ไม่ได้ คงเหลือจะไม่พอ`  
4. ลบรอบที่ไม่กระทบของขายได้ คงเหลือและเฉลี่ยตรงชุดที่เหลือ  
5. เงินที่จ่าย > ราคาเต็มตอนแก้ในแถว → บันทึกไม่ได้ ข้อความเดียวกับฟอร์มซื้อเข้า  
6. กดลบแล้วกดยกเลิกใน confirm → แถวยังอยู่

- [ ] **Step 5: Commit**

```bash
git add src/app/purchases/page.tsx
git commit -m "$(cat <<'EOF'
Edit and delete purchase history in the table row.

EOF
)"
```

---

### Task 4: README SQL step

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add migration step**

หลังขั้นรัน `20260909110000_purchase_first_warehouse.sql` เพิ่ม:

```markdown
5. จากนั้นรันไฟล์ `supabase/migrations/20260917100000_purchase_row_edit.sql`
```

เลขขั้นถัดไป (คัดลอก URL / `.env.local`) เลื่อนเป็น 6 และ 7

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
Document the purchase edit SQL migration.

EOF
)"
```

---

## Self-review

| Spec | Plan |
|---|---|
| แก้วันที่ ปริมาณ ราคาเต็ม เงินที่จ่าย ในแถว | Task 3 |
| ส่วนลด = ราคาเต็ม − เงินที่จ่าย | Task 3 ใช้ `purchaseDiscount` |
| ลบทั้งรอบหลัง confirm | Task 3 `window.confirm` |
| คงเหลือ เฉลี่ย แพ็กล่าสุดใน transaction | Task 2 `rebuild_stock_purchases` |
| shortage → ข้อความไทยคนละประโยคตอนแก้กับลบ | Task 3 |
| ไม่แก้ชื่อ/แหล่ง ไม่ลบวัตถุดิบ | Task 2 ไม่ทับแพ็กเมื่อไม่มีรอบ, Task 3 ไม่มี input ชื่อ/แหล่ง |
| เฉลี่ยยังถ่วงน้ำหนักเท่ากัน | Task 1 + Task 2 |
| ไฟล์ migration ใหม่ | Task 2 |
| เทส 5 เคสสเปก | Task 1 ครอบคลุมคณิต, Task 2/3 เป็นตรวจมือหลังรัน SQL |

Placeholder ที่ห้ามเหลือ: ไม่มี TBD / “implementer จะรู้เอง” นอกจากหมายเหตุ sold ใน rebuild ซึ่งระบุลายเซ็นที่ถูกแล้ว
