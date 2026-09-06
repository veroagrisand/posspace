-- ============================================================
-- posspace — migration 0021: performa & retensi otomatis
-- 1) Index untuk tabel yang tumbuh per transaksi (transaction_items,
--    stock_movements) — query dashboard/laporan owner tidak lagi
--    melakukan seq scan saat data penjualan menumpuk.
-- 2) Jalur purge access_logs untuk service_role (scheduler internal
--    API gateway) — retensi otomatis tanpa melemahkan fungsi
--    purge admin yang sudah ada (tetap butuh is_platform_admin).
-- ============================================================

-- ============ 1) Index performa ============
-- RLS & join transaction_items memfilter via transaction_id (tabel
-- dengan pertumbuhan tercepat: N baris per transaksi).
create index if not exists transaction_items_transaction_idx
  on public.transaction_items (transaction_id);

-- RLS movements read (exists ingredients shop) + sort created_at desc
-- (store memuat 50 terbaru; tanpa index ini = seq scan + sort).
create index if not exists stock_movements_ingredient_created_idx
  on public.stock_movements (ingredient_id, created_at desc);

-- Laporan penjualan memfilter & mengurutkan paid_at per toko.
create index if not exists transactions_shop_paid_idx
  on public.transactions (shop_id, paid_at desc);

-- ============ 2) Retensi otomatis access_logs (cron internal) ============
-- Implementasi khusus service_role: tanpa cek is_platform_admin (sesi
-- service role tidak punya auth.uid()). Schema private tidak diekspos
-- PostgREST, jadi sediakan wrapper public dengan grant minimum.
create or replace function private.purge_access_logs_cron(p_days integer) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_count integer;
begin
  if p_days is null or p_days < 1 or p_days > 3650 then
    raise exception 'INVALID_DAYS';
  end if;

  delete from public.access_logs
  where created_at < now() - (p_days || ' days')::interval;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function private.purge_access_logs_cron(integer) from public, anon, authenticated, service_role;
grant execute on function private.purge_access_logs_cron(integer) to service_role;

create or replace function public.purge_access_logs_cron(p_days integer) returns integer
language sql security invoker
set search_path = '' as $$
  select private.purge_access_logs_cron($1);
$$;

revoke execute on function public.purge_access_logs_cron(integer) from public, anon, authenticated, service_role;
grant execute on function public.purge_access_logs_cron(integer) to service_role;

notify pgrst, 'reload schema';