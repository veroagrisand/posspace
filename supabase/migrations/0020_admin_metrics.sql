-- ============================================================
-- posspace — migration 0020: agregasi admin di SQL
-- Mengganti fetch puluhan ribu baris transaksi di dashboard admin
-- (/api/admin/overview & /api/admin/shops) dengan agregasi server-side.
-- ============================================================

-- Metrik global: jumlah transaksi, total omzet, omzet hari ini, omzet harian 14 hari.
create or replace function public.admin_transaction_metrics()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total_count', (select count(*) from public.transactions),
    'total_omzet', (select coalesce(sum(total_amount), 0) from public.transactions),
    'today_omzet', (select coalesce(sum(total_amount), 0) from public.transactions where paid_at >= date_trunc('day', now())),
    'daily', coalesce((
      select jsonb_agg(row_to_json(d) order by d.date)
      from (
        select to_char(paid_at, 'YYYY-MM-DD') as date,
               coalesce(sum(total_amount), 0) as omzet,
               count(*) as count
        from public.transactions
        where paid_at >= now() - interval '14 days'
        group by 1
      ) d
    ), '[]'::jsonb)
  );
$$;

-- Statistik per toko: jumlah transaksi + omzet (untuk daftar toko admin).
create or replace function public.admin_shop_stats()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce((
    select jsonb_agg(row_to_json(t))
    from (
      select shop_id, count(*) as tx_count, coalesce(sum(total_amount), 0) as omzet
      from public.transactions
      group by shop_id
    ) t
  ), '[]'::jsonb);
$$;

notify pgrst, 'reload schema';