-- ============================================================
-- posspace — migration 0024: beban operasional dengan rentang
-- tanggal & jenis beban.
--  - expense_type : 'bulanan' (tagihan/langganan bulanan),
--                   'sekali' (pembelian sekali), 'jasa' (penggunaan jasa)
--  - period_start / period_end : rentang tanggal yang ditagih/dipakai
--    (untuk sekali beli cukup satu tanggal di expense_date).
--  - expense_date tetap menjadi tanggal penentu bulan laporan
--    (diisi periode selesai untuk beban berrentang), jadi logika
--    laporan/laba bersih tidak perlu berubah.
-- ============================================================

alter table public.operational_expenses
  add column if not exists expense_type text not null default 'sekali'
    check (expense_type in ('bulanan', 'sekali', 'jasa')),
  add column if not exists period_start date,
  add column if not exists period_end date;

notify pgrst, 'reload schema';