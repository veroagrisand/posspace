-- ============================================================
-- posspace — migration 0002: perbaiki process_transaction
-- (parent transaction harus dibuat sebelum transaction_items)
-- ============================================================

create or replace function public.process_transaction(
  p_shift_id uuid,
  p_payment_method public.payment_method,
  p_payment_channel text default null,
  p_payment_gateway_ref text default null,
  p_payment_url text default null,
  p_qr_string text default null,
  p_cash_received numeric default null,
  p_items jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_shop_id uuid := public.auth_shop_id();
  v_profile_id uuid := auth.uid();
  v_txn_id uuid := gen_random_uuid();
  v_receipt text;
  v_total numeric := 0;
  v_item jsonb;
  v_variant_id uuid;
  v_qty integer;
  v_price numeric;
  v_variant_name text;
  v_product_name text;
  v_need numeric;
  v_recipe record;
  v_stock numeric;
begin
  if v_shop_id is null then
    raise exception 'NOT_MEMBER';
  end if;
  if v_profile_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;
  if not public.auth_sub_active() then
    raise exception 'NO_ACTIVE_SUBSCRIPTION';
  end if;

  v_receipt := 'PS-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((floor(random() * 90000) + 10000)::text, 5, '0');

  -- 1) Parent transaction dibuat terlebih dahulu (FK aman)
  insert into public.transactions (id, shop_id, shift_id, profile_id, receipt_no, total_amount,
    payment_method, payment_channel, payment_gateway_ref, payment_url, qr_string,
    cash_received, change_amount, paid_at, status)
  values (v_txn_id, v_shop_id, p_shift_id, v_profile_id, v_receipt, 0,
    p_payment_method, p_payment_channel, p_payment_gateway_ref, p_payment_url, p_qr_string,
    p_cash_received, case when p_payment_method = 'cash' then coalesce(p_cash_received, 0) else 0 end,
    now(), 'completed');

  -- 2) Item + potong stok sesuai BOM
  if p_items is not null then
    for v_item in select * from jsonb_array_elements(p_items) loop
      v_variant_id := (v_item->>'variantId')::uuid;
      v_qty := (v_item->>'qty')::int;

      select v.name, v.price, p.name into v_variant_name, v_price, v_product_name
        from public.product_variants v
        join public.products p on p.id = v.product_id
        where v.id = v_variant_id and p.shop_id = v_shop_id;

      if not found then
        raise exception 'INVALID_VARIANT';
      end if;

      v_total := v_total + (v_price * v_qty);

      -- potong stok bahan sesuai resep, kunci baris agar atomik
      for v_recipe in
        select r.ingredient_id, r.quantity_required
        from public.recipes r
        where r.variant_id = v_variant_id
      loop
        v_need := v_recipe.quantity_required * v_qty;
        select i.stock_quantity into v_stock
        from public.ingredients i
        where i.id = v_recipe.ingredient_id and i.shop_id = v_shop_id
        for update;

        if not found then
          raise exception 'MISSING_INGREDIENT';
        end if;
        if v_stock < v_need then
          raise exception 'INSUFFICIENT_STOCK';
        end if;

        update public.ingredients
          set stock_quantity = stock_quantity - v_need, updated_at = now()
          where id = v_recipe.ingredient_id;

        insert into public.stock_movements (ingredient_id, quantity_change, movement_type, reference_id, note)
        values (v_recipe.ingredient_id, -v_need, 'sale', v_txn_id, 'Penjualan ' || v_receipt);
      end loop;

      insert into public.transaction_items (transaction_id, variant_id, product_name, quantity, unit_price, line_total)
      values (v_txn_id, v_variant_id, v_product_name, v_qty, v_price, v_price * v_qty);
    end loop;
  end if;

  -- 3) Update total
  update public.transactions set total_amount = v_total where id = v_txn_id;

  return jsonb_build_object(
    'id', v_txn_id,
    'receiptNo', v_receipt,
    'total', v_total,
    'cashReceived', p_cash_received,
    'changeAmount', case when p_payment_method = 'cash' then coalesce(p_cash_received, 0) - v_total else 0 end
  );
end;
$$;