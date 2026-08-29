-- ============================================================
-- posspace — migration 0003: HPP bahan baku + platform admin
-- 1) cost_per_unit pada ingredients (dasar hitung HPP dari resep)
-- 2) tabel platform_admins (akses khusus owner SaaS)
-- 3) indeks untuk dashboard admin lintas toko
-- ============================================================

-- ============ 1) HPP: harga modal per satuan bahan ============
alter table public.ingredients
  add column if not exists cost_per_unit numeric not null default 0;

-- Perbaiki record_purchase: hitung ulang cost_per_unit rata-rata tertimbang
-- agar HPP dari resep selalu akurat mengikuti harga pembelian terakhir.
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
    set stock_quantity = stock_quantity + p_quantity,
        cost_per_unit = case
          when stock_quantity + p_quantity = 0 then cost_per_unit
          else round(((stock_quantity * cost_per_unit) + (p_quantity * p_unit_price)) / (stock_quantity + p_quantity), 2)
        end,
        updated_at = now()
    where id = p_ingredient_id;

  insert into public.purchase_orders (id, shop_id, ingredient_id, supplier, quantity, unit_price, received_at)
  values (v_po_id, v_shop_id, p_ingredient_id, p_supplier, p_quantity, p_unit_price, now());

  insert into public.stock_movements (ingredient_id, quantity_change, movement_type, reference_id, note)
  values (p_ingredient_id, p_quantity, 'purchase', v_po_id, 'Pembelian dari ' || coalesce(nullif(p_supplier, ''), 'Pemasok'));

  return jsonb_build_object('id', v_po_id);
end;
$$;

-- ============ 2) Platform admin (owner SaaS) ============
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

-- Admin hanya bisa membaca barisnya sendiri (guard server yang memutuskan).
create policy "platform admins read own" on public.platform_admins
  for select using (user_id = auth.uid());

-- ============ 3) Indeks dashboard admin lintas toko ============
create index if not exists transactions_shop_created_idx
  on public.transactions (shop_id, created_at desc);
create index if not exists transactions_created_idx
  on public.transactions (created_at desc);
create index if not exists profiles_shop_idx
  on public.profiles (shop_id);
create index if not exists subscriptions_shop_idx
  on public.subscriptions (shop_id, status);
create index if not exists ingredients_shop_idx
  on public.ingredients (shop_id);