create or replace function rebuild_stock_purchases(
  p_ingredient_id uuid,
  p_sold numeric
)
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
begin
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
    set remaining_quantity = v_qty_sum - p_sold,
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

  perform rebuild_stock_purchases(v_ingredient_id, v_sold);
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
  perform rebuild_stock_purchases(v_ingredient_id, v_sold);
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function update_stock_purchase(uuid, date, numeric, numeric, numeric)
  to anon, authenticated;
grant execute on function delete_stock_purchase(uuid)
  to anon, authenticated;
