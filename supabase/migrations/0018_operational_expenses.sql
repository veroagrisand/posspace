-- ============================================================
-- posspace — migration 0018: beban operasional (listrik, air,
-- internet, sewa, gaji, dll) untuk laporan laba BERSIH.
-- Laba bersih = omzet − HPP (dari resep) − beban operasional.
-- ============================================================

create table if not exists public.operational_expenses (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  category text not null,
  amount numeric not null default 0 check (amount >= 0),
  note text not null default '',
  expense_date date not null default current_date,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint operational_expenses_category_check
    check (category in ('listrik', 'air', 'internet', 'sewa', 'gas', 'kebersihan', 'gaji', 'lainnya'))
);

create index if not exists operational_expenses_shop_date_idx
  on public.operational_expenses (shop_id, expense_date desc);

alter table public.operational_expenses enable row level security;

-- Baca: semua anggota toko.
create policy "expenses read shopmates" on public.operational_expenses
  for select using (shop_id = public.auth_shop_id());

-- Catat: semua anggota toko (pemilik mengisi; kasir juga boleh mencatat).
create policy "expenses insert members" on public.operational_expenses
  for insert with check (shop_id = public.auth_shop_id());

-- Ubah/hapus: hanya pemilik.
create policy "expenses update owner" on public.operational_expenses
  for update using (shop_id = public.auth_shop_id() and public.auth_role() = 'pemilik');

create policy "expenses delete owner" on public.operational_expenses
  for delete using (shop_id = public.auth_shop_id() and public.auth_role() = 'pemilik');

notify pgrst, 'reload schema';