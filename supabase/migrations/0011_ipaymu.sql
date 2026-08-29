-- ============================================================
-- posspace — migration 0011: iPaymu payment gateway
-- Gateway lama (Nusapay/Duitku) diganti iPaymu.
-- Kolom duitku_reference di-rename menjadi payment_ref (referensi
-- iPaymu: SessionID / nomor pembayaran). Tidak dipakai fungsi RPC,
-- hanya kolom pelacakan — rename aman.
-- ============================================================

alter table public.invoices
  rename column duitku_reference to payment_ref;

alter table public.transactions
  rename column duitku_reference to payment_ref;

notify pgrst, 'reload schema';