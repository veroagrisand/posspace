-- ============================================================
-- posspace — migration 0016: pengaturan printer struk per toko
-- Dipakai wizard setup pemilik saat login pertama setelah
-- langganan aktif. printer_type: webusb | browser | agent
-- ============================================================

create table if not exists public.shop_printer_settings (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  printer_type text not null default 'browser',
  paper_width text not null default '80',
  agent_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shop_printer_settings enable row level security;

-- Semua anggota toko boleh membaca pengaturan printer.
create policy shop_printer_settings_select on public.shop_printer_settings
  for select
  using (shop_id = public.auth_shop_id());

-- Hanya pemilik yang boleh membuat/mengubah pengaturan printer.
create policy shop_printer_settings_insert on public.shop_printer_settings
  for insert
  with check (shop_id = public.auth_shop_id() and public.auth_role() = 'pemilik');

create policy shop_printer_settings_update on public.shop_printer_settings
  for update
  using (shop_id = public.auth_shop_id() and public.auth_role() = 'pemilik');

notify pgrst, 'reload schema';