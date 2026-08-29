-- ============================================================
-- posspace — migration 0004: OTP email + transaksi pembayaran digital
-- 1) tabel otp_codes (verifikasi OTP registrasi via email Hostinger)
-- 2) process_transaction mendukung status PENDING (tunggu pembayaran)
-- 3) RPC confirm_payment: potong stok saat pembayaran terkonfirmasi
-- ============================================================

-- ============ 1) OTP ============
create table if not exists public.otp_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  purpose text not null default 'register',
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  used boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists otp_codes_email_idx on public.otp_codes (email, purpose, created_at desc);

-- Hanya diakses via server (service role) — klien tidak boleh baca/tulis.
alter table public.otp_codes enable row level security;

-- Kolom gateway pada invoice (nusapay/duitku) untuk pelacakan pembayaran
alter table public.invoices
  add column if not exists payment_channel text;

-- Transaksi pending (menunggu pembayaran digital) belum punya paid_at
alter table public.transactions alter column paid_at drop not null;

-- ============ 2) process_transaction: dukung status pending ============
-- p_payment_status='pending' → transaksi dicatat TANPA potong stok,
-- menunggu konfirmasi pembayaran (webhook Nusapay) lalu confirm_payment()
-- yang memotong stok secara atomik.
create or replace function public.process_transaction(
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

  v_receipt := 'PS-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((floor(random() * 90000) + 10000)::text, 5, '0');

  -- 1) Parent transaction dibuat terlebih dahulu (FK aman)
  insert into public.transactions (id, shop_id, shift_id, profile_id, receipt_no, total_amount,
    payment_method, payment_channel, payment_gateway_ref, payment_url, qr_string,
    cash_received, change_amount, paid_at, payment_status, status)
  values (v_txn_id, v_shop_id, p_shift_id, v_profile_id, v_receipt, 0,
    p_payment_method, p_payment_channel, p_payment_gateway_ref, p_payment_url, p_qr_string,
    p_cash_received, case when p_payment_method = 'cash' then coalesce(p_cash_received, 0) else 0 end,
    case when v_pending then null else now() end,
    case when v_pending then 'pending' else 'paid' end,
    case when v_pending then 'pending' else 'completed' end);

  -- 2) Item + potong stok sesuai BOM (hanya jika langsung lunas)
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

      if not v_pending then
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
      end if;

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
    'status', case when v_pending then 'pending' else 'completed' end,
    'cashReceived', p_cash_received,
    'changeAmount', case when p_payment_method = 'cash' then coalesce(p_cash_received, 0) - v_total else 0 end
  );
end;
$$;

-- ============ 3) confirm_payment: potong stok saat bayar terkonfirmasi ============
-- Dipanggil server saat webhook Nusapay PAID / polling sukses.
-- Idempoten: transaksi sudah completed → tidak dipotong dua kali.

-- Helper internal: inti logika potong stok (dipakai kedua RPC di bawah)
create or replace function public._confirm_payment(p_transaction_id uuid, p_shop_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_row record;
  v_item record;
  v_recipe record;
  v_need numeric;
  v_stock numeric;
begin
  select * into v_row from public.transactions
    where id = p_transaction_id and shop_id = p_shop_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_row.status = 'completed' then
    return jsonb_build_object('ok', true, 'alreadyCompleted', true);
  end if;

  -- Potong stok sesuai BOM, kunci baris agar atomik
  for v_item in
    select variant_id, quantity from public.transaction_items
    where transaction_id = p_transaction_id
  loop
    if v_item.variant_id is null then continue; end if;
    for v_recipe in
      select r.ingredient_id, r.quantity_required
      from public.recipes r
      where r.variant_id = v_item.variant_id
    loop
      v_need := v_recipe.quantity_required * v_item.quantity;
      select i.stock_quantity into v_stock
      from public.ingredients i
      where i.id = v_recipe.ingredient_id and i.shop_id = p_shop_id
      for update;

      if not found then raise exception 'MISSING_INGREDIENT'; end if;
      if v_stock < v_need then raise exception 'INSUFFICIENT_STOCK'; end if;

      update public.ingredients
        set stock_quantity = stock_quantity - v_need, updated_at = now()
        where id = v_recipe.ingredient_id;

      insert into public.stock_movements (ingredient_id, quantity_change, movement_type, reference_id, note)
      values (v_recipe.ingredient_id, -v_need, 'sale', p_transaction_id, 'Penjualan ' || v_row.receipt_no);
    end loop;
  end loop;

  update public.transactions
    set status = 'completed', payment_status = 'paid', paid_at = coalesce(paid_at, now())
    where id = p_transaction_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- Jalur terautentikasi (kasir/pemilik via sesi, RLS aktif)
create or replace function public.confirm_payment(p_transaction_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_shop_id uuid := public.auth_shop_id();
begin
  if v_shop_id is null then raise exception 'NOT_MEMBER'; end if;
  if not public.auth_sub_active() then raise exception 'NO_ACTIVE_SUBSCRIPTION'; end if;
  return public._confirm_payment(p_transaction_id, v_shop_id);
end;
$$;

-- Jalur webhook (service role, auth.uid() kosong) — pemilik ditentukan eksplisit.
-- Service role TIDAK memanggil fungsi ini langsung dari klien; hanya dari server.
create or replace function public.confirm_payment_as_owner(p_transaction_id uuid, p_owner_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_shop_id uuid;
begin
  select shop_id into v_shop_id from public.profiles where id = p_owner_id;
  if v_shop_id is null then raise exception 'NOT_MEMBER'; end if;
  if not exists (
    select 1 from public.subscriptions s
    where s.shop_id = v_shop_id and s.status in ('active', 'trialing')
      and (s.period_end is null or s.period_end > now())
  ) then
    raise exception 'NO_ACTIVE_SUBSCRIPTION';
  end if;
  return public._confirm_payment(p_transaction_id, v_shop_id);
end;
$$;