-- ============================================================
-- posspace — migration 0017: HPP historis per item transaksi
-- transaction_items.unit_cost dibekukan SAAT penjualan, sehingga
-- laporan HPP/laba tidak berubah retroaktif ketika harga beli
-- (cost_per_unit) diubah pemilik nantinya.
-- ============================================================

alter table public.transaction_items
  add column if not exists unit_cost numeric not null default 0;

create or replace function private.process_transaction(
  p_shift_id uuid,
  p_payment_method public.payment_method,
  p_payment_channel text default null,
  p_payment_gateway_ref text default null,
  p_payment_url text default null,
  p_qr_string text default null,
  p_cash_received numeric default null,
  p_items jsonb default null,
  p_payment_status text default 'completed'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_shop_id uuid := public.auth_shop_id();
  v_profile_id uuid := auth.uid();
  v_txn_id uuid := gen_random_uuid();
  v_receipt text;
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_item jsonb;
  v_variant_id uuid;
  v_qty integer;
  v_price numeric;
  v_unit_cost numeric := 0;
  v_variant_name text;
  v_product_name text;
  v_need numeric;
  v_recipe record;
  v_stock numeric;
  v_cost numeric;
  v_pending boolean := p_payment_status = 'pending';
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

  -- shift harus milik toko ini
  if p_shift_id is not null and not exists (
    select 1 from public.shifts where id = p_shift_id and shop_id = v_shop_id
  ) then
    raise exception 'INVALID_SHIFT';
  end if;

  v_receipt := 'PS-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((floor(random() * 90000) + 10000)::text, 5, '0');

  -- 1) Parent transaction dibuat terlebih dahulu (FK aman)
  insert into public.transactions (id, shop_id, shift_id, profile_id, receipt_no, total_amount,
    payment_method, payment_channel, payment_gateway_ref, payment_url, qr_string,
    cash_received, change_amount, paid_at, payment_status, status)
  values (v_txn_id, v_shop_id, p_shift_id, v_profile_id, v_receipt, 0,
    p_payment_method, p_payment_channel, p_payment_gateway_ref, p_payment_url, p_qr_string,
    p_cash_received, 0,
    case when v_pending then null else now() end,
    case when v_pending then 'pending' else 'paid' end,
    case when v_pending then 'pending' else 'completed' end);

  -- 2) Item + potong stok sesuai BOM + beku-kan HPP (unit_cost)
  if p_items is not null then
    for v_item in select * from jsonb_array_elements(p_items) loop
      v_variant_id := (v_item->>'variantId')::uuid;
      v_qty := (v_item->>'qty')::int;

      -- validasi input: jumlah harus positif & masuk akal
      if v_variant_id is null or v_qty is null or v_qty <= 0 or v_qty > 999 then
        raise exception 'INVALID_QUANTITY';
      end if;

      select v.name, v.price, p.name into v_variant_name, v_price, v_product_name
        from public.product_variants v
        join public.products p on p.id = v.product_id
        where v.id = v_variant_id and p.shop_id = v_shop_id;

      if not found then
        raise exception 'INVALID_VARIANT';
      end if;
      if v_price < 0 then
        raise exception 'INVALID_PRICE';
      end if;

      v_subtotal := v_subtotal + (v_price * v_qty);

      -- HPP per unit dihitung dari resep × harga modal saat itu (selalu,
      -- termasuk transaksi pending), lalu stok dipotong hanya jika lunas.
      v_unit_cost := 0;
      for v_recipe in
        select r.ingredient_id, r.quantity_required
        from public.recipes r
        where r.variant_id = v_variant_id
      loop
        if v_recipe.quantity_required <= 0 then
          raise exception 'INVALID_RECIPE';
        end if;
        v_need := v_recipe.quantity_required * v_qty;

        select i.stock_quantity, i.cost_per_unit into v_stock, v_cost
          from public.ingredients i
          where i.id = v_recipe.ingredient_id and i.shop_id = v_shop_id
          for update;

        if not found then
          raise exception 'MISSING_INGREDIENT';
        end if;

        v_unit_cost := v_unit_cost + v_recipe.quantity_required * coalesce(v_cost, 0);

        if not v_pending then
          if v_stock < v_need then
            raise exception 'INSUFFICIENT_STOCK';
          end if;

          update public.ingredients
            set stock_quantity = stock_quantity - v_need, updated_at = now()
            where id = v_recipe.ingredient_id;

          insert into public.stock_movements (ingredient_id, quantity_change, movement_type, reference_id, note)
          values (v_recipe.ingredient_id, -v_need, 'sale', v_txn_id, 'Penjualan ' || v_receipt);
        end if;
      end loop;

      insert into public.transaction_items (transaction_id, variant_id, product_name, quantity, unit_price, line_total, unit_cost)
      values (v_txn_id, v_variant_id, v_product_name, v_qty, v_price, v_price * v_qty, round(v_unit_cost, 2));
    end loop;
  end if;

  -- 3) Pajak & layanan 10% (pembulatan sama dengan tampilan kasir),
  --    total + pastikan pembayaran cash mencukupi, simpan kembalian benar
  v_tax := round(v_subtotal * 0.10);
  v_total := v_subtotal + v_tax;

  if p_payment_method = 'cash' and coalesce(p_cash_received, 0) < v_total then
    raise exception 'INSUFFICIENT_CASH';
  end if;

  update public.transactions
    set total_amount = v_total,
        change_amount = case when p_payment_method = 'cash' then coalesce(p_cash_received, 0) - v_total else 0 end
    where id = v_txn_id;

  return jsonb_build_object(
    'id', v_txn_id,
    'receiptNo', v_receipt,
    'subtotal', v_subtotal,
    'tax', v_tax,
    'total', v_total,
    'status', case when v_pending then 'pending' else 'completed' end,
    'cashReceived', p_cash_received,
    'changeAmount', case when p_payment_method = 'cash' then coalesce(p_cash_received, 0) - v_total else 0 end
  );
end;
$$;

-- Backfill transaksi lama: HPP dihitung dari harga modal & resep saat ini
-- (perkiraan terbaik untuk data sebelum migration ini).
update public.transaction_items ti
  set unit_cost = round(coalesce(c.cost, 0), 2)
  from (
    select r.variant_id, sum(r.quantity_required * coalesce(i.cost_per_unit, 0)) as cost
    from public.recipes r
    left join public.ingredients i on i.id = r.ingredient_id
    group by r.variant_id
  ) c
  where ti.variant_id = c.variant_id
    and ti.unit_cost = 0
    and c.cost > 0;

notify pgrst, 'reload schema';