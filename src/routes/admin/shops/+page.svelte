<script lang="ts">
	import AdminBreadcrumb from '$lib/components/AdminBreadcrumb.svelte';

	type Shop = {
		id: string;
		name: string;
		address: string;
		phone: string;
		currency: string;
		createdAt: string;
		ownerEmail: string | null;
		subscription: { status: string; planId: string; planName: string; periodEnd: string | null } | null;
		membersCount: number;
		productsCount: number;
		txCount: number;
		omzet: number;
		lowStockCount: number;
	};

	let shops = $state<Shop[] | null>(null);
	let error = $state('');
	let actionError = $state('');
	let search = $state('');
	let busyId = $state('');

	$effect(() => {
		if (shops) return;
		fetch('/api/admin/shops')
			.then(async (res) => {
				if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? 'Gagal memuat data');
				return res.json();
			})
			.then((d) => (shops = d.shops))
			.catch((e) => (error = e.message));
	});

	async function deleteShop(s: Shop) {
		if (busyId) return;
		if (!confirm(`Hapus toko "${s.name}" beserta SEMUA data, termasuk transaksi berbayar? Tindakan ini tidak bisa dibatalkan.`)) return;
		busyId = s.id;
		actionError = '';
		try {
			const res = await fetch(`/api/admin/shops/${s.id}`, { method: 'DELETE' });
			const json = await res.json().catch(() => ({}));
			if (!res.ok) {
				const message = json.message === 'SHOP_HAS_PAID_TRANSACTIONS'
					? 'Backend masih menjalankan versi lama. Deploy ulang API agar toko dengan transaksi berbayar dapat dihapus.'
					: json.message ?? 'Gagal menghapus toko';
				throw new Error(message);
			}
			shops = (shops ?? []).filter((x) => x.id !== s.id);
		} catch (e) {
			actionError = e instanceof Error ? e.message : String(e);
		} finally {
			busyId = '';
		}
	}

	const filtered = $derived(
		(shops ?? []).filter(
			(s) => s.name.toLowerCase().includes(search.trim().toLowerCase()) || s.address.toLowerCase().includes(search.trim().toLowerCase())
		)
	);

	const formatIDR = (n: number) => `Rp ${new Intl.NumberFormat('id-ID').format(Math.max(0, Math.round(n)))}`;
	const statusMeta: Record<string, { label: string; cls: string }> = {
		active: { label: 'Aktif', cls: 'admin-status-active' },
		trialing: { label: 'Trial', cls: 'admin-status-trialing' },
		pending: { label: 'Menunggu bayar', cls: 'admin-status-pending' },
		expired: { label: 'Kadaluarsa', cls: 'admin-status-expired' },
		none: { label: 'Tanpa langganan', cls: 'admin-status-none' }
	};
</script>

<svelte:head><title>Toko terdaftar — posspace admin</title></svelte:head>

<header class="admin-topbar">
	<div>
		<AdminBreadcrumb items={[{ label: 'Toko terdaftar' }]} />
		<h1>Toko terdaftar</h1>
		<p class="admin-subtitle">Semua toko yang menggunakan posspace — status langganan, aktivitas, dan stok.</p>
	</div>
	<div class="admin-topbar-spacer"></div>
	<label class="search-box" style="min-width:260px">
		<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
		<input type="search" placeholder="Cari toko..." bind:value={search} />
	</label>
</header>

{#if error}
	<div class="admin-panel"><div class="admin-empty">Gagal memuat data: {error}</div></div>
{:else if !shops}
	<div class="admin-loading">Memuat daftar toko...</div>
{:else}
	{#if actionError}
		<div class="admin-panel"><div class="admin-empty">{actionError}</div></div>
	{/if}
	<section class="admin-panel">
		<div class="admin-panel-head">
			<div>
				<div class="admin-panel-kicker">SEMUA TOKO</div>
				<h2>{filtered.length} toko {search ? 'cocok dengan pencarian' : 'terdaftar'}</h2>
			</div>
			<span class="admin-panel-note">klik toko untuk melihat detail</span>
		</div>
		<div style="overflow-x:auto">
			<table class="admin-table">
				<thead>
					<tr>
						<th>Toko</th>
						<th>Email owner</th>
						<th>Langganan</th>
						<th>Anggota</th>
						<th>Menu</th>
						<th class="num">Transaksi</th>
						<th class="num">Omzet</th>
						<th class="num">Stok menipis</th>
						<th>Aksi</th>
					</tr>
				</thead>
				<tbody>
					{#each filtered as shop}
						<tr>
							<td>
								<a class="admin-shop-cell" href={`/admin/shops/${shop.id}`}>
									<span class="admin-shop-avatar">{shop.name.slice(0, 2).toUpperCase()}</span>
									<span><strong>{shop.name}</strong><small>{shop.address || shop.currency || '—'}</small></span>
								</a>
							</td>
							<td style="white-space:nowrap;color:var(--muted)">{shop.ownerEmail ?? '—'}</td>
							<td>
								{#if shop.subscription}
									<span class="admin-status admin-status-{shop.subscription.status}">{statusMeta[shop.subscription.status].label}</span>
									<div style="margin-top:3px;color:var(--muted);font-size:10.5px">{shop.subscription.planName}</div>
								{:else}
									<span class="admin-status admin-status-none">Tanpa langganan</span>
								{/if}
							</td>
							<td>{shop.membersCount}</td>
							<td>{shop.productsCount}</td>
							<td class="num">{shop.txCount.toLocaleString('id-ID')}</td>
							<td class="num">{formatIDR(shop.omzet)}</td>
							<td class="num">
								{#if shop.lowStockCount > 0}
									<span class="admin-pill alert">{shop.lowStockCount} bahan</span>
								{:else}
									<span class="admin-pill">Aman</span>
								{/if}
							</td>
							<td>
								<div style="display:flex;gap:6px">
									<a class="button button-secondary" style="min-height:32px;padding:0 10px;font-size:11px" href={`/admin/shops/${shop.id}`}>Kelola</a>
									<button class="button button-danger" style="min-height:32px;padding:0 10px;font-size:11px" type="button" onclick={() => deleteShop(shop)} disabled={busyId === shop.id}>
										{busyId === shop.id ? '...' : 'Hapus'}
									</button>
								</div>
							</td>
						</tr>
					{:else}
						<tr>
							<td colspan="9"><div class="admin-empty">Tidak ada toko ditemukan.</div></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
{/if}
