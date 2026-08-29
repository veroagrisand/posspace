<script lang="ts">
	import { page } from '$app/state';
	import AdminBreadcrumb from '$lib/components/AdminBreadcrumb.svelte';

	type Sub = {
		shopId: string;
		shopName: string;
		createdAt: string;
		subscription: {
			planId: string;
			planName: string;
			monthlyPrice: number;
			status: string;
			periodStart: string | null;
			periodEnd: string | null;
			active: boolean;
		} | null;
		lastInvoice: { status: string; amount: number; paidAt: string | null; merchantOrderId: string } | null;
	};

	let data = $state<Sub[] | null>(null);
	let error = $state('');
	let search = $state('');
	let busy = $state<string>('');
	let notice = $state('');

	const monthsOptions = [1, 3, 6, 12];
	// pilihan bulan per baris
	const monthSel = new Map<string, number>();
	const planSel = new Map<string, string>();

	$effect(() => {
		if (data) return;
		fetch('/api/admin/subscriptions')
			.then(async (res) => {
				if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? 'Gagal memuat data');
				return res.json();
			})
			.then((d) => (data = d.subscriptions))
			.catch((e) => (error = e.message));
	});

	const filtered = $derived(
		(data ?? []).filter((s) => s.shopName.toLowerCase().includes(search.trim().toLowerCase()))
	);
	const activeCount = $derived((data ?? []).filter((s) => s.subscription?.active).length);
	const mrr = $derived((data ?? []).reduce((sum, s) => sum + (s.subscription?.active ? s.subscription.monthlyPrice : 0), 0));

	const formatIDR = (n: number) => `Rp ${new Intl.NumberFormat('id-ID').format(Math.max(0, Math.round(n)))}`;
	const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

	const statusMeta = (s: Sub): { label: string; cls: string } => {
		if (s.subscription?.active) return { label: s.subscription.status === 'trialing' ? 'Trial' : 'Aktif', cls: 'admin-status-active' };
		if (!s.subscription) return { label: 'Tanpa langganan', cls: 'admin-status-none' };
		if (s.subscription.status === 'pending') return { label: 'Menunggu', cls: 'admin-status-pending' };
		return { label: s.subscription.status === 'trialing' ? 'Trial' : s.subscription.status === 'expired' ? 'Kadaluarsa' : 'Dibatalkan', cls: 'admin-status-expired' };
	};

	async function act(shopId: string, action: 'activate' | 'extend' | 'cancel') {
		if (busy) return;
		const row = (data ?? []).find((s) => s.shopId === shopId);
		if (!row) return;
		const months = monthSel.get(shopId) ?? 1;
		if (action === 'cancel') {
			if (!window.confirm(`Batalkan langganan toko "${row.shopName}"? Akses aplikasi toko langsung terhenti.`)) return;
		} else {
			const label = action === 'activate' ? 'Aktifkan' : 'Perpanjang';
			if (!window.confirm(`${label} langganan "${row.shopName}" ${months} bulan?`)) return;
		}
		busy = shopId;
		notice = '';
		try {
			const endpoint =
				action === 'cancel'
					? `/api/admin/subscriptions/${shopId}/cancel`
					: `/api/admin/subscriptions/${shopId}/activate`;
			const body = action === 'cancel' ? {} : { months, planId: planSel.get(shopId) ?? row.subscription?.planId ?? 'starter' };
			const res = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			const json = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(json.message ?? 'Aksi gagal');
			notice = action === 'cancel' ? `Langganan "${row.shopName}" dibatalkan.` : `Langganan "${row.shopName}" aktif ${months} bulan.`;
			await reload();
		} catch (err) {
			notice = `Gagal: ${err instanceof Error ? err.message : 'error'}`;
		} finally {
			busy = '';
		}
	}

	async function reload() {
		const res = await fetch('/api/admin/subscriptions');
		const json = await res.json().catch(() => ({}));
		if (json.subscriptions) data = json.subscriptions;
	}
</script>

<svelte:head><title>Kelola langganan — posspace admin</title></svelte:head>

<header class="admin-topbar">
	<div>
		<AdminBreadcrumb items={[{ label: 'Langganan' }]} />
		<h1>Kelola langganan UMKM</h1>
		<p class="admin-subtitle">Aktivasi manual, perpanjangan, dan pembatalan langganan setiap toko terdaftar.</p>
	</div>
	<div class="admin-topbar-spacer"></div>
	<span class="admin-chip">{activeCount} aktif · MRR {formatIDR(mrr)}/bulan</span>
	<label class="search-box" style="min-width:240px">
		<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
		<input type="search" placeholder="Cari toko..." bind:value={search} />
	</label>
</header>

{#if error}
	<div class="admin-panel"><div class="admin-empty">Gagal memuat data: {error}</div></div>
{:else if !data}
	<div class="admin-loading">Memuat data langganan...</div>
{:else}
	<section class="admin-panel">
		<div class="admin-panel-head">
			<div>
				<div class="admin-panel-kicker">SEMUA LANGGANAN</div>
				<h2>{filtered.length} toko</h2>
			</div>
			<span class="admin-panel-note">Aktivasi &amp; pembatalan hanya dari dashboard ini — pemilik toko tidak bisa melakukannya sendiri</span>
		</div>
		{#if notice}
			<p style="margin:0 0 12px;color:var(--forest-800);font-size:12px;font-weight:600">{notice}</p>
		{/if}
		<div style="overflow-x:auto">
			<table class="admin-table">
				<thead>
					<tr>
						<th>Toko</th>
						<th>Paket</th>
						<th>Status</th>
						<th>Periode</th>
						<th class="num">Tagihan terakhir</th>
						<th>Aksi</th>
					</tr>
				</thead>
				<tbody>
					{#each filtered as row}
						{@const meta = statusMeta(row)}
						<tr>
							<td>
								<a class="admin-shop-cell" href={`/admin/shops/${row.shopId}`}>
									<span class="admin-shop-avatar">{row.shopName.slice(0, 2).toUpperCase()}</span>
									<span><strong>{row.shopName}</strong><small>terdaftar {fmtDate(row.createdAt)}</small></span>
								</a>
							</td>
							<td>
								{row.subscription?.planName ?? '—'}
								{#if row.subscription?.active}
									<div style="margin-top:3px;color:var(--muted);font-size:10.5px">{formatIDR(row.subscription.monthlyPrice)}/bulan</div>
								{/if}
							</td>
							<td><span class="admin-status {meta.cls}">{meta.label}</span></td>
							<td style="white-space:nowrap">
								{row.subscription ? `${fmtDate(row.subscription.periodStart)} → ${fmtDate(row.subscription.periodEnd)}` : '—'}
							</td>
							<td class="num">
								{#if row.lastInvoice}
									{formatIDR(row.lastInvoice.amount)}
									<div style="color:var(--muted);font-size:10.5px">{row.lastInvoice.status === 'paid' ? 'lunas' : 'pending'}</div>
								{:else}—{/if}
							</td>
							<td>
								<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
									<select
										class="admin-select"
										value={monthSel.get(row.shopId) ?? 1}
										disabled={busy === row.shopId}
										onchange={(e) => monthSel.set(row.shopId, Number((e.currentTarget as HTMLSelectElement).value))}
										aria-label="Bulan langganan {row.shopName}"
									>
										{#each monthsOptions as m}
											<option value={m}>{m} bln</option>
										{/each}
									</select>
									{#if row.subscription?.active}
										<button class="button button-secondary" type="button" style="min-height:32px;padding:0 10px" disabled={busy === row.shopId} onclick={() => act(row.shopId, 'extend')}>
											{busy === row.shopId ? 'Memproses...' : 'Perpanjang'}
										</button>
										<button class="button button-danger" type="button" style="min-height:32px;padding:0 10px" disabled={busy === row.shopId} onclick={() => act(row.shopId, 'cancel')}>
											Batalkan
										</button>
									{:else}
										<button class="button button-primary" type="button" style="min-height:32px;padding:0 10px" disabled={busy === row.shopId} onclick={() => act(row.shopId, 'activate')}>
											{busy === row.shopId ? 'Memproses...' : 'Aktifkan'}
										</button>
									{/if}
								</div>
							</td>
						</tr>
					{:else}
						<tr><td colspan="6"><div class="admin-empty">Tidak ada toko ditemukan.</div></td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
{/if}

<style>
	.admin-select {
		min-height: 32px;
		padding: 0 8px;
		border: 1px solid var(--line-strong);
		border-radius: 8px;
		background: var(--surface);
		font-size: 11px;
		font-weight: 600;
	}

	.button-danger {
		color: #fff;
		background: var(--red);
	}

	.button-danger:hover {
		background: #b84a3e;
	}
</style>