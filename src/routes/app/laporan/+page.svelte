<script lang="ts">
	import { showToast } from '$lib/toast.svelte';
	import { store, formatRupiahExact } from '$lib/store.svelte';

	const formatIDR = (amount: number) => `Rp ${new Intl.NumberFormat('id-ID').format(Math.max(0, Math.round(amount)))}`;

	let period = $state<'weekly' | 'monthly' | 'yearly' | 'all'>('monthly');
	const periodLabels: Record<string, string> = { weekly: 'Mingguan', monthly: 'Bulanan', yearly: 'Tahunan', all: 'Keseluruhan' };

	// Rentang tanggal sama dengan backend (report-export.ts) agar angka dashboard
	// konsisten dengan hasil ekspor.
	function periodRangeFor(p: string): { from: string; to: string } {
		const now = new Date();
		const to = now.toISOString().slice(0, 10);
		const iso = (d: Date) => d.toISOString().slice(0, 10);
		if (p === 'weekly') {
			const day = (now.getDay() + 6) % 7; // Senin = 0
			const monday = new Date(now);
			monday.setDate(now.getDate() - day);
			return { from: iso(monday), to };
		}
		if (p === 'monthly') return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to };
		if (p === 'yearly') return { from: iso(new Date(now.getFullYear(), 0, 1)), to };
		return { from: '2000-01-01', to };
	}

	type Summary = {
		omzet: number;
		txCount: number;
		hpp: number;
		profit: number;
		marginPct: number;
		expenses: number;
		netProfit: number;
		netMarginPct: number;
		topMenus: { name: string; qty: number; revenue: number; hpp: number; profit: number }[];
	};
	let summary = $state<Summary | null>(null);
	let summaryLoading = $state(true);
	let summaryError = $state('');

	$effect(() => {
		const { from, to } = periodRangeFor(period);
		summaryLoading = true;
		summaryError = '';
		summary = null;
		fetch(`/api/reports/summary?from=${from}&to=${to}`)
			.then(async (res) => {
				if (!res.ok) throw new Error('FAILED');
				return res.json();
			})
			.then((d) => {
				summary = d as Summary;
				summaryLoading = false;
			})
			.catch(() => {
				summaryError = 'Gagal memuat laporan. Coba lagi atau muat ulang halaman.';
				summaryLoading = false;
			});
	});

	const omzet = $derived(summary?.omzet ?? 0);
	const txCount = $derived(summary?.txCount ?? 0);
	const hppTotal = $derived(summary?.hpp ?? 0);
	const profit = $derived(summary?.profit ?? 0);
	const marginPct = $derived(summary?.marginPct ?? 0);
	const hppPct = $derived(omzet > 0 ? Math.round((hppTotal / omzet) * 1000) / 10 : 0);
	const expenses = $derived(summary?.expenses ?? 0);
	const netProfit = $derived(summary?.netProfit ?? 0);
	const netMarginPct = $derived(summary?.netMarginPct ?? 0);
	const topMenus = $derived(summary?.topMenus ?? []);

	const stockRows = $derived(
		store.ingredients.map((i) => ({ name: i.name, unit: i.unit, stock: i.stock, min: i.minStock, status: i.stock <= i.minStock ? 'Perlu beli' : 'Aman' }))
	);

	function exportCSV(filename: string, rows: (string | number)[][]) {
		const csv = rows
			.map((row) =>
				row
					.map((cell) => {
						const s = String(cell);
						return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
					})
					.join(',')
			)
			.join('\n');
		const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}

	function exportStock() {
		const rows: (string | number)[][] = [['Bahan', 'Satuan', 'Stok', 'Batas Minimum', 'Status']];
		for (const row of stockRows) {
			rows.push([row.name, row.unit, row.stock, row.min, row.status]);
		}
		exportCSV(`posspace-laporan-stok-${new Date().toISOString().slice(0, 10)}.csv`, rows);
		showToast('Laporan stok diunduh (CSV)');
	}

	let exporting = $state(false);

	async function exportReport(format: 'csv' | 'xlsx' | 'pdf') {
		if (exporting) return;
		exporting = true;
		try {
			const res = await fetch(`/api/reports/export/sales?period=${period}&format=${format}`);
			if (!res.ok) {
				showToast(res.status === 403 ? 'Ekspor laporan hanya tersedia di paket Pro ke atas' : 'Gagal mengekspor laporan');
				return;
			}
			const blob = await res.blob();
			const cd = res.headers.get('content-disposition') ?? '';
			const m = cd.match(/filename="?([^"]+)"?/);
			const ext = format === 'xlsx' ? 'xlsx' : format;
			const filename = m ? m[1] : `posspace-laporan-${period}.${ext}`;
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = filename;
			a.click();
			URL.revokeObjectURL(url);
			showToast(`Laporan ${periodLabels[period]} (${format.toUpperCase()}) diunduh`);
		} catch {
			showToast('Gagal mengekspor laporan');
		} finally {
			exporting = false;
		}
	}
</script>

<header class="topbar">
	<div class="breadcrumbs" aria-label="Breadcrumb">
		<span>Operasional</span>
		<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
		<strong>Laporan</strong>
	</div>
</header>

<div class="page-content">
	<section class="page-heading">
		<div>
			<div class="eyebrow"><span class="eyebrow-line"></span> LAPORAN &amp; KEUANGAN</div>
			<h1>Omzet, HPP, dan laba dalam satu klik.</h1>
			<p>Ringkasan penjualan, menu terlaris, dan margin per menu: tanpa spreadsheet.</p>
		</div>
		<div class="heading-actions">
			<label class="period-picker">
				<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5.5" width="16" height="14" rx="2" /><path d="M8 3.5v4M16 3.5v4M4 10h16" /></svg>
				<select bind:value={period} aria-label="Periode laporan">
					<option value="weekly">Mingguan</option>
					<option value="monthly">Bulanan</option>
					<option value="yearly">Tahunan</option>
					<option value="all">Keseluruhan</option>
				</select>
			</label>
			<button class="button button-secondary" type="button" onclick={exportStock}>
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
				Ekspor stok
			</button>
			<button class="button button-secondary" type="button" disabled={exporting} onclick={() => exportReport('xlsx')}>
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
				{exporting ? 'Memproses...' : 'Excel'}
			</button>
			<button class="button button-primary" type="button" disabled={exporting} onclick={() => exportReport('pdf')}>
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
				{exporting ? 'Memproses...' : 'PDF'}
			</button>
		</div>
	</section>

	{#if summaryLoading}
		<div class="panel" style="padding:40px 24px">
			<div class="cart-empty" style="padding-top:0">
				<strong style="font-size:12px">Memuat laporan {periodLabels[period]}...</strong>
			</div>
		</div>
	{:else if summaryError}
		<div class="panel" style="padding:40px 24px">
			<div class="cart-empty" style="padding-top:0">
				<strong style="font-size:12px;color:var(--red)">Gagal memuat laporan</strong>
				<p>{summaryError}</p>
			</div>
		</div>
	{:else}
		<section class="metrics-grid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
			<article class="metric-card metric-revenue">
				<div class="metric-topline"><span class="metric-label">Omzet {periodLabels[period]}</span><span class="metric-icon">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 20V10M12 20V4M18 20v-7" /></svg>
				</span></div>
				<strong class="metric-value">{formatIDR(omzet)}</strong>
				<div class="metric-meta"><span class="trend-up">{txCount > 0 ? '+' + txCount : '0'}</span><span>transaksi {periodLabels[period].toLowerCase()}</span></div>
			</article>
			<article class="metric-card metric-orders">
				<div class="metric-topline"><span class="metric-label">Transaksi</span><span class="metric-icon">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h4" /></svg>
				</span></div>
				<strong class="metric-value">{txCount} <small>transaksi</small></strong>
				<div class="metric-meta"><span class="trend-up">+{txCount}</span><span>periode {periodLabels[period].toLowerCase()}</span></div>
			</article>
			<article class="metric-card metric-profit">
				<div class="metric-topline"><span class="metric-label">HPP total</span><span class="metric-icon">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17.5 9.5 12l3.5 3.5L20 8.5M15 8.5h5v5" /></svg>
				</span></div>
				<strong class="metric-value">{formatRupiahExact(hppTotal)}</strong>
				<div class="metric-meta"><span class="trend-{hppPct <= 35 ? 'good' : 'alert'}">{hppPct <= 35 ? 'Dalam target' : 'Perlu perhatian'}</span><span>{hppPct}% dari omzet</span></div>
			</article>
			<article class="metric-card">
				<div class="metric-topline"><span class="metric-label">Laba kotor</span><span class="metric-icon">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.5 9.5 11l3.5 3.5L21 7M16 7h5v5" /></svg>
				</span></div>
				<strong class="metric-value">{formatIDR(profit)}</strong>
				<div class="metric-meta"><span class="trend-good">margin {marginPct}%</span><span>dari omzet</span></div>
			</article>
			<article class="metric-card metric-stock">
				<div class="metric-topline"><span class="metric-label">Beban operasional</span><span class="metric-icon">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14v12H5zM8 8V6a4 4 0 0 1 8 0v2" /></svg>
				</span></div>
				<strong class="metric-value">{formatIDR(expenses)}</strong>
				<div class="metric-meta"><span>dari Operasional</span><span>periode ini</span></div>
			</article>
			<article class="metric-card">
				<div class="metric-topline"><span class="metric-label">Laba bersih</span><span class="metric-icon">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.5 9.5 11l3.5 3.5L21 7M16 7h5v5" /></svg>
				</span></div>
				<strong class="metric-value">{formatIDR(netProfit)}</strong>
				<div class="metric-meta"><span class="trend-{netProfit >= 0 ? 'good' : 'alert'}">margin bersih {netMarginPct}%</span><span>laba kotor - beban</span></div>
			</article>
		</section>

		<section class="panel" style="padding: 24px">
			<div class="panel-heading compact-heading" style="margin-bottom: 18px">
				<div><div class="section-kicker">MENU TERLARIS</div><h2>Laba kotor per menu</h2></div>
				<span style="color:#5d6861;font-size:11px">{periodLabels[period].toLowerCase()}</span>
			</div>
			{#if topMenus.length === 0}
				<div class="cart-empty" style="padding-top:16px">
					<strong style="font-size:12px">Belum ada transaksi periode ini</strong>
					<p>Lakukan pembayaran di kasir untuk melihat peringkat menu.</p>
				</div>
			{:else}
				<div style="overflow-x:auto">
					<table class="data-table">
						<thead>
							<tr>
								<th>Menu</th>
								<th>Terjual</th>
								<th>Omzet</th>
								<th>HPP</th>
								<th>Laba kotor</th>
							</tr>
						</thead>
						<tbody>
							{#each topMenus as item}
								<tr>
									<td>{item.name}</td>
									<td>{item.qty} porsi</td>
									<td style="font-family:var(--font-display)">{formatIDR(item.revenue)}</td>
									<td style="font-family:var(--font-display)">{formatRupiahExact(item.hpp)}</td>
									<td style="font-family:var(--font-display);color:var(--green);font-weight:700">{formatRupiahExact(item.profit)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
			<div class="export-banner">
				<p><strong>Ekspor laporan</strong><br />Unduh laporan {periodLabels[period]} dalam format Excel atau PDF, lengkap dengan ringkasan, transaksi, per menu, dan per hari.</p>
				<div style="display:flex;gap:8px">
					<button class="button button-secondary" type="button" disabled={exporting} onclick={() => exportReport('xlsx')}>
						{exporting ? 'Memproses...' : 'Ekspor Excel'}
					</button>
					<button class="button button-primary" type="button" disabled={exporting} onclick={() => exportReport('pdf')}>
						{exporting ? 'Memproses...' : 'Ekspor PDF'}
					</button>
				</div>
			</div>
		</section>
	{/if}
</div>

<style>
	.period-picker {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		background: var(--surface);
		border: 1px solid var(--line-strong);
		border-radius: 12px;
		padding: 0 12px;
		height: 42px;
		color: var(--ink-soft);
	}
	.period-picker svg {
		width: 15px;
		height: 15px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.6;
	}
	.period-picker select {
		border: none;
		background: none;
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		color: var(--ink);
		cursor: pointer;
	}
	.period-picker select option {
		background-color: var(--surface);
		color: var(--ink);
	}
</style>