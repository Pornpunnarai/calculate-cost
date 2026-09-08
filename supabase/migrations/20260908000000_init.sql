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

create or replace function prevent_delete_builtin_units()
returns trigger
language plpgsql
as $$
begin
  if old.is_builtin then
    raise exception 'cannot delete builtin unit';
  end if;
  return old;
end;
$$;

create trigger prevent_delete_builtin_units
before delete on units
for each row
execute function prevent_delete_builtin_units();

create policy "units_all" on units for all to anon, authenticated using (true) with check (true);
create policy "ingredients_all" on ingredients for all to anon, authenticated using (true) with check (true);
create policy "products_all" on products for all to anon, authenticated using (true) with check (true);
create policy "product_ingredients_all" on product_ingredients for all to anon, authenticated using (true) with check (true);
create policy "sales_channels_all" on sales_channels for all to anon, authenticated using (true) with check (true);
