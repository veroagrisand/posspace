-- ============================================================
-- posspace — migration 0005: paid_at nullable untuk transaksi pending
-- Transaksi pembayaran digital dibuat berstatus 'pending' sebelum
-- pembayaran terkonfirmasi, sehingga paid_at belum terisi.
-- ============================================================
alter table public.transactions alter column paid_at drop not null;