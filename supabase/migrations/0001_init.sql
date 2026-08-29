-- ============================================================
-- posspace — migration 0001: schema inti + subscription + RLS
-- Jalankan via: supabase db push  (atau tempel di SQL Editor)
-- ============================================================

create extension if not exists pgcrypto;

-- ============ ENUMS ============
do $$ begin
  create type public.user_role as enum ('kasir', 'admin_gudang', 'pemilik');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.sub_status as enum ('pending', 'trialing', 'active', 'expired', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.inv_status as enum ('pending', 'paid', 'failed', 'expired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.movement_type as enum ('sale', 'purchase', 'adjustment', 'waste', 'opname');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_method as enum ('cash', 'qris', 'debit');
exception when duplicate_object then null; end $$;

-- ============ TABEL ============
create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null default '',
  phone text not null default '',
  currency text not null default 'IDR',
  created_at timestamptz not null default now()
);

create table if not exists public.plans (
  id text primary key,
  name text not null,
  monthly_price numeric not null,
  annual_price numeric not null,
  features jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  plan_id text not null references public.plans(id),
  status public.sub_status not null default 'pending',
  period_start timestamptz,
  period_end timestamptz,
  trial_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists subscriptions_one_active_per_shop
  on public.subscriptions (shop_id)
  where status in ('pending', 'trialing', 'active');

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  plan_id text not null references public.plans(id),
  amount numeric not null,
  billing_period text not null default 'monthly',
  merchant_order_id text not null unique,
  duitku_reference text,
  payment_url text,
  qr_string text,
  va_number text,
  status public.inv_status not null default 'pending',
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists invoices_shop_status_idx on public.invoices (shop_id, status);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  shop_id uuid references public.shops(id) on delete set null,
  full_name text not null default '',
  role public.user_role not null default 'kasir',
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  category text not null default 'Kopi',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  price numeric not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.ingredients (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  unit text not null default 'gram' check (unit in ('gram', 'ml', 'pcs')),
  stock_quantity numeric not null default 0,
  min_stock numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  quantity_required numeric not null default 0
);

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opening_cash numeric not null default 0,
  expected_cash numeric,
  actual_cash numeric,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  shift_id uuid references public.shifts(id) on delete set null,
  profile_id uuid not null references public.profiles(id),
  receipt_no text not null unique,
  total_amount numeric not null default 0,
  payment_method public.payment_method not null default 'cash',
  payment_channel text,
  payment_gateway_ref text,
  duitku_reference text,
  payment_status text not null default 'paid',
  payment_url text,
  qr_string text,
  cash_received numeric,
  change_amount numeric,
  paid_at timestamptz not null default now(),
  status text not null default 'completed',
  created_at timestamptz not null default now()
);

create table if not exists public.transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete set null,
  product_name text not null,
  quantity integer not null default 1,
  unit_price numeric not null default 0,
  line_total numeric not null default 0
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  quantity_change numeric not null,
  movement_type public.movement_type not null,
  reference_id uuid,
  note text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  supplier text not null default '',
  quantity numeric not null default 0,
  unit_price numeric not null default 0,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.stock_opnames (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  system_quantity numeric not null,
  actual_quantity numeric not null,
  difference numeric not null,
  reason text not null default '',
  status text not null default 'draft' check (status in ('draft', 'approved')),
  approved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============ SEED PLANS ============
insert into public.plans (id, name, monthly_price, annual_price, features) values
  ('starter', 'Starter', 149000, 119000, '["1 toko & 1 kasir","Kasir cepat + struk","Resep & BOM dasar","Stok real-time","Dukungan email"]'::jsonb),
  ('pro', 'Pro', 349000, 279000, '["Semua fitur Starter","3 kasir & shift bergilir","Potong stok otomatis per resep","Pembayaran QRIS/VA/e-wallet (Duitku)","Laporan HPP & laba kotor","Ekspor laporan"]'::jsonb),
  ('tumbuh', 'Tumbuh', 649000, 519000, '["Semua fitur Pro","Tanpa batas kasir","Multi-cabang & multi-gudang","API & integrasi khusus","Onboarding + pelatihan","Dukungan prioritas 24/7"]'::jsonb)
on conflict (id) do nothing;

-- ============ HELPER (keamanan) ============
create or replace function public.auth_shop_id() returns uuid
language sql stable security definer set search_path = public as $$
  select shop_id from public.profiles where id = auth.uid() limit 1;
$$;

create or replace function public.auth_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() limit 1;
$$;

-- Subscription aktif? (gate utama: tidak bisa di-bypass dari client)
create or replace function public.auth_sub_active() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.subscriptions s
    where s.shop_id = public.auth_shop_id()
      and s.status in ('active', 'trialing')
      and (s.period_end is null or s.period_end > now())
  );
$$;

-- ============ RLS ============
alter table public.shops enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.invoices enable row level security;
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.ingredients enable row level security;
alter table public.recipes enable row level security;
alter table public.shifts enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.stock_opnames enable row level security;

-- plans: publik baca
create policy "plans readable" on public.plans for select using (true);

-- shops: anggota toko bisa baca & update profil toko
create policy "shops read own" on public.shops for select using (id = public.auth_shop_id());
create policy "shops update own" on public.shops for update using (id = public.auth_shop_id());

-- profiles: baca anggota sesama toko, update sendiri
create policy "profiles read own" on public.profiles for select using (id = auth.uid());
create policy "profiles read shopmates" on public.profiles for select using (shop_id = public.auth_shop_id());
create policy "profiles update own name" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- subscription: toko bisa baca status langganannya sendiri (tidak bisa update langsung)
create policy "subs read own shop" on public.subscriptions for select using (shop_id = public.auth_shop_id());
create policy "invoices read own shop" on public.invoices for select using (shop_id = public.auth_shop_id());

-- products (menu) — scoped by shop
create policy "products read" on public.products for select using (shop_id = public.auth_shop_id());
create policy "products insert" on public.products for insert
  with check (shop_id = public.auth_shop_id() and public.auth_role() in ('pemilik', 'admin_gudang'));
create policy "products update" on public.products for update
  using (shop_id = public.auth_shop_id() and public.auth_role() in ('pemilik', 'admin_gudang'))
  with check (shop_id = public.auth_shop_id() and public.auth_role() in ('pemilik', 'admin_gudang'));
create policy "products delete" on public.products for delete
  using (shop_id = public.auth_shop_id() and public.auth_role() in ('pemilik', 'admin_gudang'));

create policy "variants read" on public.product_variants for select
  using (exists (select 1 from public.products p where p.id = product_id and p.shop_id = public.auth_shop_id()));
create policy "variants write" on public.product_variants for all
  using (exists (select 1 from public.products p where p.id = product_id and p.shop_id = public.auth_shop_id()
                 and public.auth_role() in ('pemilik', 'admin_gudang')))
  with check (exists (select 1 from public.products p where p.id = product_id and p.shop_id = public.auth_shop_id()
                 and public.auth_role() in ('pemilik', 'admin_gudang')));

-- ingredients — scoped by shop
create policy "ingredients read" on public.ingredients for select using (shop_id = public.auth_shop_id());
create policy "ingredients write" on public.ingredients for all
  using (shop_id = public.auth_shop_id() and public.auth_role() in ('pemilik', 'admin_gudang'))
  with check (shop_id = public.auth_shop_id() and public.auth_role() in ('pemilik', 'admin_gudang'));

create policy "recipes read" on public.recipes for select
  using (exists (select 1 from public.product_variants v join public.products p on p.id = v.product_id
                 where v.id = variant_id and p.shop_id = public.auth_shop_id()));
create policy "recipes write" on public.recipes for all
  using (exists (select 1 from public.product_variants v join public.products p on p.id = v.product_id
                 where v.id = variant_id and p.shop_id = public.auth_shop_id()
                 and public.auth_role() in ('pemilik', 'admin_gudang')))
  with check (exists (select 1 from public.product_variants v join public.products p on p.id = v.product_id
                 where v.id = variant_id and p.shop_id = public.auth_shop_id()
                 and public.auth_role() in ('pemilik', 'admin_gudang')));

-- shifts: kasir buka/tutup shift sendiri
create policy "shifts read" on public.shifts for select using (shop_id = public.auth_shop_id());
create policy "shifts insert" on public.shifts for insert
  with check (profile_id = auth.uid() and shop_id = public.auth_shop_id());
create policy "shifts update own" on public.shifts for update
  using (profile_id = auth.uid() and shop_id = public.auth_shop_id())
  with check (profile_id = auth.uid() and shop_id = public.auth_shop_id());

-- transactions & items: baca toko, tulis lewat fungsi atomik (RPC) saja
create policy "transactions read" on public.transactions for select using (shop_id = public.auth_shop_id());
create policy "transaction_items read" on public.transaction_items for select
  using (exists (select 1 from public.transactions t where t.id = transaction_id and t.shop_id = public.auth_shop_id()));

-- riwayat stok
create policy "movements read" on public.stock_movements for select
  using (exists (select 1 from public.ingredients i where i.id = ingredient_id and i.shop_id = public.auth_shop_id()));

-- pembelian
create policy "purchases read" on public.purchase_orders for select using (shop_id = public.auth_shop_id());
create policy "purchases insert" on public.purchase_orders for insert
  with check (shop_id = public.auth_shop_id() and public.auth_role() in ('pemilik', 'admin_gudang'));

-- opname
create policy "opnames read" on public.stock_opnames for select
  using (exists (select 1 from public.ingredients i where i.id = ingredient_id and i.shop_id = public.auth_shop_id()));
create policy "opnames insert" on public.stock_opnames for insert
  with check (exists (select 1 from public.ingredients i where i.id = ingredient_id and i.shop_id = public.auth_shop_id()
                      and public.auth_role() in ('pemilik', 'admin_gudang')));

-- ============ FUNGSI ATOMIK ============
-- Proses transaksi: simpan transaksi + item, potong stok sesuai BOM, catat riwayat.
-- Semua dalam satu transaksi database — gagal = tidak ada stok terpotong.
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
  v_ing_id uuid;
  v_need numeric;
  v_recipe record;
  v_stock numeric;
begin
  if v_shop_id is null then
    raise exception 'NOT_MEMBER';
  end if;
  if not public.auth_sub_active() then
    raise exception 'NO_ACTIVE_SUBSCRIPTION';
  end if;
  if v_profile_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  v_receipt := 'PS-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((floor(random() * 90000) + 10000)::text, 5, '0');

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
        raise exception 'INSUFFICIENT_STOCK: %', v_recipe.ingredient_id;
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

  insert into public.transactions (id, shop_id, shift_id, profile_id, receipt_no, total_amount,
    payment_method, payment_channel, payment_gateway_ref, payment_url, qr_string,
    cash_received, change_amount, paid_at, status)
  values (v_txn_id, v_shop_id, p_shift_id, v_profile_id, v_receipt, v_total,
    p_payment_method, p_payment_channel, p_payment_gateway_ref, p_payment_url, p_qr_string,
    p_cash_received, case when p_payment_method = 'cash' then p_cash_received - v_total else 0 end,
    now(), 'completed');

  return jsonb_build_object(
    'id', v_txn_id,
    'receiptNo', v_receipt,
    'total', v_total,
    'cashReceived', p_cash_received,
    'changeAmount', case when p_payment_method = 'cash' then p_cash_received - v_total else 0 end
  );
end;
$$;

-- Catat pembelian + tambah stok (atomik)
create or replace function public.record_purchase(
  p_ingredient_id uuid,
  p_supplier text,
  p_quantity numeric,
  p_unit_price numeric
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_shop_id uuid := public.auth_shop_id();
  v_po_id uuid := gen_random_uuid();
begin
  if v_shop_id is null or not public.auth_sub_active() then
    raise exception 'FORBIDDEN';
  end if;
  if not exists (select 1 from public.ingredients where id = p_ingredient_id and shop_id = v_shop_id) then
    raise exception 'NOT_FOUND';
  end if;

  update public.ingredients
    set stock_quantity = stock_quantity + p_quantity, updated_at = now()
    where id = p_ingredient_id;

  insert into public.purchase_orders (id, shop_id, ingredient_id, supplier, quantity, unit_price, received_at)
  values (v_po_id, v_shop_id, p_ingredient_id, p_supplier, p_quantity, p_unit_price, now());

  insert into public.stock_movements (ingredient_id, quantity_change, movement_type, reference_id, note)
  values (p_ingredient_id, p_quantity, 'purchase', v_po_id, 'Pembelian dari ' || coalesce(nullif(p_supplier, ''), 'Pemasok'));

  return jsonb_build_object('id', v_po_id);
end;
$$;

-- Setujui opname + koreksi selisih dengan alasan (atomik)
create or replace function public.approve_opname(
  p_opname_id uuid,
  p_reason text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_op record;
  v_diff numeric;
begin
  if public.auth_role() not in ('pemilik', 'admin_gudang') or not public.auth_sub_active() then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_op from public.stock_opnames where id = p_opname_id;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if v_op.status = 'approved' then
    return jsonb_build_object('ok', false, 'reason', 'already_approved');
  end if;

  v_diff := v_op.actual_quantity - v_op.system_quantity;

  update public.stock_opnames
    set status = 'approved', reason = p_reason, approved_by = auth.uid()
    where id = p_opname_id;

  update public.ingredients
    set stock_quantity = v_op.actual_quantity, updated_at = now()
    where id = v_op.ingredient_id;

  insert into public.stock_movements (ingredient_id, quantity_change, movement_type, reference_id, note)
  values (v_op.ingredient_id, v_diff, 'opname', p_opname_id, 'Koreksi opname: ' || coalesce(nullif(p_reason, ''), 'selisih fisik'));

  return jsonb_build_object('ok', true, 'difference', v_diff);
end;
$$;

-- Tutup shift dengan rekap kas (atomik)
create or replace function public.close_shift(p_shift_id uuid, p_actual_cash numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_shop_id uuid := public.auth_shop_id();
  v_expected numeric;
  v_row record;
begin
  if v_shop_id is null then raise exception 'FORBIDDEN'; end if;

  select * into v_row from public.shifts where id = p_shift_id and shop_id = v_shop_id and status = 'open';
  if not found then raise exception 'NOT_FOUND'; end if;

  select coalesce(sum(total_amount), 0) into v_expected
    from public.transactions where shift_id = p_shift_id;

  v_expected := v_expected + v_row.opening_cash;

  update public.shifts
    set status = 'closed', closed_at = now(), expected_cash = v_expected, actual_cash = p_actual_cash
    where id = p_shift_id;

  return jsonb_build_object('expectedCash', v_expected, 'actualCash', p_actual_cash, 'difference', p_actual_cash - v_expected);
end;
$$;

-- ============ TRIGGER: profil otomatis saat signup ============
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), 'pemilik')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ REALTIME (PRD: sync < 2 detik) ============
alter publication supabase_realtime add table public.ingredients;
alter publication supabase_realtime add table public.stock_movements;