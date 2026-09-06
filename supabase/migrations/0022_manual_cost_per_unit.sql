-- ============================================================
-- posspace — migration 0022: harga modal bahan = input MANUAL
-- Semua data rumus HPP (resep × harga modal per satuan) diisi
-- manual oleh pemilik/anggota; HPP dihitung otomatis. Pembelian
-- hanya menambah stok & mencatat riwayat — TIDAK lagi menimpa
-- cost_per_unit dengan rata-rata tertimbang (sebelumnya setiap
-- pembelian mengubah HPP menu secara diam-diam).
-- ============================================================

create or replace function private.record_purchase(
  p_ingredient_id uuid,
  p_supplier text,
  p_quantity numeric,
  p_unit_price numeric
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_shop_id uuid := public.auth_shop_id();
  v_po_id uuid := gen_random_uuid();
begin
  if v_shop_id is null or not public.auth_sub_active() then
    raise exception 'FORBIDDEN';
  end if;
  if public.auth_role() not in ('pemilik', 'admin_gudang') then
    raise exception 'FORBIDDEN';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'INVALID_QUANTITY';
  end if;
  if p_unit_price is null or p_unit_price < 0 then
    raise exception 'INVALID_PRICE';
  end if;
  if not exists (select 1 from public.ingredients where id = p_ingredient_id and shop_id = v_shop_id) then
    raise exception 'NOT_FOUND';
  end if;

  -- Hanya tambah stok. cost_per_unit (harga modal) TIDAK diubah:
  -- pemilik mengisinya manual (form bahan / kolom Harga modal).
  update public.ingredients
    set stock_quantity = stock_quantity + p_quantity, updated_at = now()
    where id = p_ingredient_id;

  insert into public.purchase_orders (id, shop_id, ingredient_id, supplier, quantity, unit_price, received_at)
  values (v_po_id, v_shop_id, p_ingredient_id, p_supplier, p_quantity, p_unit_price, now());

  insert into public.stock_movements (ingredient_id, quantity_change, movement_type, reference_id, note)
  values (p_ingredient_id, p_quantity, 'purchase', v_po_id, 'Pembelian dari ' || coalesce(nullif(p_supplier, ''), 'Pemasok'));

  return jsonb_build_object('id', v_po_id);
end;
$$;

notify pgrst, 'reload schema';