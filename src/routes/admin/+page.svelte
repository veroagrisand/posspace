<script lang="ts">
	import { page } from '$app/state';
	import AdminBreadcrumb from '$lib/components/AdminBreadcrumb.svelte';

	type Overview = {
		totals: { shops: number; users: number; transactions: number; omzet: number; todayOmzet: number; lowStockIngredients: number };
		subscriptions: { active: number; trialing: number; pending: number; expired: number; none: number; mrr: number };
		revenue: { date: string; omzet: number; count: number }[];
		recentShops: {
			id: string;
			name: string;
			createdAt: string;
			ownerEmail: string | null;
			subStatus: string;
			planName: string | null;
		}[];
	};

	let data = $state<Overview | null>(null);
	let error = $state('');
	const adminEmail = $derived(page.data.admin?.user.email ?? '');

	$effect(() => {
		if (data) return;
		fetch('/api/admin/overview')
			.then(async (res) => {
				if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? 'Gagal memuat data');
				return res.json();
			})
			.then((d) => (data = d))
			.catch((e) => (error = e.message));
	});

	const formatIDR = (n: number) => `Rp ${new Intl.NumberFormat('id-ID').format(Math.max(0, Math.round(n)))}`;
	const maxOmzet = $derived(Math.max(1, ...(data?.revenue.map((d) => d.omzet) ?? [0])));
	const statusLabel: Record<string, string> = {
		active: 'Aktif',
		trialing: 'Trial',
		pending: 'Menunggu bayar',
		expired: 'Kadaluarsa',
		none: 'Tanpa langganan'
	};
</script>

<svelte:head><title>Ringkasan SaaS — posspace admin</title></svelte:head>

<header class="admin-topbar">
	<div>
		<AdminBreadcrumb items={[]} />
		<h1>Ringkasan seluruh SaaS</h1>
		<p class="admin-subtitle">Pantau semua toko terdaftar, langganan, dan omzet dari satu dashboard.</p>
	</div>
	<div class="admin-topbar-spacer"></div>
	<span class="admin-chip">Owner SaaS · {adminEmail}</span>
</header>

{#if error}
	<div class="admin-panel"><div class="admin-empty">Gagal memuat data: {error}</div></div>
{:else if !data}
	<div class="admin-loading">Memuat data seluruh toko...</div>
{:else}
	<div class="admin-grid">
		<section class="admin-cards" aria-label="Metrik utama SaaS">
			<article class="admin-card">
				<div class="admin-card-top">
					<span class="admin-card-label">Toko terdaftar</span>
					<span class="admin-card-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 8.5 12 3.5l8.5 5-8.5 5-8.5-5Z" /><path d="m3.5 12.5 8.5 5 8.5-5M3.5 16.5l8.5 5 8.5-5" /></svg></span>
				</div>
				<strong class="admin-card-value">{data.totals.shops} <small>toko</small></strong>
				<div class="admin-card-meta">{data.subscriptions.active + data.subscriptions.trialing} langganan aktif</div>
			</article>
			<article class="admin-card">
				<div class="admin-card-top">
					<span class="admin-card-label">Pendapatan SaaS (MRR)</span>
					<span class="admin-card-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 20V10M12 20V4M18 20v-7" /></svg></span>
				</div>
				<strong class="admin-card-value">{formatIDR(data.subscriptions.mrr)} <small>/bulan</small></strong>
				<div class="admin-card-meta">dari {data.subscriptions.active} langganan berbayar</div>
			</article>
			<article class="admin-card">
				<div class="admin-card-top">
					<span class="admin-card-label">Transaksi semua toko</span>
					<span class="admin-card-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h4" /></svg></span>
				</div>
				<strong class="admin-card-value">{data.totals.transactions.toLocaleString('id-ID')} <small>transaksi</small></strong>
				<div class="admin-card-meta">total omzet {formatIDR(data.totals.omzet)}</div>
			</article>
			<article class="admin-card">
				<div class="admin-card-top">
					<span class="admin-card-label">Omzet hari ini</span>
					<span class="admin-card-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.5 9.5 11l3.5 3.5L21 7M16 7h5v5" /></svg></span>
				</div>
				<strong class="admin-card-value">{formatIDR(data.totals.todayOmzet)}</strong>
				<div class="admin-card-meta">{data.totals.lowStockIngredients} bahan stok menipis lintas toko</div>
			</article>
		</section>

		<section class="admin-panel">
			<div class="admin-panel-head">
				<div>
					<div class="admin-panel-kicker">LANGANAN</div>
					<h2>Status langganan semua toko</h2>
				</div>
				<span class="admin-panel-note">{data.totals.users} pengguna terdaftar</span>
			</div>
			<div class="admin-table-wrap" style="overflow-x:auto">
				<table class="admin-table">
					<thead>
						<tr>
							<th>Status</th>
							<th class="num">Jumlah toko</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td><span class="admin-status admin-status-active">Aktif</span></td>
							<td class="num">{data.subscriptions.active}</td>
						</tr>
						<tr>
							<td><span class="admin-status admin-status-trialing">Trial</span></td>
							<td class="num">{data.subscriptions.trialing}</td>
						</tr>
						<tr>
							<td><span class="admin-status admin-status-pending">Menunggu pembayaran</span></td>
							<td class="num">{data.subscriptions.pending}</td>
						</tr>
						<tr>
							<td><span class="admin-status admin-status-expired">Kadaluarsa / tanpa langganan</span></td>
							<td class="num">{data.subscriptions.expired + data.subscriptions.none}</td>
						</tr>
					</tbody>
				</table>
			</div>
		</section>

		<section class="admin-panel">
			<div class="admin-panel-head">
				<div>
					<div class="admin-panel-kicker">OMZET PLATFORM</div>
					<h2>Omzet gabungan semua toko — 14 hari terakhir</h2>
				</div>
				<span class="admin-panel-note">total {formatIDR(data.revenue.reduce((s, d) => s + d.omzet, 0))}</span>
			</div>
			<div class="admin-bar-chart" aria-label="Grafik omzet 14 hari">
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
					<div class="admin-panel-kicker">TOKO TERBARU</div>
					<h2>Registrasi toko terakhir</h2>
				</div>
				<a href="/admin/shops" style="color:var(--forest-700);font-size:11.5px;font-weight:700">Lihat semua toko →</a>
			</div>
			<div style="overflow-x:auto">
				<table class="admin-table">
					<thead>
						<tr>
							<th>Toko</th>
							<th>Email owner</th>
							<th>Terdaftar</th>
							<th>Paket</th>
							<th>Status langganan</th>
						</tr>
					</thead>
					<tbody>
						{#each data.recentShops as shop}
							<tr>
								<td>
									<a class="admin-shop-cell" href={`/admin/shops/${shop.id}`}>
										<span class="admin-shop-avatar">{shop.name.slice(0, 2).toUpperCase()}</span>
										<span><strong>{shop.name}</strong><small>{shop.id.slice(0, 8)}</small></span>
									</a>
								</td>
								<td style="white-space:nowrap;color:var(--muted)">{shop.ownerEmail ?? '—'}</td>
								<td style="white-space:nowrap">{new Date(shop.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
								<td>{shop.planName ?? '—'}</td>
								<td><span class="admin-status admin-status-{shop.subStatus}">{statusLabel[shop.subStatus]}</span></td>
							</tr>
						{:else}
							<tr><td colspan="5"><div class="admin-empty">Belum ada toko terdaftar.</div></td></tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	</div>
{/if}