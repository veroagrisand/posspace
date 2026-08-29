<script lang="ts">
	import AdminBreadcrumb from '$lib/components/AdminBreadcrumb.svelte';

	type WindowStats = { requests: number; errors: number; avgMs: number; p95Ms: number; users: number };
	type Summary = {
		totals: { last24h: WindowStats; last7d: { requests: number; errors: number; users: number }; last30d: { requests: number; errors: number; users: number } };
		chart: { date: string; requests: number; errors: number }[];
		statusBreakdown: { group: string; count: number }[];
		topPaths: { path: string; count: number; avgMs: number; errors: number }[];
		recentErrors: { id: number; time: string; method: string; path: string; status: number; durationMs: number; errorMsg: string }[];
		slowest: { id: number; time: string; method: string; path: string; status: number; durationMs: number }[];
	};

	type LogRow = {
		id: number;
		method: string;
		path: string;
		status: number;
		duration_ms: number;
		user_id: string | null;
		ip: string;
		user_agent: string;
		referer: string;
		error_msg: string;
		created_at: string;
	};

	let summary = $state<Summary | null>(null);
	let error = $state('');

	let logs = $state<LogRow[] | null>(null);
	let logTotal = $state(0);
	let logPage = $state(1);
	let logUsers = $state<Record<string, { fullName: string; shopName: string }>>({});
	let statusFilter = $state('');
	let pathFilter = $state('');
	let exportDays = $state(0);
	let logError = $state('');
	let purging = $state(false);

	$effect(() => {
		if (summary) return;
		fetch('/api/admin/monitor')
			.then(async (res) => {
				if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? 'Gagal memuat data');
				return res.json();
			})
			.then((d) => (summary = d))
			.catch((e) => (error = e.message));
	});

	const PAGE_SIZE = 50;

	async function loadLogs() {
		const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(logPage) });
		if (statusFilter) params.set('status', statusFilter);
		if (pathFilter.trim()) params.set('path', pathFilter.trim());
		logError = '';
		try {
			const res = await fetch(`/api/admin/monitor/logs?${params}`);
			const json = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(json.message ?? 'Gagal memuat log');
			logs = json.logs;
			logTotal = json.total;
			logUsers = json.users ?? {};
		} catch (e) {
			logError = e instanceof Error ? e.message : String(e);
			logs = [];
		}
	}

	$effect(() => {
		if (!summary) return;
		const t = setTimeout(loadLogs, 250);
		return () => clearTimeout(t);
	});

	async function purgeLogs() {
		if (purging) return;
		if (!confirm('Hapus SEMUA access log yang lebih tua dari 30 hari? Tindakan ini tidak bisa dibatalkan.')) return;
		purging = true;
		try {
			const res = await fetch('/api/admin/monitor/logs', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ days: 30 })
			});
			const json = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(json.message ?? 'Gagal membersihkan log');
			summary = null;
			logs = null;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			purging = false;
		}
	}

	const errorRate24h = $derived(
		summary?.totals.last24h.requests ? ((summary.totals.last24h.errors / summary.totals.last24h.requests) * 100) : 0
	);
	const maxRequests = $derived(Math.max(1, ...(summary?.chart.map((d) => d.requests) ?? [0])));
	const statusMeta: Record<string, { label: string; cls: string }> = {
		'2xx': { label: '2xx OK', cls: 'admin-status-active' },
		'3xx': { label: '3xx Redirect', cls: 'admin-status-trialing' },
		'4xx': { label: '4xx Client', cls: 'admin-status-pending' },
		'5xx': { label: '5xx Server', cls: 'admin-status-expired' }
	};
	const fmtTime = (iso: string) =>
		new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
	const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`);
	const totalPages = $derived(Math.max(1, Math.ceil(logTotal / PAGE_SIZE)));
	const exportUrl = $derived.by(() => {
		const p = new URLSearchParams();
		if (statusFilter) p.set('status', statusFilter);
		if (pathFilter.trim()) p.set('path', pathFilter.trim());
		if (exportDays > 0) p.set('days', String(exportDays));
		return `/api/admin/monitor/export?${p}`;
	});
</script>

<svelte:head><title>Log & Monitor — posspace admin</title></svelte:head>

<header class="admin-topbar">
	<div>
		<AdminBreadcrumb items={[{ label: 'Log & Monitor' }]} />
		<h1>Log & Monitor backend</h1>
		<p class="admin-subtitle">Access log setiap request, latensi, error rate, dan endpoint paling sibuk.</p>
	</div>
	<div class="admin-topbar-spacer"></div>
	<button class="button button-secondary" style="min-height:32px;padding:0 12px;font-size:11px" type="button" onclick={purgeLogs} disabled={purging}>
		{purging ? 'Membersihkan...' : 'Bersihkan log > 30 hari'}
	</button>
</header>

{#if error}
	<div class="admin-panel"><div class="admin-empty">Gagal memuat data: {error}</div></div>
{:else if !summary}
	<div class="admin-loading">Memuat data monitoring...</div>
{:else}
	<div class="admin-grid">
		<section class="admin-cards" aria-label="Metrik utama monitoring">
			<article class="admin-card">
				<div class="admin-card-top">
					<span class="admin-card-label">Request 24 jam</span>
					<span class="admin-card-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l2.5-6 4 12 2.5-6h5" /></svg></span>
				</div>
				<strong class="admin-card-value">{summary.totals.last24h.requests.toLocaleString('id-ID')} <small>request</small></strong>
				<div class="admin-card-meta">error {errorRate24h.toFixed(2)}% · {summary.totals.last24h.errors} request gagal</div>
			</article>
			<article class="admin-card">
				<div class="admin-card-top">
					<span class="admin-card-label">Latensi rata-rata (24 jam)</span>
					<span class="admin-card-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.5 2" /></svg></span>
				</div>
				<strong class="admin-card-value">{fmtMs(summary.totals.last24h.avgMs)} <small>avg</small></strong>
				<div class="admin-card-meta">P95 {fmtMs(summary.totals.last24h.p95Ms)}</div>
			</article>
			<article class="admin-card">
				<div class="admin-card-top">
					<span class="admin-card-label">Pengguna unik aktif</span>
					<span class="admin-card-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5M16 4.5a3.5 3.5 0 0 1 0 7M18.5 15c1.8.8 3 2.4 3 5" /></svg></span>
				</div>
				<strong class="admin-card-value">{summary.totals.last24h.users.toLocaleString('id-ID')} <small>24 jam</small></strong>
				<div class="admin-card-meta">{summary.totals.last7d.users.toLocaleString('id-ID')} pengguna dalam 7 hari</div>
			</article>
			<article class="admin-card">
				<div class="admin-card-top">
					<span class="admin-card-label">Volume 30 hari</span>
					<span class="admin-card-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5M4 19h16M9 15V9M14 15V6" /></svg></span>
				</div>
				<strong class="admin-card-value">{summary.totals.last30d.requests.toLocaleString('id-ID')} <small>request</small></strong>
				<div class="admin-card-meta">{summary.totals.last30d.errors.toLocaleString('id-ID')} error · {summary.totals.last30d.users} pengguna</div>
			</article>
		</section>

		<section class="admin-panel">
			<div class="admin-panel-head">
				<div>
					<div class="admin-panel-kicker">TRAFFIK</div>
					<h2>Request & error per hari — 14 hari terakhir</h2>
				</div>
				<div style="display:flex;gap:14px;align-items:center">
					{#each summary.statusBreakdown as s}
						<span class="admin-status {statusMeta[s.group]?.cls ?? 'admin-status-none'}">{statusMeta[s.group]?.label ?? s.group} · {s.count}</span>
					{/each}
				</div>
			</div>
			<div class="admin-bar-chart" aria-label="Grafik request dan error 14 hari">
				{#each summary.chart as day}
					<div class="admin-bar-col">
						<span class="admin-bar-value">{day.requests > 0 ? day.requests : ''}</span>
						<div class="admin-bar" title={`${day.requests} request${day.errors ? `, ${day.errors} error` : ''}`} style="height: {Math.max(3, (day.requests / maxRequests) * 100)}%; background: var(--forest-600)">
							{#if day.errors > 0}
								<i style="display:block;height:{Math.min(100, (day.errors / day.requests) * 100)}%;background:#c0392b;width:100%"></i>
							{/if}
						</div>
						<small>{new Date(day.date + 'T00:00:00Z').toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}</small>
					</div>
				{/each}
			</div>
		</section>

		<section class="admin-panel">
			<div class="admin-panel-head">
				<div>
					<div class="admin-panel-kicker">ENDPOINT TERSIBUK</div>
					<h2>12 endpoint paling sering diakses — 7 hari terakhir</h2>
				</div>
				<span class="admin-panel-note">avg = latensi rata-rata</span>
			</div>
			<div style="overflow-x:auto">
				<table class="admin-table">
					<thead>
						<tr>
							<th>Endpoint</th>
							<th class="num">Request</th>
							<th class="num">Avg latensi</th>
							<th class="num">Error</th>
						</tr>
					</thead>
					<tbody>
						{#each summary.topPaths as p}
							<tr>
								<td style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px">{p.path}</td>
								<td class="num">{p.count.toLocaleString('id-ID')}</td>
								<td class="num">{fmtMs(p.avgMs)}</td>
								<td class="num">
									{#if p.errors > 0}
										<span class="admin-pill alert">{p.errors} error</span>
									{:else}
										<span class="admin-pill">Bersih</span>
									{/if}
								</td>
							</tr>
						{:else}
							<tr><td colspan="4"><div class="admin-empty">Belum ada data.</div></td></tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>

		<section class="admin-panel">
			<div class="admin-panel-head">
				<div>
					<div class="admin-panel-kicker">ERROR TERBARU</div>
					<h2>10 request gagal terakhir</h2>
				</div>
			</div>
			<div style="overflow-x:auto">
				<table class="admin-table">
					<thead>
						<tr>
							<th>Waktu</th>
							<th>Metode</th>
							<th>Endpoint</th>
							<th class="num">Status</th>
							<th class="num">Durasi</th>
							<th>Pesan error</th>
						</tr>
					</thead>
					<tbody>
						{#each summary.recentErrors as e}
							<tr>
								<td style="white-space:nowrap">{fmtTime(e.time)}</td>
								<td style="font-family:ui-monospace,Menlo,monospace;font-size:11px">{e.method}</td>
								<td style="font-family:ui-monospace,Menlo,monospace;font-size:11px;max-width:280px;overflow:hidden;text-overflow:ellipsis">{e.path}</td>
								<td class="num"><span class="admin-pill alert">{e.status}</span></td>
								<td class="num">{fmtMs(e.durationMs)}</td>
								<td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;color:var(--muted)">{e.errorMsg || '—'}</td>
							</tr>
						{:else}
							<tr><td colspan="6"><div class="admin-empty">Tidak ada error — bagus!</div></td></tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>

		<section class="admin-panel">
			<div class="admin-panel-head">
				<div>
					<div class="admin-panel-kicker">TERLAMBAT</div>
					<h2>5 request paling lambat — 24 jam terakhir</h2>
				</div>
			</div>
			<div style="overflow-x:auto">
				<table class="admin-table">
					<thead>
						<tr>
							<th>Waktu</th>
							<th>Metode</th>
							<th>Endpoint</th>
							<th class="num">Status</th>
							<th class="num">Durasi</th>
						</tr>
					</thead>
					<tbody>
						{#each summary.slowest as s}
							<tr>
								<td style="white-space:nowrap">{fmtTime(s.time)}</td>
								<td style="font-family:ui-monospace,Menlo,monospace;font-size:11px">{s.method}</td>
								<td style="font-family:ui-monospace,Menlo,monospace;font-size:11px;max-width:320px;overflow:hidden;text-overflow:ellipsis">{s.path}</td>
								<td class="num"><span class="admin-pill {s.status >= 400 ? 'alert' : ''}">{s.status}</span></td>
								<td class="num"><strong>{fmtMs(s.durationMs)}</strong></td>
							</tr>
						{:else}
							<tr><td colspan="5"><div class="admin-empty">Belum ada data.</div></td></tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>

		<section class="admin-panel">
			<div class="admin-panel-head">
				<div>
					<div class="admin-panel-kicker">ACCESS LOG</div>
					<h2>Riwayat request terakhir</h2>
				</div>
				<span class="admin-panel-note">{logTotal.toLocaleString('id-ID')} request tersimpan</span>
			</div>
			<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
				<label class="search-box" style="min-width:220px;flex:1">
					<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
					<input type="search" placeholder="Cari endpoint..." bind:value={pathFilter} />
				</label>
				<select class="log-filter" bind:value={statusFilter} aria-label="Filter status">
					<option value="">Semua status</option>
					<option value="2xx">2xx</option>
					<option value="3xx">3xx</option>
					<option value="4xx">4xx</option>
					<option value="5xx">5xx</option>
				</select>
				<select class="log-filter" bind:value={exportDays} aria-label="Jangkauan ekspor">
					<option value={0}>Ekspor: semua data</option>
					<option value={7}>Ekspor: 7 hari terakhir</option>
					<option value={30}>Ekspor: 30 hari terakhir</option>
					<option value={90}>Ekspor: 90 hari terakhir</option>
				</select>
				<a class="button button-secondary" style="min-height:34px;padding:0 12px;font-size:11px" href={exportUrl}>Ekspor CSV</a>
			</div>
			{#if logError}
				<div class="admin-empty">Gagal memuat log: {logError}</div>
			{:else if !logs}
				<div class="admin-loading">Memuat log...</div>
			{:else}
				<div style="overflow-x:auto">
					<table class="admin-table">
						<thead>
							<tr>
								<th>Waktu</th>
								<th>Metode</th>
								<th>Endpoint</th>
								<th class="num">Status</th>
								<th class="num">Durasi</th>
								<th>Pengguna</th>
								<th>IP</th>
							</tr>
						</thead>
						<tbody>
							{#each logs as log}
								<tr>
									<td style="white-space:nowrap">{fmtTime(log.created_at)}</td>
									<td style="font-family:ui-monospace,Menlo,monospace;font-size:11px">{log.method}</td>
									<td style="font-family:ui-monospace,Menlo,monospace;font-size:11px;max-width:320px;overflow:hidden;text-overflow:ellipsis" title={log.path}>{log.path}</td>
									<td class="num"><span class="admin-pill {log.status >= 400 ? 'alert' : ''}">{log.status}</span></td>
									<td class="num">{fmtMs(log.duration_ms)}</td>
									<td>
										{#if log.user_id}
											{logUsers[log.user_id]?.fullName || log.user_id.slice(0, 8)}
											{#if logUsers[log.user_id]?.shopName}
												<div style="margin-top:2px;color:var(--muted);font-size:10.5px">{logUsers[log.user_id].shopName}</div>
											{/if}
										{:else}
											<span style="color:var(--muted)">anonim</span>
										{/if}
									</td>
									<td style="font-family:ui-monospace,Menlo,monospace;font-size:11px">{log.ip || '—'}</td>
								</tr>
							{:else}
								<tr><td colspan="7"><div class="admin-empty">Tidak ada log yang cocok.</div></td></tr>
							{/each}
						</tbody>
					</table>
				</div>
				<div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;gap:10px;flex-wrap:wrap">
					<span style="color:var(--muted);font-size:11.5px">Halaman {logPage} dari {totalPages}</span>
					<div style="display:flex;gap:6px">
						<button class="button button-secondary" style="min-height:30px;padding:0 12px;font-size:11px" type="button" onclick={() => { logPage = Math.max(1, logPage - 1); loadLogs(); }} disabled={logPage <= 1}>← Sebelumnya</button>
						<button class="button button-secondary" style="min-height:30px;padding:0 12px;font-size:11px" type="button" onclick={() => { logPage = Math.min(totalPages, logPage + 1); loadLogs(); }} disabled={logPage >= totalPages}>Berikutnya →</button>
					</div>
				</div>
			{/if}
		</section>
	</div>
{/if}

<style>
	.log-filter {
		height: 34px;
		border: 1px solid #d6d3c8;
		border-radius: 8px;
		background: #fff;
		color: inherit;
		font-size: 12px;
		padding: 0 10px;
		min-width: 150px;
	}
</style>