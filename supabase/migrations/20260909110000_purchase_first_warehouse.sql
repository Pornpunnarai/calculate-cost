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
