# Menu Cost Calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Thai-language Next.js app that stores units, ingredients, products, and sales channels in Supabase, then calculates product cost from purchase packs and net profit per channel GP%.

**Architecture:** Next.js App Router talks to Supabase from the browser. Costing is pure TypeScript (no stored totals). Four pages: วัตถุดิบ first, then เมนู, หน่วย, ช่องทางขาย. Deploy on Netlify.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, `@supabase/supabase-js`, Vitest, Netlify Next.js runtime.

## Global Constraints

- UI language is Thai; currency is บาท
- Display money with round-half-up to 2 decimal places only after summing; never round per line then add
- Do not store computed cost in the database
- Recipe quantity uses the ingredient's `purchase_unit_id`; no unit conversion
- No login, no categories, no inventory, no tax reports, no purchasing, no printing
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Never commit `.env.local`
- Selling price is optional; show cost first, then the field labeled `อยากขายเท่าไหร่`
- Cannot create a product until at least one ingredient exists
- Builtin units `g`, `ml`, `ชิ้น` cannot be deleted
- Duplicate ingredient names are allowed; duplicate channel names are not
- Same ingredient may appear in many products but only once per product

## File structure

- `package.json` — scripts `dev`, `build`, `start`, `test`
- `tsconfig.json`, `next.config.ts`, `next-env.d.ts`
- `vitest.config.ts`
- `netlify.toml`
- `.gitignore`, `.env.example`
- `README.md` — Supabase + Netlify setup
- `supabase/migrations/20260908000000_init.sql` — tables, seed units, RLS
- `src/lib/money.ts` — `roundHalfUp`, `formatBaht`
- `src/lib/costing.ts` — `unitCost`, `lineCost`, `productCost`, `channelProfit`
- `src/lib/validation.ts` — input and business-rule helpers
- `src/lib/types.ts` — DB row types
- `src/lib/supabase/client.ts` — browser client
- `src/lib/money.test.ts`, `src/lib/costing.test.ts`, `src/lib/validation.test.ts`
- `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx`
- `src/components/nav.tsx`, `src/components/error-banner.tsx`
- `src/app/units/page.tsx`
- `src/app/ingredients/page.tsx`
- `src/app/channels/page.tsx`
- `src/app/products/page.tsx`, `src/app/products/product-form.tsx`

---

### Task 1: Scaffold Next.js + Vitest

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`

**Interfaces:**
- Consumes: nothing (empty repo except `docs/`)
- Produces: `npm test` and `npm run dev` work; app route `/` renders

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "calculate-cost",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "next": "^15.5.2",
    "react": "^19.1.1",
    "react-dom": "^19.1.1",
    "@supabase/supabase-js": "^2.57.4"
  },
  "devDependencies": {
    "@types/node": "^22.18.0",
    "@types/react": "^19.1.12",
    "@types/react-dom": "^19.1.9",
    "typescript": "^5.9.2",
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `next.config.ts`, `vitest.config.ts`, `.gitignore`, `.env.example`**

`next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
```

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

`.gitignore`:

```
node_modules
.next
.env.local
.DS_Store
```

`.env.example`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

- [ ] **Step 4: Create placeholder app files**

`src/app/globals.css`:

```css
:root {
  color: #1a1a1a;
  background: #f6f5f2;
  font-family: "Sarabun", "Noto Sans Thai", sans-serif;
  line-height: 1.5;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

a {
  color: inherit;
}
```

`src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "คิดต้นทุนเมนู",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
```

`src/app/page.tsx`:

```tsx
export default function HomePage() {
  return <p>คิดต้นทุนเมนู</p>;
}
```

- [ ] **Step 5: Install dependencies and verify**

Run: `npm install`

Expected: `package-lock.json` created, no errors.

Run: `npx tsc --noEmit`

Expected: may fail until `next-env.d.ts` exists. If missing, create `next-env.d.ts`:

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

Run: `npm test`

Expected: Vitest reports no test files (exit 1 or 0 depending on version). If it fails with "No test files found", add this to `vitest.config.ts` `test` object: `passWithNoTests: true`. Re-run `npm test` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git init
git add package.json package-lock.json tsconfig.json next.config.ts vitest.config.ts .gitignore .env.example src/app/layout.tsx src/app/page.tsx src/app/globals.css next-env.d.ts
git commit -m "$(cat <<'EOF'
chore: scaffold Next.js app with Vitest

EOF
)"
```

---

### Task 2: Money rounding and display

**Files:**
- Create: `src/lib/money.ts`
- Test: `src/lib/money.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `roundHalfUp(value: number, digits?: number): number` (default digits 2); `formatBaht(value: number): string` returning two decimal digits, e.g. `"10.50"`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/money.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatBaht, roundHalfUp } from "./money";

describe("roundHalfUp", () => {
  it("rounds 10.5 to 10.50 scale as 10.5", () => {
    expect(roundHalfUp(10.5)).toBe(10.5);
  });

  it("rounds 1.225 to 1.23", () => {
    expect(roundHalfUp(1.225)).toBe(1.23);
  });

  it("rounds 1.224 to 1.22", () => {
    expect(roundHalfUp(1.224)).toBe(1.22);
  });
});

describe("formatBaht", () => {
  it("formats 10.5 as 10.50", () => {
    expect(formatBaht(10.5)).toBe("10.50");
  });

  it("formats 45.4 as 45.40", () => {
    expect(formatBaht(45.4)).toBe("45.40");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/money.test.ts`

Expected: FAIL with `Cannot find module './money'`

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/money.ts`:

```ts
export function roundHalfUp(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.floor(value * factor + 0.5) / factor;
}

export function formatBaht(value: number): string {
  return roundHalfUp(value).toFixed(2);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/money.test.ts`

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/money.ts src/lib/money.test.ts
git commit -m "$(cat <<'EOF'
feat: add half-up baht rounding and display format

EOF
)"
```

---

### Task 3: Costing engine

**Files:**
- Create: `src/lib/costing.ts`
- Test: `src/lib/costing.test.ts`

**Interfaces:**
- Consumes: `roundHalfUp`, `formatBaht` from `src/lib/money.ts`
- Produces:
  - `export type IngredientCostInput = { purchasePrice: number; purchaseQuantity: number }`
  - `export function unitCost(ingredient: IngredientCostInput): number`
  - `export function lineCost(ingredient: IngredientCostInput, quantity: number): number`
  - `export function productCost(lines: Array<{ ingredient: IngredientCostInput; quantity: number }>): number`
  - `export type ChannelProfit = { channelFee: number; netReceived: number; netProfit: number }`
  - `export function channelProfit(sellingPrice: number | null, productCostValue: number, feePercent: number): ChannelProfit | null`
  - Display uses `formatBaht` on the **summed** values only

- [ ] **Step 1: Write the failing tests**

Create `src/lib/costing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatBaht } from "./money";
import {
  channelProfit,
  lineCost,
  productCost,
  unitCost,
} from "./costing";

const matcha = { purchasePrice: 350, purchaseQuantity: 100 };

describe("unitCost", () => {
  it("is purchase price divided by purchase quantity", () => {
    expect(unitCost(matcha)).toBe(3.5);
  });
});

describe("lineCost", () => {
  it("Matcha 100g/350 used 3g costs 10.50", () => {
    expect(formatBaht(lineCost(matcha, 3))).toBe("10.50");
  });
});

describe("productCost", () => {
  it("sums multiple lines without rounding each line first", () => {
    const milk = { purchasePrice: 70, purchaseQuantity: 1000 };
    const syrup = { purchasePrice: 80, purchaseQuantity: 750 };
    const cost = productCost([
      { ingredient: matcha, quantity: 3 },
      { ingredient: milk, quantity: 150 },
      { ingredient: syrup, quantity: 10 },
    ]);
    expect(formatBaht(cost)).toBe("22.07");
  });

  it("is 0 when the recipe is empty", () => {
    expect(productCost([])).toBe(0);
  });

  it("updates when purchase price changes", () => {
    const before = productCost([{ ingredient: matcha, quantity: 3 }]);
    const after = productCost([
      { ingredient: { purchasePrice: 400, purchaseQuantity: 100 }, quantity: 3 },
    ]);
    expect(before).not.toBe(after);
    expect(formatBaht(after)).toBe("12.00");
  });
});

describe("channelProfit", () => {
  it("returns null when selling price is missing", () => {
    expect(channelProfit(null, 25, 12)).toBeNull();
  });

  it("sell 80 GP 12% cost 25 => fee 9.60 received 70.40 profit 45.40", () => {
    const result = channelProfit(80, 25, 12);
    expect(result).not.toBeNull();
    expect(formatBaht(result!.channelFee)).toBe("9.60");
    expect(formatBaht(result!.netReceived)).toBe("70.40");
    expect(formatBaht(result!.netProfit)).toBe("45.40");
  });

  it("GP 0% received equals selling price", () => {
    const result = channelProfit(80, 25, 0);
    expect(result).not.toBeNull();
    expect(formatBaht(result!.channelFee)).toBe("0.00");
    expect(formatBaht(result!.netReceived)).toBe("80.00");
    expect(formatBaht(result!.netProfit)).toBe("55.00");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/costing.test.ts`

Expected: FAIL with `Cannot find module './costing'`

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/costing.ts`:

```ts
export type IngredientCostInput = {
  purchasePrice: number;
  purchaseQuantity: number;
};

export function unitCost(ingredient: IngredientCostInput): number {
  return ingredient.purchasePrice / ingredient.purchaseQuantity;
}

export function lineCost(
  ingredient: IngredientCostInput,
  quantity: number,
): number {
  return unitCost(ingredient) * quantity;
}

export function productCost(
  lines: Array<{ ingredient: IngredientCostInput; quantity: number }>,
): number {
  return lines.reduce(
    (sum, line) => sum + lineCost(line.ingredient, line.quantity),
    0,
  );
}

export type ChannelProfit = {
  channelFee: number;
  netReceived: number;
  netProfit: number;
};

export function channelProfit(
  sellingPrice: number | null,
  productCostValue: number,
  feePercent: number,
): ChannelProfit | null {
  if (sellingPrice === null) {
    return null;
  }
  const channelFee = sellingPrice * (feePercent / 100);
  const netReceived = sellingPrice - channelFee;
  const netProfit = netReceived - productCostValue;
  return { channelFee, netReceived, netProfit };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/costing.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/costing.ts src/lib/costing.test.ts
git commit -m "$(cat <<'EOF'
feat: calculate product cost and channel net profit

EOF
)"
```

---

### Task 4: Validation helpers

**Files:**
- Create: `src/lib/validation.ts`
- Test: `src/lib/validation.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `export function isPositiveNumber(value: number): boolean` — true iff finite and `> 0`
  - `export function isValidFeePercent(value: number): boolean` — true iff finite and `0 <= value <= 100`
  - `export function parseOptionalSellingPrice(raw: string): { ok: true; value: number | null } | { ok: false }` — trim; empty → `{ ok: true, value: null }`; otherwise parse number; `ok: true` only if `> 0`
  - `export function canDeleteUnit(isBuiltin: boolean, ingredientCountUsingUnit: number): boolean` — false if builtin or count > 0
  - `export function canDeleteIngredient(productCountUsingIngredient: number): boolean` — false if count > 0
  - `export function canCreateProduct(ingredientCount: number): boolean` — true iff count >= 1
  - `export function canChangeIngredientUnit(productCountUsingIngredient: number): boolean` — true iff count === 0
  - `export function parsePositiveQuantity(raw: string): number | null`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/validation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  canChangeIngredientUnit,
  canCreateProduct,
  canDeleteIngredient,
  canDeleteUnit,
  isPositiveNumber,
  isValidFeePercent,
  parseOptionalSellingPrice,
  parsePositiveQuantity,
} from "./validation";

describe("isPositiveNumber", () => {
  it("rejects 0 and negatives", () => {
    expect(isPositiveNumber(0)).toBe(false);
    expect(isPositiveNumber(-1)).toBe(false);
    expect(isPositiveNumber(0.01)).toBe(true);
  });
});

describe("isValidFeePercent", () => {
  it("allows 0 and 100 inclusive", () => {
    expect(isValidFeePercent(0)).toBe(true);
    expect(isValidFeePercent(12)).toBe(true);
    expect(isValidFeePercent(100)).toBe(true);
    expect(isValidFeePercent(-1)).toBe(false);
    expect(isValidFeePercent(101)).toBe(false);
  });
});

describe("parseOptionalSellingPrice", () => {
  it("empty means not set yet", () => {
    expect(parseOptionalSellingPrice("")).toEqual({ ok: true, value: null });
    expect(parseOptionalSellingPrice("   ")).toEqual({ ok: true, value: null });
  });

  it("rejects zero and negative", () => {
    expect(parseOptionalSellingPrice("0")).toEqual({ ok: false });
    expect(parseOptionalSellingPrice("-5")).toEqual({ ok: false });
  });

  it("accepts 80", () => {
    expect(parseOptionalSellingPrice("80")).toEqual({ ok: true, value: 80 });
  });
});

describe("delete and create rules", () => {
  it("cannot delete builtin units", () => {
    expect(canDeleteUnit(true, 0)).toBe(false);
  });

  it("cannot delete a unit still used by ingredients", () => {
    expect(canDeleteUnit(false, 1)).toBe(false);
    expect(canDeleteUnit(false, 0)).toBe(true);
  });

  it("cannot delete an ingredient used by a product", () => {
    expect(canDeleteIngredient(1)).toBe(false);
    expect(canDeleteIngredient(0)).toBe(true);
  });

  it("cannot create a product with zero ingredients in the catalog", () => {
    expect(canCreateProduct(0)).toBe(false);
    expect(canCreateProduct(10)).toBe(true);
  });

  it("cannot change ingredient unit when a product uses it", () => {
    expect(canChangeIngredientUnit(1)).toBe(false);
    expect(canChangeIngredientUnit(0)).toBe(true);
  });
});

describe("parsePositiveQuantity", () => {
  it("parses 3 g usage", () => {
    expect(parsePositiveQuantity("3")).toBe(3);
    expect(parsePositiveQuantity("0")).toBeNull();
    expect(parsePositiveQuantity("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/validation.test.ts`

Expected: FAIL with `Cannot find module './validation'`

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/validation.ts`:

```ts
export function isPositiveNumber(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function isValidFeePercent(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

export function parseOptionalSellingPrice(
  raw: string,
): { ok: true; value: number | null } | { ok: false } {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: true, value: null };
  }
  const value = Number(trimmed);
  if (!isPositiveNumber(value)) {
    return { ok: false };
  }
  return { ok: true, value };
}

export function canDeleteUnit(
  isBuiltin: boolean,
  ingredientCountUsingUnit: number,
): boolean {
  return !isBuiltin && ingredientCountUsingUnit === 0;
}

export function canDeleteIngredient(
  productCountUsingIngredient: number,
): boolean {
  return productCountUsingIngredient === 0;
}

export function canCreateProduct(ingredientCount: number): boolean {
  return ingredientCount >= 1;
}

export function canChangeIngredientUnit(
  productCountUsingIngredient: number,
): boolean {
  return productCountUsingIngredient === 0;
}

export function parsePositiveQuantity(raw: string): number | null {
  const value = Number(raw.trim());
  return isPositiveNumber(value) ? value : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/validation.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation.ts src/lib/validation.test.ts
git commit -m "$(cat <<'EOF'
feat: add form and business-rule validation helpers

EOF
)"
```

---

### Task 5: Types, SQL schema, and Supabase client

**Files:**
- Create: `src/lib/types.ts`
- Create: `src/lib/supabase/client.ts`
- Create: `supabase/migrations/20260908000000_init.sql`
- Create: `README.md`

**Interfaces:**
- Consumes: env `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Produces: types `Unit`, `Ingredient`, `Product`, `ProductIngredient`, `SalesChannel`; `createBrowserClient()` returning a typed Supabase client; SQL that creates all five tables, seeds three builtin units, enables RLS with anon+authenticated full access for v1

- [ ] **Step 1: Create `src/lib/types.ts`**

```ts
export type Unit = {
  id: string;
  name: string;
  symbol: string;
  is_builtin: boolean;
  created_at: string;
};

export type Ingredient = {
  id: string;
  name: string;
  purchase_quantity: number;
  purchase_unit_id: string;
  purchase_price: number;
  created_at: string;
  updated_at: string;
};

export type Product = {
  id: string;
  name: string;
  selling_price: number | null;
  created_at: string;
  updated_at: string;
};

export type ProductIngredient = {
  id: string;
  product_id: string;
  ingredient_id: string;
  quantity: number;
};

export type SalesChannel = {
  id: string;
  name: string;
  fee_percent: number;
  created_at: string;
};

export type IngredientWithUnit = Ingredient & { unit: Unit };
```

- [ ] **Step 2: Create `src/lib/supabase/client.ts`**

```ts
import { createClient } from "@supabase/supabase-js";

export function createBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  return createClient(url, anonKey);
}

export function asNumber(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}
```

`asNumber` exists because Postgres `numeric` often arrives as string from Supabase.

- [ ] **Step 3: Create `supabase/migrations/20260908000000_init.sql`**

```sql
create table units (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  symbol text not null unique,
  is_builtin boolean not null default false,
  created_at timestamptz not null default now()
);

create table ingredients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  purchase_quantity numeric not null check (purchase_quantity > 0),
  purchase_unit_id uuid not null references units (id),
  purchase_price numeric not null check (purchase_price > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  selling_price numeric null check (selling_price is null or selling_price > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table product_ingredients (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  ingredient_id uuid not null references ingredients (id) on delete restrict,
  quantity numeric not null check (quantity > 0),
  unique (product_id, ingredient_id)
);

create table sales_channels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  fee_percent numeric not null check (fee_percent >= 0 and fee_percent <= 100),
  created_at timestamptz not null default now()
);

insert into units (name, symbol, is_builtin) values
  ('กรัม', 'g', true),
  ('มิลลิลิตร', 'ml', true),
  ('ชิ้น', 'ชิ้น', true);

alter table units enable row level security;
alter table ingredients enable row level security;
alter table products enable row level security;
alter table product_ingredients enable row level security;
alter table sales_channels enable row level security;

create policy "units_all" on units for all to anon, authenticated using (true) with check (true);
create policy "ingredients_all" on ingredients for all to anon, authenticated using (true) with check (true);
create policy "products_all" on products for all to anon, authenticated using (true) with check (true);
create policy "product_ingredients_all" on product_ingredients for all to anon, authenticated using (true) with check (true);
create policy "sales_channels_all" on sales_channels for all to anon, authenticated using (true) with check (true);
```

- [ ] **Step 4: Create `README.md`**

```markdown
# คิดต้นทุนเมนู

## ตั้งค่า Supabase

1. สร้างโปรเจกต์ใหม่ที่ https://supabase.com
2. เปิด SQL Editor แล้วรันไฟล์ `supabase/migrations/20260908000000_init.sql`
3. คัดลอก Project URL และ anon key
4. สร้าง `.env.local` จาก `.env.example` แล้วใส่ค่าจริง

## รันบนเครื่อง

```bash
npm install
npm test
npm run dev
```

เปิด http://localhost:3000

## Deploy บน Netlify

1. เชื่อม Git repo กับ Netlify
2. Build command: `npm run build`
3. ใส่ `NEXT_PUBLIC_SUPABASE_URL` และ `NEXT_PUBLIC_SUPABASE_ANON_KEY` ใน Site environment variables
```

- [ ] **Step 5: Verify SQL by inspection and TypeScript**

Run: `npx tsc --noEmit`

Expected: PASS (no type errors)

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/supabase/client.ts supabase/migrations/20260908000000_init.sql README.md
git commit -m "$(cat <<'EOF'
feat: add Supabase schema, types, and browser client

EOF
)"
```

---

### Task 6: App shell and navigation

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/page.tsx`
- Create: `src/components/nav.tsx`
- Create: `src/components/error-banner.tsx`

**Interfaces:**
- Consumes: nothing
- Produces: site nav links `/ingredients` (label `วัตถุดิบ`), `/products` (`เมนู`), `/units` (`หน่วย`), `/channels` (`ช่องทางขาย`); `/` redirects to `/ingredients`; `ErrorBanner` accepts `{ message: string }`

- [ ] **Step 1: Replace `src/components/nav.tsx`**

```tsx
import Link from "next/link";

const links = [
  { href: "/ingredients", label: "วัตถุดิบ" },
  { href: "/products", label: "เมนู" },
  { href: "/units", label: "หน่วย" },
  { href: "/channels", label: "ช่องทางขาย" },
];

export function Nav() {
  return (
    <header className="site-header">
      <p className="site-title">คิดต้นทุนเมนู</p>
      <nav>
        {links.map((link) => (
          <Link key={link.href} href={link.href}>
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
```

- [ ] **Step 2: Create `src/components/error-banner.tsx`**

```tsx
export function ErrorBanner({ message }: { message: string }) {
  return <p className="error-banner">{message}</p>;
}
```

- [ ] **Step 3: Update layout, home redirect, and CSS**

`src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Nav } from "@/components/nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "คิดต้นทุนเมนู",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body>
        <Nav />
        <main className="page">{children}</main>
      </body>
    </html>
  );
}
```

`src/app/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/ingredients");
}
```

Append to `src/app/globals.css`:

```css
.site-header {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: baseline;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #ddd;
  background: #fff;
}

.site-title {
  margin: 0;
  font-weight: 700;
}

.site-header nav {
  display: flex;
  gap: 1rem;
}

.page {
  max-width: 52rem;
  margin: 0 auto;
  padding: 1.5rem;
}

h1 {
  font-size: 1.5rem;
  margin-top: 0;
}

label {
  display: block;
  margin: 0.75rem 0 0.25rem;
}

input,
select,
button {
  font: inherit;
}

input,
select {
  width: 100%;
  max-width: 24rem;
  padding: 0.4rem 0.5rem;
}

button {
  margin-top: 0.75rem;
  padding: 0.45rem 0.8rem;
  cursor: pointer;
}

table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
}

th,
td {
  text-align: left;
  padding: 0.5rem;
  border-bottom: 1px solid #e5e5e5;
}

.cost-hero {
  font-size: 1.75rem;
  font-weight: 700;
  margin: 1rem 0;
}

.error-banner {
  color: #8b1e1e;
  background: #f8e4e4;
  padding: 0.75rem 1rem;
}

.muted {
  color: #555;
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`

Expected: PASS. `/ingredients` does not exist yet; that is OK because Next does not typecheck missing routes.

- [ ] **Step 5: Commit**

```bash
git add src/components/nav.tsx src/components/error-banner.tsx src/app/layout.tsx src/app/page.tsx src/app/globals.css
git commit -m "$(cat <<'EOF'
feat: add Thai app shell and primary navigation

EOF
)"
```

---

### Task 7: Units page

**Files:**
- Create: `src/app/units/page.tsx`

**Interfaces:**
- Consumes: `createBrowserClient`, `Unit`, `canDeleteUnit`, `ErrorBanner`
- Produces: client page that lists units, inserts `{ name, symbol, is_builtin: false }`, refuses delete when `is_builtin` or the unit is referenced by ingredients

This page is a Client Component because it talks to Supabase in the browser.

- [ ] **Step 1: Create `src/app/units/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { ErrorBanner } from "@/components/error-banner";
import { createBrowserClient } from "@/lib/supabase/client";
import type { Unit } from "@/lib/types";
import { canDeleteUnit } from "@/lib/validation";

export default function UnitsPage() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setError("");
    const supabase = createBrowserClient();
    const { data, error: loadError } = await supabase
      .from("units")
      .select("*")
      .order("created_at");
    if (loadError) {
      setError("โหลดหน่วยไม่สำเร็จ");
      return;
    }
    setUnits((data ?? []) as Unit[]);
  }

  useEffect(() => {
    void load();
  }, []);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!name.trim() || !symbol.trim()) {
      setError("กรอกชื่อและสัญลักษณ์หน่วย");
      return;
    }
    const supabase = createBrowserClient();
    const { error: insertError } = await supabase.from("units").insert({
      name: name.trim(),
      symbol: symbol.trim(),
      is_builtin: false,
    });
    if (insertError) {
      setError("บันทึกไม่สำเร็จ");
      return;
    }
    setName("");
    setSymbol("");
    await load();
  }

  async function onDelete(unit: Unit) {
    setError("");
    const supabase = createBrowserClient();
    const { count, error: countError } = await supabase
      .from("ingredients")
      .select("id", { count: "exact", head: true })
      .eq("purchase_unit_id", unit.id);
    if (countError) {
      setError("ลบไม่สำเร็จ");
      return;
    }
    if (!canDeleteUnit(unit.is_builtin, count ?? 0)) {
      setError(
        unit.is_builtin
          ? "ลบหน่วยระบบไม่ได้"
          : "ลบไม่ได้ เพราะมีวัตถุดิบใช้หน่วยนี้อยู่",
      );
      return;
    }
    const { error: deleteError } = await supabase
      .from("units")
      .delete()
      .eq("id", unit.id);
    if (deleteError) {
      setError("ลบไม่สำเร็จ");
      return;
    }
    await load();
  }

  return (
    <section>
      <h1>หน่วย</h1>
      {error ? <ErrorBanner message={error} /> : null}
      <form onSubmit={onSubmit}>
        <label htmlFor="unit-name">ชื่อ</label>
        <input
          id="unit-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <label htmlFor="unit-symbol">สัญลักษณ์</label>
        <input
          id="unit-symbol"
          value={symbol}
          onChange={(event) => setSymbol(event.target.value)}
          placeholder="อัน, ใบ, แก้ว"
        />
        <button type="submit">เพิ่มหน่วย</button>
      </form>
      <table>
        <thead>
          <tr>
            <th>ชื่อ</th>
            <th>สัญลักษณ์</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {units.map((unit) => (
            <tr key={unit.id}>
              <td>{unit.name}</td>
              <td>{unit.symbol}</td>
              <td>
                <button type="button" onClick={() => void onDelete(unit)}>
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`

Expected: PASS

- [ ] **Step 3: Manual check after `.env.local` exists**

Run: `npm run dev` and open `/units`. Expected: seed rows กรัม/`g`, มิลลิลิตร/`ml`, ชิ้น/`ชิ้น`. Adding `แก้ว` appears in the list. Deleting `g` shows `ลบหน่วยระบบไม่ได้`.

If `.env.local` is missing, the page may throw; that is acceptable until the human creates a Supabase project. Do not commit secrets.

- [ ] **Step 4: Commit**

```bash
git add src/app/units/page.tsx
git commit -m "$(cat <<'EOF'
feat: manage measurement units including custom symbols

EOF
)"
```

---

### Task 8: Ingredients page

**Files:**
- Create: `src/app/ingredients/page.tsx`

**Interfaces:**
- Consumes: `createBrowserClient`, `asNumber`, `Unit`, `Ingredient`, `unitCost`, `formatBaht`, `isPositiveNumber`, `canDeleteIngredient`, `canChangeIngredientUnit`
- Produces: catalog CRUD; form fields ชื่อ, ปริมาณที่ซื้อ, หน่วย, ราคาแพ็ก; list shows computed unit cost; cannot delete if `product_ingredients` references it; unit select disabled when the ingredient is used in a recipe

- [ ] **Step 1: Create `src/app/ingredients/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { ErrorBanner } from "@/components/error-banner";
import { unitCost } from "@/lib/costing";
import { formatBaht } from "@/lib/money";
import { asNumber, createBrowserClient } from "@/lib/supabase/client";
import type { Ingredient, Unit } from "@/lib/types";
import {
  canChangeIngredientUnit,
  canDeleteIngredient,
  isPositiveNumber,
} from "@/lib/validation";

type IngredientRow = Ingredient & { unit: Unit };

export default function IngredientsPage() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [items, setItems] = useState<IngredientRow[]>([]);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitId, setUnitId] = useState("");
  const [price, setPrice] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [usedIds, setUsedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  async function load() {
    setError("");
    const supabase = createBrowserClient();
    const [unitsRes, ingredientsRes, usedRes] = await Promise.all([
      supabase.from("units").select("*").order("created_at"),
      supabase
        .from("ingredients")
        .select("*, unit:units(*)")
        .order("created_at"),
      supabase.from("product_ingredients").select("ingredient_id"),
    ]);
    if (unitsRes.error || ingredientsRes.error || usedRes.error) {
      setError("โหลดวัตถุดิบไม่สำเร็จ");
      return;
    }
    const unitList = (unitsRes.data ?? []) as Unit[];
    setUnits(unitList);
    if (!unitId && unitList[0]) {
      setUnitId(unitList[0].id);
    }
    setItems(
      (ingredientsRes.data ?? []).map((row) => ({
        ...row,
        purchase_quantity: asNumber(row.purchase_quantity),
        purchase_price: asNumber(row.purchase_price),
      })) as IngredientRow[],
    );
    setUsedIds(
      new Set(
        ((usedRes.data ?? []) as { ingredient_id: string }[]).map(
          (row) => row.ingredient_id,
        ),
      ),
    );
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetForm() {
    setName("");
    setQuantity("");
    setPrice("");
    setEditingId(null);
    if (units[0]) {
      setUnitId(units[0].id);
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const purchaseQuantity = Number(quantity);
    const purchasePrice = Number(price);
    if (!name.trim() || !isPositiveNumber(purchaseQuantity) || !isPositiveNumber(purchasePrice) || !unitId) {
      setError("กรอกชื่อ ปริมาณ และราคาให้มากกว่า 0");
      return;
    }
    const supabase = createBrowserClient();
    if (editingId) {
      const used = usedIds.has(editingId);
      if (!canChangeIngredientUnit(used ? 1 : 0)) {
        const current = items.find((item) => item.id === editingId);
        if (current && current.purchase_unit_id !== unitId) {
          setError("แก้หน่วยไม่ได้ เพราะมีเมนูใช้วัตถุดิบนี้อยู่");
          return;
        }
      }
      const { error: updateError } = await supabase
        .from("ingredients")
        .update({
          name: name.trim(),
          purchase_quantity: purchaseQuantity,
          purchase_unit_id: unitId,
          purchase_price: purchasePrice,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingId);
      if (updateError) {
        setError("บันทึกไม่สำเร็จ");
        return;
      }
    } else {
      const { error: insertError } = await supabase.from("ingredients").insert({
        name: name.trim(),
        purchase_quantity: purchaseQuantity,
        purchase_unit_id: unitId,
        purchase_price: purchasePrice,
      });
      if (insertError) {
        setError("บันทึกไม่สำเร็จ");
        return;
      }
    }
    resetForm();
    await load();
  }

  async function onDelete(item: IngredientRow) {
    setError("");
    const supabase = createBrowserClient();
    const { count, error: countError } = await supabase
      .from("product_ingredients")
      .select("id", { count: "exact", head: true })
      .eq("ingredient_id", item.id);
    if (countError) {
      setError("ลบไม่สำเร็จ");
      return;
    }
    if (!canDeleteIngredient(count ?? 0)) {
      setError("ลบไม่ได้ เพราะมีเมนูใช้วัตถุดิบนี้อยู่");
      return;
    }
    const { error: deleteError } = await supabase
      .from("ingredients")
      .delete()
      .eq("id", item.id);
    if (deleteError) {
      setError("ลบไม่สำเร็จ");
      return;
    }
    await load();
  }

  function startEdit(item: IngredientRow) {
    setEditingId(item.id);
    setName(item.name);
    setQuantity(String(item.purchase_quantity));
    setPrice(String(item.purchase_price));
    setUnitId(item.purchase_unit_id);
  }

  const unitLocked = editingId ? usedIds.has(editingId) : false;

  return (
    <section>
      <h1>วัตถุดิบ</h1>
      <p className="muted">เพิ่มของที่ซื้อมาให้ครบก่อน แล้วค่อยไปสร้างเมนู</p>
      {error ? <ErrorBanner message={error} /> : null}
      <form onSubmit={onSubmit}>
        <label htmlFor="ing-name">ชื่อ</label>
        <input
          id="ing-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <label htmlFor="ing-qty">ปริมาณที่ซื้อ</label>
        <input
          id="ing-qty"
          inputMode="decimal"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
        />
        <label htmlFor="ing-unit">หน่วย</label>
        <select
          id="ing-unit"
          value={unitId}
          disabled={unitLocked}
          onChange={(event) => setUnitId(event.target.value)}
        >
          {units.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name} ({unit.symbol})
            </option>
          ))}
        </select>
        <label htmlFor="ing-price">ราคาแพ็ก (บาท)</label>
        <input
          id="ing-price"
          inputMode="decimal"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
        />
        <button type="submit">{editingId ? "บันทึกการแก้" : "เพิ่มวัตถุดิบ"}</button>
        {editingId ? (
          <button type="button" onClick={resetForm}>
            ยกเลิก
          </button>
        ) : null}
      </form>
      <table>
        <thead>
          <tr>
            <th>ชื่อ</th>
            <th>แพ็กที่ซื้อ</th>
            <th>ต้นทุนต่อหน่วย</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.name}</td>
              <td>
                {item.purchase_quantity} {item.unit.symbol} / {formatBaht(item.purchase_price)} บาท
              </td>
              <td>
                {formatBaht(
                  unitCost({
                    purchasePrice: item.purchase_price,
                    purchaseQuantity: item.purchase_quantity,
                  }),
                )}{" "}
                บาท/{item.unit.symbol}
              </td>
              <td>
                <button type="button" onClick={() => startEdit(item)}>
                  แก้
                </button>
                <button type="button" onClick={() => void onDelete(item)}>
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`

Expected: PASS. If Supabase embed `unit:units(*)` types as an array, cast `unit` as `Unit` when mapping.

- [ ] **Step 3: Commit**

```bash
git add src/app/ingredients/page.tsx
git commit -m "$(cat <<'EOF'
feat: add ingredient catalog from purchase packs

EOF
)"
```

---

### Task 9: Sales channels page

**Files:**
- Create: `src/app/channels/page.tsx`

**Interfaces:**
- Consumes: `createBrowserClient`, `asNumber`, `SalesChannel`, `isValidFeePercent`
- Produces: list/create/delete channels; `fee_percent` stored as 12 meaning 12%; unique name errors show `บันทึกไม่สำเร็จ`

- [ ] **Step 1: Create `src/app/channels/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { ErrorBanner } from "@/components/error-banner";
import { asNumber, createBrowserClient } from "@/lib/supabase/client";
import type { SalesChannel } from "@/lib/types";
import { isValidFeePercent } from "@/lib/validation";

export default function ChannelsPage() {
  const [channels, setChannels] = useState<SalesChannel[]>([]);
  const [name, setName] = useState("");
  const [fee, setFee] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setError("");
    const supabase = createBrowserClient();
    const { data, error: loadError } = await supabase
      .from("sales_channels")
      .select("*")
      .order("created_at");
    if (loadError) {
      setError("โหลดช่องทางขายไม่สำเร็จ");
      return;
    }
    setChannels(
      (data ?? []).map((row) => ({
        ...row,
        fee_percent: asNumber(row.fee_percent),
      })) as SalesChannel[],
    );
  }

  useEffect(() => {
    void load();
  }, []);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const feePercent = Number(fee);
    if (!name.trim() || !isValidFeePercent(feePercent)) {
      setError("กรอกชื่อ และ GP% ระหว่าง 0 ถึง 100");
      return;
    }
    const supabase = createBrowserClient();
    const { error: insertError } = await supabase.from("sales_channels").insert({
      name: name.trim(),
      fee_percent: feePercent,
    });
    if (insertError) {
      setError("บันทึกไม่สำเร็จ");
      return;
    }
    setName("");
    setFee("");
    await load();
  }

  async function onDelete(id: string) {
    setError("");
    const supabase = createBrowserClient();
    const { error: deleteError } = await supabase
      .from("sales_channels")
      .delete()
      .eq("id", id);
    if (deleteError) {
      setError("ลบไม่สำเร็จ");
      return;
    }
    await load();
  }

  return (
    <section>
      <h1>ช่องทางขาย</h1>
      {error ? <ErrorBanner message={error} /> : null}
      <form onSubmit={onSubmit}>
        <label htmlFor="ch-name">ชื่อช่องทาง</label>
        <input
          id="ch-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Shopee"
        />
        <label htmlFor="ch-fee">GP (%)</label>
        <input
          id="ch-fee"
          inputMode="decimal"
          value={fee}
          onChange={(event) => setFee(event.target.value)}
          placeholder="12"
        />
        <button type="submit">เพิ่มช่องทาง</button>
      </form>
      <table>
        <thead>
          <tr>
            <th>ชื่อ</th>
            <th>GP</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {channels.map((channel) => (
            <tr key={channel.id}>
              <td>{channel.name}</td>
              <td>{channel.fee_percent}%</td>
              <td>
                <button type="button" onClick={() => void onDelete(channel.id)}>
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/channels/page.tsx
git commit -m "$(cat <<'EOF'
feat: add sales channels with GP percent

EOF
)"
```

---

### Task 10: Products list and recipe form

**Files:**
- Create: `src/app/products/page.tsx`
- Create: `src/app/products/product-form.tsx`

**Interfaces:**
- Consumes: `canCreateProduct`, `parseOptionalSellingPrice`, `parsePositiveQuantity`, `productCost`, `channelProfit`, `lineCost`, `unitCost`, `formatBaht`, `asNumber`, `createBrowserClient`, types `Product`, `Ingredient`, `Unit`, `SalesChannel`, `ProductIngredient`
- Produces: product list showing name + cost first, `ยังไม่ตั้งราคา` when `selling_price` is null; form order: name → recipe lines from catalog → cost hero → `อยากขายเท่าไหร่` → per-channel profit table only when selling price and at least one channel exist; block create when catalog is empty with a link to `/ingredients`; unique ingredient per product in the form (dropdown omits already-selected ids)

- [ ] **Step 1: Create `src/app/products/product-form.tsx`**

```tsx
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
```

- [ ] **Step 2: Create `src/app/products/page.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ErrorBanner } from "@/components/error-banner";
import { ProductForm } from "@/app/products/product-form";
import { productCost } from "@/lib/costing";
import { formatBaht } from "@/lib/money";
import { asNumber, createBrowserClient } from "@/lib/supabase/client";
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
      (ingRes.data ?? []).map((row) => ({
        ...row,
        purchase_quantity: asNumber(row.purchase_quantity),
        purchase_price: asNumber(row.purchase_price),
      })) as IngredientRow[],
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
    const supabase = createBrowserClient();
    const { error: deleteError } = await supabase.from("products").delete().eq("id", id);
    if (deleteError) {
      setError("ลบไม่สำเร็จ");
      return;
    }
    await load();
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
```

- [ ] **Step 3: Run unit tests and typecheck**

Run: `npm test`

Expected: PASS (money, costing, validation)

Run: `npx tsc --noEmit`

Expected: PASS

- [ ] **Step 4: Manual flow (requires `.env.local`)**

1. Add 10 ingredients on `/ingredients`
2. Open `/products` — create is enabled
3. Create a menu selecting ingredients and quantities — cost hero updates before selling price
4. Leave selling price empty — save succeeds — list shows `ยังไม่ตั้งราคา`
5. Edit, set อยากขายเท่าไหร่ to 80, with Shopee 12% — table shows 9.60 / 70.40 / 45.40 when cost is 25
6. Try deleting a used ingredient — blocked

- [ ] **Step 5: Commit**

```bash
git add src/app/products/page.tsx src/app/products/product-form.tsx
git commit -m "$(cat <<'EOF'
feat: build menus from ingredient catalog with live cost

EOF
)"
```

---

### Task 11: Netlify config

**Files:**
- Create: `netlify.toml`
- Modify: `README.md` (already describes Netlify; add the toml pointer)

**Interfaces:**
- Consumes: Next.js build
- Produces: Netlify uses Next.js runtime; env vars documented

- [ ] **Step 1: Create `netlify.toml`**

```toml
[build]
  command = "npm run build"
  publish = ".next"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

- [ ] **Step 2: Install the Netlify Next.js plugin as a dev dependency**

Run: `npm install -D @netlify/plugin-nextjs`

Expected: `package.json` and lockfile update.

- [ ] **Step 3: Add a one-line pointer in README.md after the Deploy heading**

Insert: `ไฟล์ `netlify.toml` กำหนด build command และ Next.js runtime ให้แล้ว`

- [ ] **Step 4: Commit**

```bash
git add netlify.toml package.json package-lock.json README.md
git commit -m "$(cat <<'EOF'
chore: configure Netlify Next.js deployment

EOF
)"
```

---

## Self-review

**Spec coverage**
- Units including custom + builtin undeletable → Task 7
- Ingredient pack cost → Task 8
- Products from catalog, cost-first, optional selling price → Task 10
- Channels GP% and per-channel profit → Tasks 3, 9, 10
- Empty catalog blocks products → Task 10 + `canCreateProduct`
- No stored costs → Task 3/5
- SQL + RLS v1 open → Task 5
- Netlify + env vars → Tasks 1, 5, 11
- Tests for spec numeric examples → Tasks 2–4
- Cannot delete used ingredient/unit → Tasks 4, 7, 8
- No login/tax/print → not built

**Placeholder scan:** none remaining; costing multi-line expected value is `22.07` not `21.57`.

**Type consistency:** `unitCost` / `lineCost` / `productCost` / `channelProfit` / `formatBaht` / `canCreateProduct` / `canDeleteUnit` / `canDeleteIngredient` / `canChangeIngredientUnit` / `parseOptionalSellingPrice` / `parsePositiveQuantity` / `asNumber` / `createBrowserClient` names match across tasks.
