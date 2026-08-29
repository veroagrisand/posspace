-- ============================================================
-- posspace — migration 0012: update fitur paket Pro (iPaymu)
-- Seed awal menyebut "Duitku"; kini gateway adalah iPaymu.
-- ============================================================

update public.plans
  set features = '["Semua fitur Starter","3 kasir & shift bergilir","Potong stok otomatis per resep","Pembayaran QRIS/VA/e-wallet (iPaymu)","Laporan HPP & laba kotor","Ekspor laporan"]'::jsonb
  where id = 'pro';

notify pgrst, 'reload schema';