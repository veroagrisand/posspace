-- ============================================================
-- posspace — migration 0013: batasi SECURITY DEFINER
-- Implementasi privileged disimpan di schema private yang tidak
-- diekspos oleh PostgREST. RPC public yang memang dipakai aplikasi
-- hanya menjadi wrapper SECURITY INVOKER dengan grant minimum.
-- ============================================================

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role, supabase_auth_admin;

-- Pindahkan implementasi dari schema API public.
alter function public.auth_shop_id() set schema private;
alter function public.auth_role() set schema private;
alter function public.auth_sub_active() set schema private;
alter function public.process_transaction(uuid, public.payment_method, text, text, text, text, numeric, jsonb, text) set schema private;
alter function public.record_purchase(uuid, text, numeric, numeric) set schema private;
alter function public.approve_opname(uuid, text) set schema private;
alter function public.close_shift(uuid, numeric) set schema private;
alter function public.handle_new_user() set schema private;
alter function public._confirm_payment(uuid, uuid) set schema private;
alter function public.confirm_payment(uuid) set schema private;
alter function public.confirm_payment_as_owner(uuid, uuid) set schema private;
alter function public.log_access(text, text, integer, integer, uuid, text, text, text, text) set schema private;
alter function public.is_platform_admin() set schema private;
alter function public.monitor_summary() set schema private;
alter function public.purge_access_logs(integer) set schema private;

-- SECURITY DEFINER selalu memakai schema trusted terlebih dahulu.
alter function private.auth_shop_id() set search_path to public, pg_temp;
alter function private.auth_role() set search_path to public, pg_temp;
alter function private.auth_sub_active() set search_path to public, pg_temp;
alter function private.process_transaction(uuid, public.payment_method, text, text, text, text, numeric, jsonb, text) set search_path to public, pg_temp;
alter function private.record_purchase(uuid, text, numeric, numeric) set search_path to public, pg_temp;
alter function private.approve_opname(uuid, text) set search_path to public, pg_temp;
alter function private.close_shift(uuid, numeric) set search_path to public, pg_temp;
alter function private.handle_new_user() set search_path to public, pg_temp;
alter function private._confirm_payment(uuid, uuid) set search_path to public, pg_temp;
alter function private.confirm_payment(uuid) set search_path to public, pg_temp;
alter function private.confirm_payment_as_owner(uuid, uuid) set search_path to public, pg_temp;
alter function private.log_access(text, text, integer, integer, uuid, text, text, text, text) set search_path to public, pg_temp;
alter function private.is_platform_admin() set search_path to public, pg_temp;
alter function private.monitor_summary() set search_path to public, pg_temp;
alter function private.purge_access_logs(integer) set search_path to public, pg_temp;

-- Pastikan trigger Auth menunjuk ke implementasi private.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Wrapper helper untuk RLS dan implementasi lama. Wrapper tidak memakai
-- SECURITY DEFINER sehingga tidak menjadi target linter API.
create or replace function public.auth_shop_id()
returns uuid
language sql stable security invoker
set search_path = '' as $$
  select private.auth_shop_id();
$$;

create or replace function public.auth_role()
returns public.user_role
language sql stable security invoker
set search_path = '' as $$
  select private.auth_role();
$$;

create or replace function public.auth_sub_active()
returns boolean
language sql stable security invoker
set search_path = '' as $$
  select private.auth_sub_active();
$$;

-- RPC transaksi operasional: hanya sesi authenticated.
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
language sql security invoker
set search_path = '' as $$
  select private.process_transaction($1, $2, $3, $4, $5, $6, $7, $8, $9);
$$;

create or replace function public.record_purchase(
  p_ingredient_id uuid,
  p_supplier text,
  p_quantity numeric,
  p_unit_price numeric
) returns jsonb
language sql security invoker
set search_path = '' as $$
  select private.record_purchase($1, $2, $3, $4);
$$;

create or replace function public.approve_opname(
  p_opname_id uuid,
  p_reason text
) returns jsonb
language sql security invoker
set search_path = '' as $$
  select private.approve_opname($1, $2);
$$;

create or replace function public.close_shift(
  p_shift_id uuid,
  p_actual_cash numeric
) returns jsonb
language sql security invoker
set search_path = '' as $$
  select private.close_shift($1, $2);
$$;

create or replace function public.confirm_payment(p_transaction_id uuid)
returns jsonb
language sql security invoker
set search_path = '' as $$
  select private.confirm_payment($1);
$$;

-- RPC webhook/log hanya dipanggil service role dari backend.
create or replace function public.confirm_payment_as_owner(
  p_transaction_id uuid,
  p_owner_id uuid
) returns jsonb
language sql security invoker
set search_path = '' as $$
  select private.confirm_payment_as_owner($1, $2);
$$;

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
language sql security invoker
set search_path = '' as $$
  select private.log_access($1, $2, $3, $4, $5, $6, $7, $8, $9);
$$;

create or replace function public.monitor_summary()
returns jsonb
language sql security invoker
set search_path = '' as $$
  select private.monitor_summary();
$$;

create or replace function public.purge_access_logs(p_days integer)
returns integer
language sql security invoker
set search_path = '' as $$
  select private.purge_access_logs($1);
$$;

-- Wrapper internal yang dipanggil implementasi private, bukan RPC publik.
create or replace function public._confirm_payment(p_transaction_id uuid, p_shop_id uuid)
returns jsonb
language sql security invoker
set search_path = '' as $$
  select private._confirm_payment($1, $2);
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql stable security invoker
set search_path = '' as $$
  select private.is_platform_admin();
$$;

-- Hapus grant default PUBLIC dari implementasi private.
revoke execute on function private.auth_shop_id() from public, anon, authenticated, service_role;
revoke execute on function private.auth_role() from public, anon, authenticated, service_role;
revoke execute on function private.auth_sub_active() from public, anon, authenticated, service_role;
revoke execute on function private.process_transaction(uuid, public.payment_method, text, text, text, text, numeric, jsonb, text) from public, anon, authenticated, service_role;
revoke execute on function private.record_purchase(uuid, text, numeric, numeric) from public, anon, authenticated, service_role;
revoke execute on function private.approve_opname(uuid, text) from public, anon, authenticated, service_role;
revoke execute on function private.close_shift(uuid, numeric) from public, anon, authenticated, service_role;
revoke execute on function private.handle_new_user() from public, anon, authenticated, service_role;
revoke execute on function private._confirm_payment(uuid, uuid) from public, anon, authenticated, service_role;
revoke execute on function private.confirm_payment(uuid) from public, anon, authenticated, service_role;
revoke execute on function private.confirm_payment_as_owner(uuid, uuid) from public, anon, authenticated, service_role;
revoke execute on function private.log_access(text, text, integer, integer, uuid, text, text, text, text) from public, anon, authenticated, service_role;
revoke execute on function private.is_platform_admin() from public, anon, authenticated, service_role;
revoke execute on function private.monitor_summary() from public, anon, authenticated, service_role;
revoke execute on function private.purge_access_logs(integer) from public, anon, authenticated, service_role;

-- Helper dipanggil oleh policy RLS; tetap tersedia untuk evaluasi policy,
-- tetapi implementasinya tidak berada di schema API.
grant execute on function private.auth_shop_id() to anon, authenticated;
grant execute on function private.auth_role() to anon, authenticated;
grant execute on function private.auth_sub_active() to anon, authenticated;

grant execute on function private.process_transaction(uuid, public.payment_method, text, text, text, text, numeric, jsonb, text) to authenticated;
grant execute on function private.record_purchase(uuid, text, numeric, numeric) to authenticated;
grant execute on function private.approve_opname(uuid, text) to authenticated;
grant execute on function private.close_shift(uuid, numeric) to authenticated;
grant execute on function private.confirm_payment(uuid) to authenticated;
grant execute on function private.confirm_payment_as_owner(uuid, uuid) to service_role;
grant execute on function private.log_access(text, text, integer, integer, uuid, text, text, text, text) to service_role;
grant execute on function private.monitor_summary() to authenticated;
grant execute on function private.purge_access_logs(integer) to authenticated;
grant execute on function private.handle_new_user() to supabase_auth_admin;

-- Hapus grant default PUBLIC dari seluruh wrapper, kemudian beri grant
-- minimum sesuai jalur pemanggilnya.
revoke execute on function public.auth_shop_id() from public, anon, authenticated, service_role;
revoke execute on function public.auth_role() from public, anon, authenticated, service_role;
revoke execute on function public.auth_sub_active() from public, anon, authenticated, service_role;
revoke execute on function public.process_transaction(uuid, public.payment_method, text, text, text, text, numeric, jsonb, text) from public, anon, authenticated, service_role;
revoke execute on function public.record_purchase(uuid, text, numeric, numeric) from public, anon, authenticated, service_role;
revoke execute on function public.approve_opname(uuid, text) from public, anon, authenticated, service_role;
revoke execute on function public.close_shift(uuid, numeric) from public, anon, authenticated, service_role;
revoke execute on function public.confirm_payment(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.confirm_payment_as_owner(uuid, uuid) from public, anon, authenticated, service_role;
revoke execute on function public.log_access(text, text, integer, integer, uuid, text, text, text, text) from public, anon, authenticated, service_role;
revoke execute on function public.monitor_summary() from public, anon, authenticated, service_role;
revoke execute on function public.purge_access_logs(integer) from public, anon, authenticated, service_role;
revoke execute on function public._confirm_payment(uuid, uuid) from public, anon, authenticated, service_role;
revoke execute on function public.is_platform_admin() from public, anon, authenticated, service_role;

grant execute on function public.auth_shop_id() to anon, authenticated;
grant execute on function public.auth_role() to anon, authenticated;
grant execute on function public.auth_sub_active() to anon, authenticated;
grant execute on function public.process_transaction(uuid, public.payment_method, text, text, text, text, numeric, jsonb, text) to authenticated;
grant execute on function public.record_purchase(uuid, text, numeric, numeric) to authenticated;
grant execute on function public.approve_opname(uuid, text) to authenticated;
grant execute on function public.close_shift(uuid, numeric) to authenticated;
grant execute on function public.confirm_payment(uuid) to authenticated;
grant execute on function public.confirm_payment_as_owner(uuid, uuid) to service_role;
grant execute on function public.log_access(text, text, integer, integer, uuid, text, text, text, text) to service_role;
grant execute on function public.monitor_summary() to authenticated;
grant execute on function public.purge_access_logs(integer) to authenticated;

notify pgrst, 'reload schema';
