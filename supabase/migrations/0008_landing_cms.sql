-- ============================================================
-- CMS landing page + harga paket + voucher diskon (admin SaaS)
-- ============================================================

-- Konten landing page (single-row, id=1)
create table if not exists public.landing_content (
  id integer primary key default 1 check (id = 1),
  content jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.landing_content enable row level security;

-- Landing page publik: siapa pun boleh membaca (konten tampilan umum).
-- Penulisan hanya lewat service role (endpoint admin).
-- (drop if exists: idempotent — migrasi ini pernah di-apply sebagian di remote)
drop policy if exists "landing_content read all" on public.landing_content;
create policy "landing_content read all"
  on public.landing_content for select
  using (true);

-- Voucher diskon yang dibuat admin SaaS
create table if not exists public.vouchers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  type text not null check (type in ('percent', 'fixed')),
  value numeric not null check (value > 0),
  max_uses int not null default 0 check (max_uses >= 0), -- 0 = tanpa batas
  used_count int not null default 0,
  valid_from timestamptz,
  valid_until timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.vouchers enable row level security;

-- Voucher dikelola via service role saja (endpoint admin).
drop policy if exists "vouchers read all" on public.vouchers;
create policy "vouchers read all"
  on public.vouchers for select
  using (true);

-- Invoice: dukung pemakaian voucher (diskon)
alter table public.invoices
  add column if not exists voucher_id uuid references public.vouchers(id) on delete set null,
  add column if not exists discount_amount numeric not null default 0;