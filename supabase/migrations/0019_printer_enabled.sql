-- ============================================================
-- posspace — migration 0019: pilihan pemilik pakai printer struk
-- enabled=true  → cetak struk aktif (sudah disetup)
-- enabled=false → pemilik memilih TIDAK mencetak struk
--                (wizard tidak muncul lagi; bisa diubah dari Pengaturan)
-- ============================================================

alter table public.shop_printer_settings
  add column if not exists enabled boolean not null default true;

notify pgrst, 'reload schema';