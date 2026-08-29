-- ============================================================
-- posspace — migration 0010: perbaikan monitor_summary
-- Bug: percentile_cont() mengembalikan double precision, tapi
-- round(double, int) tidak ada di PostgreSQL (hanya round(numeric, int)).
-- Solusi: cast hasil percentile_cont ke numeric sebelum round.
-- ============================================================

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
        'p95Ms', coalesce(round((select percentile_cont(0.95) within group (order by duration_ms) from public.access_logs where created_at >= now() - interval '24 hours')::numeric, 1), 0),
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

notify pgrst, 'reload schema';