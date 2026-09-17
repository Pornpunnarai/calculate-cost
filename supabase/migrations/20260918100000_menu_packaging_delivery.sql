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

create or replace function products_delivery_package_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_is_pkg boolean;
begin
  if new.delivery_package_id is not null and new.delivery_package_id = new.id then
    raise exception 'delivery_package_id cannot reference the same product';
  end if;

  if new.is_delivery_package and new.delivery_package_id is not null then
    raise exception 'delivery package cannot reference another package';
  end if;

  if new.delivery_package_id is not null then
    select is_delivery_package into v_is_pkg
    from products
    where id = new.delivery_package_id
    for share;

    if not found or v_is_pkg is not true then
      raise exception 'delivery_package_id must reference a delivery package';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists products_delivery_package_guard on products;
create trigger products_delivery_package_guard
before insert or update on products
for each row
execute function products_delivery_package_guard();

create or replace function record_stock_sale(
  p_product_id uuid,
  p_sales_channel_id uuid,
  p_quantity numeric,
  p_selling_price_each numeric,
  p_fee_percent numeric,
  p_product_cost_each numeric,
  p_fulfillment text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_product products%rowtype;
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

  if p_fulfillment is null or p_fulfillment not in ('dine_in', 'delivery') then
    raise exception 'fulfillment must be dine_in or delivery';
  end if;

  select * into v_product
  from products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'product not found';
  end if;

  if v_product.is_delivery_package then
    return jsonb_build_object('ok', false);
  end if;

  if p_fulfillment = 'delivery' and v_product.delivery_package_id is null then
    return jsonb_build_object('ok', false);
  end if;

  for v_line in
    select
      n.ingredient_id,
      n.need,
      i.remaining_quantity,
      i.name,
      u.symbol
    from (
      select
        pi.ingredient_id,
        sum(pi.quantity) * p_quantity as need
      from product_ingredients pi
      where pi.product_id = p_product_id
         or (
           p_fulfillment = 'delivery'
           and pi.product_id = v_product.delivery_package_id
         )
      group by pi.ingredient_id
    ) n
    join ingredients i on i.id = n.ingredient_id
    join units u on u.id = i.purchase_unit_id
    order by n.ingredient_id
    for update of i
  loop
    v_need := v_line.need;
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
    select
      pi.ingredient_id,
      sum(pi.quantity) * p_quantity as need
    from product_ingredients pi
    where pi.product_id = p_product_id
       or (
         p_fulfillment = 'delivery'
         and pi.product_id = v_product.delivery_package_id
       )
    group by pi.ingredient_id
  loop
    update ingredients
    set remaining_quantity = remaining_quantity - v_line.need,
        updated_at = now()
    where id = v_line.ingredient_id;
  end loop;

  insert into stock_sales (
    product_id, sales_channel_id, quantity,
    selling_price_each, fee_percent, product_cost_each,
    fulfillment
  ) values (
    p_product_id, p_sales_channel_id, p_quantity,
    p_selling_price_each, p_fee_percent, p_product_cost_each,
    p_fulfillment
  ) returning * into v_sale;

  return jsonb_build_object('ok', true, 'sale', to_jsonb(v_sale));
end;
$$;

grant execute on function record_stock_sale(uuid, uuid, numeric, numeric, numeric, numeric, text)
  to anon, authenticated;

drop function if exists record_stock_sale(uuid, uuid, numeric, numeric, numeric, numeric);
