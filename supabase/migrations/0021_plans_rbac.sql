-- ============================================================
-- posspace — migration 0021: paket & RBAC
-- 1) Harga tahunan tepat -20% dari harga bulanan (dibulatkan).
-- 2) Teks fitur paket diselaraskan dengan gateway yang aktif (Mayar)
--    dan dengan default landing page.
-- 3) Limit kasir per paket (starter=1, pro=3, tumbuh=tak terbatas)
--    ditegakkan di API (apps/api/src/services/shop.ts).
-- ============================================================

update public.plans
  set annual_price = round(monthly_price * 0.8)
  where id in ('starter', 'pro', 'tumbuh');

update public.plans
  set features = '["1 toko & 1 kasir","Kasir cepat + struk","Resep & BOM dasar","Stok real-time 1 arah","Dukungan email"]'::jsonb
  where id = 'starter';

update public.plans
  set features = '["Semua fitur Starter","3 kasir & shift bergilir","Potong stok otomatis per resep","Pembayaran QRIS/VA/e-wallet (Mayar)","Laporan HPP & laba kotor","Ekspor laporan Excel/PDF"]'::jsonb
  where id = 'pro';

update public.plans
  set features = '["Semua fitur Pro","Tanpa batas kasir","Multi-cabang & multi-gudang","API & integrasi khusus","Onboarding + pelatihan","Dukungan prioritas 24/7"]'::jsonb
  where id = 'tumbuh';

notify pgrst, 'reload schema';