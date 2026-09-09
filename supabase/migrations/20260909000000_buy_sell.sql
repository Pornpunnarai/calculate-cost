alter table ingredients
  add column remaining_quantity numeric not null default 0 check (remaining_quantity >= 0);

create table stock_purchases (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references ingredients (id) on delete restrict,
  quantity numeric not null check (quantity > 0),
  amount_paid numeric not null check (amount_paid > 0),
  remaining_after numeric not null check (remaining_after >= 0),
  unit_cost_after numeric not null check (unit_cost_after > 0),
  created_at timestamptz not null default now()
);

create table stock_sales (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete restrict,
  sales_channel_id uuid not null references sales_channels (id) on delete restrict,
  quantity numeric not null check (quantity > 0),
  selling_price_each numeric not null check (selling_price_each > 0),
  fee_percent numeric not null check (fee_percent >= 0 and fee_percent <= 100),
  product_cost_each numeric not null check (product_cost_each >= 0),
  created_at timestamptz not null default now()
);

alter table stock_purchases enable row level security;
alter table stock_sales enable row level security;

create policy "stock_purchases_all" on stock_purchases for all to anon, authenticated using (true) with check (true);
create policy "stock_sales_all" on stock_sales for all to anon, authenticated using (true) with check (true);

create or replace function record_stock_purchase(
  p_ingredient_id uuid,
  p_quantity numeric,
  p_amount_paid numeric
)
returns stock_purchases
language plpgsql
as $$
declare
  v_remaining numeric;
  v_avg numeric;
  v_row stock_purchases;
begin
  if p_quantity <= 0 or p_amount_paid <= 0 then
    raise exception 'quantity and amount must be positive';
  end if;

  select remaining_quantity into v_remaining
  from ingredients
  where id = p_ingredient_id
  for update;

  if not found then
    raise exception 'ingredient not found';
  end if;

  v_remaining := v_remaining + p_quantity;

  select avg(amount_paid / quantity) into v_avg
  from (
    select amount_paid, quantity from stock_purchases where ingredient_id = p_ingredient_id
    union all
    select p_amount_paid, p_quantity
  ) as rounds;

  update ingredients
  set remaining_quantity = v_remaining,
      updated_at = now()
  where id = p_ingredient_id;

  insert into stock_purchases (
    ingredient_id, quantity, amount_paid, remaining_after, unit_cost_after
  ) values (
    p_ingredient_id, p_quantity, p_amount_paid, v_remaining, v_avg
  ) returning * into v_row;

  return v_row;
end;
$$;

create or replace function record_stock_sale(
  p_product_id uuid,
  p_sales_channel_id uuid,
  p_quantity numeric,
  p_selling_price_each numeric,
  p_fee_percent numeric,
  p_product_cost_each numeric
)
returns jsonb
language plpgsql
as $$
declare
  v_need numeric;
  v_have numeric;
  v_name text;
  v_symbol text;
  v_shortages jsonb := '[]'::jsonb;
  v_line record;
  v_sale stock_sales;
begin
  if p_quantity <= 0 then
    raise exception 'quantity must be positive';
  end if;

  for v_line in
    select
      pi.ingredient_id,
      pi.quantity as recipe_qty,
      i.remaining_quantity,
      i.name,
      u.symbol
    from product_ingredients pi
    join ingredients i on i.id = pi.ingredient_id
    join units u on u.id = i.purchase_unit_id
    where pi.product_id = p_product_id
    order by pi.ingredient_id
    for update of i
  loop
    v_need := v_line.recipe_qty * p_quantity;
    v_have := v_line.remaining_quantity;
    if v_have < v_need then
      v_shortages := v_shortages || jsonb_build_array(
        jsonb_build_object(
          'ingredientId', v_line.ingredient_id,
          'name', v_line.name,
          'symbol', v_line.symbol,
          'have', v_have,
          'need', v_need
        )
      );
    end if;
  end loop;

  if jsonb_array_length(v_shortages) > 0 then
    return jsonb_build_object('ok', false, 'shortages', v_shortages);
  end if;

  for v_line in
    select pi.ingredient_id, pi.quantity as recipe_qty
    from product_ingredients pi
    where pi.product_id = p_product_id
  loop
    update ingredients
    set remaining_quantity = remaining_quantity - (v_line.recipe_qty * p_quantity),
        updated_at = now()
    where id = v_line.ingredient_id;
  end loop;

  insert into stock_sales (
    product_id, sales_channel_id, quantity,
    selling_price_each, fee_percent, product_cost_each
  ) values (
    p_product_id, p_sales_channel_id, p_quantity,
    p_selling_price_each, p_fee_percent, p_product_cost_each
  ) returning * into v_sale;

  return jsonb_build_object('ok', true, 'sale', to_jsonb(v_sale));
end;
$$;

grant execute on function record_stock_purchase(uuid, numeric, numeric) to anon, authenticated;
grant execute on function record_stock_sale(uuid, uuid, numeric, numeric, numeric, numeric) to anon, authenticated;
