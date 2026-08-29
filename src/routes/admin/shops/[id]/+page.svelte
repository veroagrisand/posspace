<script lang="ts">
	import { page } from '$app/state';
	import AdminBreadcrumb from '$lib/components/AdminBreadcrumb.svelte';

	type ShopDetail = {
		shop: { id: string; name: string; address: string; phone: string; currency: string; created_at: string };
		subscription: {
			plan_id: string;
			planName: string;
			status: string;
			period_start: string | null;
			period_end: string | null;
			active: boolean;
		} | null;
		members: { id: string; full_name: string; role: string; created_at: string }[];
		products: { id: string; name: string; category: string; is_active: boolean; variantsCount: number }[];
		ingredients: { id: string; name: string; unit: string; stock_quantity: number; min_stock: number; cost_per_unit: number; lowStock: boolean }[];
		transactions: {
			id: string;
			receipt_no: string;
			total_amount: number;
			payment_method: string;
			payment_channel: string | null;
			paid_at: string;
			hpp: number;
			transaction_items: { product_name: string; quantity: number; line_total: number }[];
		}[];
		shifts: { id: string; opened_at: string; closed_at: string | null; opening_cash: number; expected_cash: number | null; actual_cash: number | null; status: string }[];
		stats: { omzet: number; txCount: number; lowStockCount: number };
		revenue: { date: string; omzet: number; count: number }[];
	};

	let data = $state<ShopDetail | null>(null);
	let error = $state('');
	let editOpen = $state(false);
	let editBusy = $state(false);
	let editError = $state('');
	let editForm = $state({ name: '', address: '', phone: '', currency: 'IDR' });
	let deleteBusy = $state(false);
	const shopId = $derived(page.params.id);

	$effect(() => {
		if (data || !shopId) return;
		fetch(`/api/admin/shops/${shopId}`)
			.then(async (res) => {
				if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? 'Gagal memuat data');
				return res.json();
			})
			.then((d) => (data = d))
			.catch((e) => (error = e.message));
	});

	function openEdit() {
		if (!data) return;
		editForm = {
			name: data.shop.name,
			address: data.shop.address,
			phone: data.shop.phone,
			currency: data.shop.currency || 'IDR'
		};
		editError = '';
		editOpen = true;
	}

	async function saveEdit() {
		if (!editForm.name.trim()) {
			editError = 'Nama toko wajib diisi.';
			return;
		}
		editBusy = true;
		editError = '';
		try {
			const res = await fetch(`/api/admin/shops/${shopId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: editForm.name,
					address: editForm.address,
					phone: editForm.phone,
					currency: editForm.currency
				})
			});
			const json = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(json.message ?? 'Gagal menyimpan');
			if (data) data.shop = { ...data.shop, ...json.shop };
			editOpen = false;
		} catch (e) {
			editError = e instanceof Error ? e.message : String(e);
		} finally {
			editBusy = false;
		}
	}

	async function deleteShop() {
		if (!confirm(`Hapus toko "${data?.shop.name}" beserta SEMUA data, termasuk transaksi berbayar? Tindakan ini tidak bisa dibatalkan.`)) return;
		deleteBusy = true;
		try {
			const res = await fetch(`/api/admin/shops/${shopId}`, { method: 'DELETE' });
			const json = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(json.message ?? 'Gagal menghapus toko');
			window.location.href = '/admin/shops';
		} catch (e) {
			editError = e instanceof Error ? e.message : String(e);
			editOpen = true;
		} finally {
			deleteBusy = false;
		}
	}

	const formatIDR = (n: number) => `Rp ${new Intl.NumberFormat('id-ID').format(Math.max(0, Math.round(n)))}`;
	const maxOmzet = $derived(Math.max(1, ...(data?.revenue.map((d) => d.omzet) ?? [0])));
	const roleLabel: Record<string, string> = { kasir: 'Kasir', admin_gudang: 'Admin Gudang', pemilik: 'Pemilik' };
	const statusLabel: Record<string, string> = {
		active: 'Aktif',
		trialing: 'Trial',
		pending: 'Menunggu bayar',
		expired: 'Kadaluarsa',
		none: 'Tanpa langganan'
	};
	const payLabel: Record<string, string> = { cash: 'Tunai', qris: 'QRIS', debit: 'Debit' };
</script>

<svelte:head><title>{data?.shop.name ?? 'Toko'} — posspace admin</title></svelte:head>

<header class="admin-topbar">
	<div>
		<AdminBreadcrumb items={[{ label: 'Toko terdaftar', href: '/admin/shops' }, { label: data?.shop.name ?? 'Toko' }]} />
		<div style="display:flex;align-items:center;gap:10px">
			<h1 style="font-size:20px">{data?.shop.name ?? 'Memuat...'}</h1>
			{#if data}
				<span class="admin-status admin-status-{data.subscription?.active ? data.subscription.status : data.subscription ? 'expired' : 'none'}">
					{data.subscription?.active ? statusLabel[data.subscription.status] : data.subscription ? statusLabel[data.subscription.status] : 'Tanpa langganan'}
				</span>
			{/if}
		</div>
		<p class="admin-subtitle">{data?.shop.address || 'Alamat belum diisi'} · {data?.shop.phone || 'Telepon belum diisi'} · mata uang {data?.shop.currency || 'IDR'}</p>
	</div>
	{#if data}
		<div class="admin-topbar-spacer"></div>
		<div style="display:flex;gap:8px;flex-wrap:wrap">
			<button class="button button-secondary" type="button" onclick={openEdit} style="font-size:12px">✎ Edit toko</button>
			<button class="button button-danger" type="button" onclick={deleteShop} disabled={deleteBusy} style="font-size:12px">
				{deleteBusy ? 'Menghapus...' : '🗑 Hapus toko'}
			</button>
		</div>
	{/if}
</header>

{#if editOpen}
	<div class="modal-overlay" role="presentation">
		<div class="modal-card" role="dialog" aria-modal="true" aria-label="Edit toko">
			<div class="modal-head">
				<h3>Edit toko</h3>
				<button class="icon-button" type="button" onclick={() => (editOpen = false)} aria-label="Tutup">✕</button>
			</div>
			<div class="modal-body" style="display:grid;gap:12px">
				<label style="display:grid;gap:5px;color:var(--muted);font-size:11px;font-weight:600">
					Nama toko
					<input type="text" bind:value={editForm.name} style="width:100%;padding:9px 11px;border:1px solid var(--line-strong);border-radius:9px;font-size:14px" />
				</label>
				<label style="display:grid;gap:5px;color:var(--muted);font-size:11px;font-weight:600">
					Alamat
					<input type="text" bind:value={editForm.address} placeholder="Jl. ..." style="width:100%;padding:9px 11px;border:1px solid var(--line-strong);border-radius:9px;font-size:14px" />
				</label>
				<label style="display:grid;gap:5px;color:var(--muted);font-size:11px;font-weight:600">
					Telepon
					<input type="text" bind:value={editForm.phone} placeholder="08xx..." style="width:100%;padding:9px 11px;border:1px solid var(--line-strong);border-radius:9px;font-size:14px" />
				</label>
				<label style="display:grid;gap:5px;color:var(--muted);font-size:11px;font-weight:600">
					Mata uang (ISO 4217)
					<input type="text" bind:value={editForm.currency} maxlength="3" placeholder="IDR" style="width:100%;padding:9px 11px;border:1px solid var(--line-strong);border-radius:9px;font-size:14px" />
				</label>
				{#if editError}
					<p class="au-error" style="margin:0;color:var(--red);font-size:12px;font-weight:600">{editError}</p>
				{/if}
				<div style="display:flex;gap:8px;justify-content:flex-end">
					<button class="button button-secondary" type="button" onclick={() => (editOpen = false)}>Batal</button>
					<button class="button button-primary" type="button" onclick={saveEdit} disabled={editBusy}>
						{editBusy ? 'Menyimpan...' : 'Simpan'}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

{#if error}
	<div class="admin-panel"><div class="admin-empty">Gagal memuat data: {error}</div></div>
{:else if !data}
	<div class="admin-loading">Memuat detail toko...</div>
{:else}
	<div class="admin-grid">
		<section class="admin-cards" aria-label="Metrik toko">
			<article class="admin-card">
				<div class="admin-card-top">
					<span class="admin-card-label">Omzet</span>
					<span class="admin-card-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 20V10M12 20V4M18 20v-7" /></svg></span>
				</div>
				<strong class="admin-card-value">{formatIDR(data.stats.omzet)}</strong>
				<div class="admin-card-meta">30 transaksi terakhir</div>
			</article>
			<article class="admin-card">
				<div class="admin-card-top">
					<span class="admin-card-label">Transaksi (terakhir)</span>
					<span class="admin-card-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h4" /></svg></span>
				</div>
				<strong class="admin-card-value">{data.stats.txCount} <small>transaksi</small></strong>
				<div class="admin-card-meta">{data.members.length} anggota · {data.products.length} menu</div>
			</article>
			<article class="admin-card">
				<div class="admin-card-top">
					<span class="admin-card-label">Stok menipis</span>
					<span class="admin-card-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 21 20H3L12 4Z" /><path d="M12 10v4M12 17h.01" /></svg></span>
				</div>
				<strong class="admin-card-value">{data.stats.lowStockCount} <small>bahan</small></strong>
				<div class="admin-card-meta">dari {data.ingredients.length} bahan baku</div>
			</article>
			<article class="admin-card">
				<div class="admin-card-top">
					<span class="admin-card-label">Paket langganan</span>
					<span class="admin-card-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5c0 4.6-2.9 8-7 10-4.1-2-7-5.4-7-10V6l7-3Z" /></svg></span>
				</div>
				<strong class="admin-card-value" style="font-size:18px;text-transform:capitalize">{data.subscription?.planName ?? '—'}</strong>
				<div class="admin-card-meta">
					{#if data.subscription?.period_end}
						berakhir {new Date(data.subscription.period_end).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
					{:else}
						belum ada periode aktif
					{/if}
				</div>
			</article>
		</section>

		<div class="admin-detail-grid">
			<section class="admin-panel">
				<div class="admin-panel-head">
					<div>
						<div class="admin-panel-kicker">OMZET TOKO</div>
						<h2>Omzet — 14 hari terakhir</h2>
					</div>
					<span class="admin-panel-note">{formatIDR(data.revenue.reduce((s, d) => s + d.omzet, 0))}</span>
				</div>
				<div class="admin-bar-chart" aria-label="Grafik omzet toko 14 hari">
					{#each data.revenue as day, i}
						<div class="admin-bar-col" class:current={i === data.revenue.length - 1}>
							<span class="admin-bar-value">{day.omzet > 0 ? (day.omzet / 1_000_000).toFixed(1) + 'jt' : ''}</span>
							<div class="admin-bar" style="height: {Math.max(3, (day.omzet / maxOmzet) * 100)}%"></div>
							<small>{new Date(day.date + 'T00:00:00Z').toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}</small>
						</div>
					{/each}
				</div>
			</section>

			<section class="admin-panel">
				<div class="admin-panel-head">
					<div>
						<div class="admin-panel-kicker">INFO TOKO</div>
						<h2>Langganan &amp; anggota</h2>
					</div>
				</div>
				<div>
					<div class="admin-fact-row"><span>Status langganan</span><strong>{data.subscription ? statusLabel[data.subscription.status] : 'Tanpa langganan'}</strong></div>
					<div class="admin-fact-row"><span>Mulai periode</span><strong>{data.subscription?.period_start ? new Date(data.subscription.period_start).toLocaleDateString('id-ID') : '—'}</strong></div>
					<div class="admin-fact-row"><span>Akhir periode</span><strong>{data.subscription?.period_end ? new Date(data.subscription.period_end).toLocaleDateString('id-ID') : '—'}</strong></div>
					<div class="admin-fact-row"><span>Terdaftar sejak</span><strong>{new Date(data.shop.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}</strong></div>
				</div>
				<div style="margin-top:14px">
					{#each data.members as member}
						<div class="admin-fact-row">
							<span>{member.full_name || 'Pengguna'}</span>
							<span class="admin-pill" class:warn={member.role === 'pemilik'}>{roleLabel[member.role] ?? member.role}</span>
						</div>
					{:else}
						<div class="admin-empty">Belum ada anggota.</div>
					{/each}
				</div>
			</section>
		</div>

		<section class="admin-panel">
			<div class="admin-panel-head">
				<div>
					<div class="admin-panel-kicker">STOK &amp; BAHAN BAKU</div>
					<h2>Stok real-time</h2>
				</div>
				<span class="admin-panel-note">HPP/satuan dari harga pembelian rata-rata</span>
			</div>
			<div style="overflow-x:auto">
				<table class="admin-table">
					<thead>
						<tr>
							<th>Bahan</th>
							<th>Satuan</th>
							<th class="num">Stok</th>
							<th class="num">Batas minimum</th>
							<th class="num">HPP / satuan</th>
							<th>Status</th>
						</tr>
					</thead>
					<tbody>
						{#each data.ingredients as ing}
							{@const pct = ing.min_stock > 0 ? Math.min(100, (ing.stock_quantity / ing.min_stock) * 100) : 100}
							<tr>
								<td>{ing.name}</td>
								<td>{ing.unit}</td>
								<td class="num">{Number(ing.stock_quantity).toLocaleString('id-ID')}</td>
								<td class="num">{Number(ing.min_stock).toLocaleString('id-ID')}</td>
								<td class="num">{formatIDR(Number(ing.cost_per_unit))}</td>
								<td>
									<span class="admin-pill" class:alert={ing.lowStock} class:warn={ing.stock_quantity <= ing.min_stock * 2}>{ing.lowStock ? 'Menipis' : 'Aman'}</span>
									<div class="admin-stock-bar" style="display:inline-block;vertical-align:middle;margin-left:8px"><i class:alert={ing.lowStock} style="width:{pct}%"></i></div>
								</td>
							</tr>
						{:else}
							<tr><td colspan="6"><div class="admin-empty">Belum ada bahan baku.</div></td></tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>

		<div class="admin-detail-grid">
			<section class="admin-panel">
				<div class="admin-panel-head">
					<div>
						<div class="admin-panel-kicker">TRANSAKSI</div>
						<h2>Transaksi terbaru</h2>
					</div>
				</div>
				<div style="overflow-x:auto">
					<table class="admin-table">
						<thead>
							<tr>
								<th>Struk</th>
								<th>Waktu</th>
								<th>Item</th>
								<th>Metode</th>
								<th class="num">Total</th>
								<th class="num">HPP</th>
							</tr>
						</thead>
						<tbody>
							{#each data.transactions as txn}
								<tr>
									<td style="white-space:nowrap">{txn.receipt_no}</td>
									<td style="white-space:nowrap">{new Date(txn.paid_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
									<td style="max-width:260px">{txn.transaction_items.map((i) => `${i.quantity}x ${i.product_name}`).join(', ')}</td>
									<td>{payLabel[txn.payment_method] ?? txn.payment_method}</td>
									<td class="num">{formatIDR(Number(txn.total_amount))}</td>
									<td class="num">{formatIDR(txn.hpp)}</td>
								</tr>
							{:else}
								<tr><td colspan="6"><div class="admin-empty">Belum ada transaksi.</div></td></tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>

			<section class="admin-panel">
				<div class="admin-panel-head">
					<div>
						<div class="admin-panel-kicker">MENU</div>
						<h2>Produk toko</h2>
					</div>
				</div>
				<div style="overflow-x:auto">
					<table class="admin-table">
						<thead>
							<tr>
								<th>Menu</th>
								<th>Kategori</th>
								<th class="num">Varian</th>
								<th>Status</th>
							</tr>
						</thead>
						<tbody>
							{#each data.products as product}
								<tr>
									<td>{product.name}</td>
									<td>{product.category}</td>
									<td class="num">{product.variantsCount}</td>
									<td>
										<span class="admin-pill" class:alert={!product.is_active}>{product.is_active ? 'Aktif' : 'Nonaktif'}</span>
									</td>
								</tr>
							{:else}
								<tr><td colspan="4"><div class="admin-empty">Belum ada menu.</div></td></tr>
							{/each}
						</tbody>
					</table>
				</div>
				<div class="admin-panel-head" style="margin-top:20px;margin-bottom:8px">
					<div>
						<div class="admin-panel-kicker">SHIFT</div>
						<h2>Riwayat shift kasir</h2>
					</div>
				</div>
				<div style="overflow-x:auto">
					<table class="admin-table">
						<thead>
							<tr>
								<th>Buka</th>
								<th>Tutup</th>
								<th class="num">Kas awal</th>
								<th class="num">Kas harapan</th>
								<th class="num">Kas aktual</th>
							</tr>
						</thead>
						<tbody>
							{#each data.shifts as shift}
								<tr>
									<td style="white-space:nowrap">{new Date(shift.opened_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
									<td style="white-space:nowrap">{shift.closed_at ? new Date(shift.closed_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
									<td class="num">{formatIDR(Number(shift.opening_cash))}</td>
									<td class="num">{shift.expected_cash != null ? formatIDR(Number(shift.expected_cash)) : '—'}</td>
									<td class="num">{shift.actual_cash != null ? formatIDR(Number(shift.actual_cash)) : '—'}</td>
								</tr>
							{:else}
								<tr><td colspan="5"><div class="admin-empty">Belum ada shift.</div></td></tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>
		</div>
	</div>
{/if}
