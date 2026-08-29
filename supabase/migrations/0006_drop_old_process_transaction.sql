-- ============================================================
-- posspace — migration 0006: hapus overload process_transaction lama
-- Migration 0004 membuat process_transaction baru dengan parameter
-- p_payment_status, sehingga overload versi 0001/0002 (8 parameter)
-- masih ada dan membuat pemanggilan ambigu. Hapus versi lama.
-- ============================================================
drop function if exists public.process_transaction(uuid, public.payment_method, text, text, text, text, numeric, jsonb);