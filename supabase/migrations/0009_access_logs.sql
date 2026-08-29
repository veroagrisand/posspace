-- ============================================================
-- posspace — migration 0009: access log & monitoring
-- 1) tabel access_logs: catat SEMUA request ke backend
-- 2) RPC log_access (security definer): satu-satunya jalan tulis
--    dari hooks.server.ts — RLS tidak mengizinkan klien lain menulis
-- 3) RPC monitor_summary (hanya platform admin): statistik agregat
-- 4) RPC purge_access_logs (hanya platform admin): retensi log
-- ============================================================

create table if not exists public.access_logs (
  id bigint generated always as identity primary key,
  method text not null,
  path text not null,
  status integer not null,
  duration_ms integer not null default 0,
  user_id uuid references auth.users(id) on delete set null,
  ip text not null default '',
  user_agent text not null default '',
  referer text not null default '',
  error_msg text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists access_logs_created_idx on public.access_logs (created_at desc);
create index if not exists access_logs_status_created_idx on public.access_logs (status, created_at desc);
create index if not exists access_logs_path_created_idx on public.access_logs (path, created_at desc);
create index if not exists access_logs_user_created_idx on public.access_logs (user_id, created_at desc);

-- Tidak ada policy RLS sama sekali: klien tidak pernah baca/tulis
-- langsung. Tulis lewat log_access (definer), baca lewat monitor_*
-- yang memvalidasi platform admin.
alter table public.access_logs enable row level security;

-- ============ RPC: tulis log (dipanggil hooks.server.ts) ============
create or replace function public.log_access(
  p_method text,
  p_path text,
  p_status integer,
  p_duration_ms integer default 0,
  p_user_id uuid default null,
  p_ip text default null,
  p_user_agent text default null,
  p_referer text default null,
  p_error_msg text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.access_logs (method, path, status, duration_ms, user_id, ip, user_agent, referer, error_msg)
  values (
    left(coalesce(p_method, ''), 10),
    left(coalesce(p_path, ''), 500),
    p_status,
    greatest(0, coalesce(p_duration_ms, 0)),
    p_user_id,
    left(coalesce(p_ip, ''), 64),
    left(coalesce(p_user_agent, ''), 300),
    left(coalesce(p_referer, ''), 300),
    left(coalesce(p_error_msg, ''), 500)
  );
end;
$$;

-- ============ Helper: cek platform admin (untuk fungsi monitor) ============
create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

-- ============ RPC: ringkasan monitoring (platform admin saja) ============
create or replace function public.monitor_summary() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'FORBIDDEN';
  end if;

  select jsonb_build_object(
    'totals', jsonb_build_object(
      'last24h', jsonb_build_object(
        'requests', coalesce((select count(*) from public.access_logs where created_at >= now() - interval '24 hours'), 0),
        'errors', coalesce((select count(*) from public.access_logs where created_at >= now() - interval '24 hours' and status >= 400), 0),
        'avgMs', coalesce(round((select avg(duration_ms) from public.access_logs where created_at >= now() - interval '24 hours'), 1), 0),
        'p95Ms', coalesce(round((select percentile_cont(0.95) within group (order by duration_ms) from public.access_logs where created_at >= now() - interval '24 hours'), 1), 0),
        'users', coalesce((select count(distinct user_id) from public.access_logs where created_at >= now() - interval '24 hours' and user_id is not null), 0)
      ),
      'last7d', jsonb_build_object(
        'requests', coalesce((select count(*) from public.access_logs where created_at >= now() - interval '7 days'), 0),
        'errors', coalesce((select count(*) from public.access_logs where created_at >= now() - interval '7 days' and status >= 400), 0),
        'users', coalesce((select count(distinct user_id) from public.access_logs where created_at >= now() - interval '7 days' and user_id is not null), 0)
      ),
      'last30d', jsonb_build_object(
        'requests', coalesce((select count(*) from public.access_logs where created_at >= now() - interval '30 days'), 0),
        'errors', coalesce((select count(*) from public.access_logs where created_at >= now() - interval '30 days' and status >= 400), 0),
        'users', coalesce((select count(distinct user_id) from public.access_logs where created_at >= now() - interval '30 days' and user_id is not null), 0)
      )
    ),
    'chart', coalesce((
      select jsonb_agg(jsonb_build_object('date', day, 'requests', requests, 'errors', errors) order by day)
      from (
        select date_trunc('day', created_at)::date as day,
               count(*) as requests,
               count(*) filter (where status >= 400) as errors
        from public.access_logs
        where created_at >= now() - interval '14 days'
        group by 1
      ) t
    ), '[]'::jsonb),
    'statusBreakdown', coalesce((
      select jsonb_agg(jsonb_build_object('group', grp, 'count', cnt) order by grp)
      from (
        select case
                 when status >= 500 then '5xx'
                 when status >= 400 then '4xx'
                 when status >= 300 then '3xx'
                 else '2xx'
               end as grp,
               count(*) as cnt
        from public.access_logs
        where created_at >= now() - interval '7 days'
        group by 1
      ) t
    ), '[]'::jsonb),
    'topPaths', coalesce((
      select jsonb_agg(jsonb_build_object(
        'path', path, 'count', cnt, 'avgMs', round(avg_ms, 1), 'errors', errs) order by cnt desc)
      from (
        select path,
               count(*) as cnt,
               avg(duration_ms) as avg_ms,
               count(*) filter (where status >= 400) as errs
        from public.access_logs
        where created_at >= now() - interval '7 days'
        group by path
        order by cnt desc
        limit 12
      ) t
    ), '[]'::jsonb),
    'recentErrors', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'time', created_at, 'method', method, 'path', path,
        'status', status, 'durationMs', duration_ms, 'errorMsg', error_msg) order by created_at desc)
      from (
        select id, created_at, method, path, status, duration_ms, error_msg
        from public.access_logs
        where status >= 400
        order by created_at desc
        limit 10
      ) t
    ), '[]'::jsonb),
    'slowest', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'time', created_at, 'method', method, 'path', path,
        'status', status, 'durationMs', duration_ms) order by duration_ms desc)
      from (
        select id, created_at, method, path, status, duration_ms
        from public.access_logs
        where created_at >= now() - interval '24 hours'
        order by duration_ms desc
        limit 5
      ) t
    ), '[]'::jsonb)
  ) into v;

  return v;
end;
$$;

-- ============ RPC: hapus log lama (retensi, platform admin saja) ============
create or replace function public.purge_access_logs(p_days integer) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  if not public.is_platform_admin() then
    raise exception 'FORBIDDEN';
  end if;
  if p_days is null or p_days < 1 or p_days > 3650 then
    raise exception 'INVALID_DAYS';
  end if;

  delete from public.access_logs
  where created_at < now() - (p_days || ' days')::interval;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
notify pgrst, 'reload schema';