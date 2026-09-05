<script lang="ts">
	import { showToast } from '$lib/toast.svelte';
	import { store, EXPENSE_CATEGORIES, expenseLabel, addExpense, updateExpense, deleteExpense } from '$lib/store.svelte';
	import Modal from '$lib/components/Modal.svelte';

	const formatIDR = (amount: number) => `Rp ${new Intl.NumberFormat('id-ID').format(Math.max(0, Math.round(amount)))}`;

	let month = $state(new Date().toISOString().slice(0, 7));
	let summary = $state<{
		omzet: number;
		hpp: number;
		profit: number;
		expenses: number;
		netProfit: number;
		netMarginPct: number;
	} | null>(null);
	let loading = $state(false);

	let addOpen = $state(false);
	let addCategory = $state<(typeof EXPENSE_CATEGORIES)[number]['id']>('listrik');
	let addAmount = $state(0);
	let addNote = $state('');
	let addDate = $state(new Date().toISOString().slice(0, 10));

	let editing = $state<{ id: string; category: string; amount: number; note: string; expenseDate: string } | null>(null);
	let editOpen = $state(false);
	let editCategory = $state<(typeof EXPENSE_CATEGORIES)[number]['id']>('listrik');
	let editAmount = $state(0);
	let editNote = $state('');
	let editDate = $state('');

	function currentMonthRange() {
		const [ym, d] = month.split('-').map(Number);
		const from = `${month}-01`;
		const lastDay = new Date(ym, d, 0).getDate();
		const to = `${month}-${String(lastDay).padStart(2, '0')}`;
		return { from, to };
	}

	async function loadSummary() {
		loading = true;
		const { from, to } = currentMonthRange();
		try {
			const res = await fetch(`/api/reports/summary?from=${from}&to=${to}`);
			const json = await res.json();
			if (res.ok) summary = json;
		} catch {
			/* biarkan summary lama */
		}
		loading = false;
	}

	$effect(() => {
		void loadSummary();
	});

	function openAdd() {
		addCategory = 'listrik';
		addAmount = 0;
		addNote = '';
		addDate = new Date().toISOString().slice(0, 10);
		addOpen = true;
	}

	async function submitAdd() {
		if (!addCategory || addAmount <= 0) {
			showToast('Isi kategori & jumlah beban');
			return;
		}
		await addExpense({ category: addCategory, amount: addAmount, note: addNote.trim(), expenseDate: addDate });
		addOpen = false;
		showToast('Beban operasional dicatat');
	}

	function openEdit(e: { id: string; category: string; amount: number; note: string; expenseDate: string }) {
		editing = e;
		editOpen = true;
		editCategory = (EXPENSE_CATEGORIES.some((c) => c.id === e.category) ? e.category : 'lainnya') as typeof editCategory;
		editAmount = e.amount;
		editNote = e.note;
		editDate = e.expenseDate;
	}

	async function submitEdit() {
		if (!editing || editAmount <= 0) {
			showToast('Isi jumlah beban yang valid');
			return;
		}
		await updateExpense(editing.id, { category: editCategory, amount: editAmount, note: editNote.trim(), expenseDate: editDate });
		editing = null;
		editOpen = false;
		showToast('Beban operasional diperbarui');
	}

	function closeEdit() {
		editing = null;
		editOpen = false;
	}

	async function removeExpense(id: string) {
		if (!confirm('Hapus catatan beban ini?')) return;
		await deleteExpense(id);
		showToast('Beban operasional dihapus');
	}

	const monthExpenses = $derived(store.expenses.filter((e) => e.expenseDate.startsWith(month)));
	const localExpensesTotal = $derived(monthExpenses.reduce((s, e) => s + e.amount, 0));
	const byCategory = $derived.by(() => {
		const map = new Map<string, number>();
		for (const e of monthExpenses) map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
		return [...map.entries()].sort((a, b) => b[1] - a[1]);
	});

	const omzet = $derived(summary?.omzet ?? 0);
	const hpp = $derived(summary?.hpp ?? 0);
	const grossProfit = $derived(omzet - hpp);
	const expensesTotal = $derived(summary?.expenses ?? localExpensesTotal);
	const netProfit = $derived(summary?.netProfit ?? grossProfit - localExpensesTotal);
	const netMargin = $derived(omzet > 0 ? Math.round((netProfit / omzet) * 1000) / 10 : 0);
</script>

<svelte:head><title>Operasional — posspace</title></svelte:head>

<header class="topbar">
	<div class="breadcrumbs" aria-label="Breadcrumb">
		<span>Operasional</span>
		<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
		<strong>Beban &amp; laba bersih</strong>
	</div>
</header>

<div class="page-content">
	<section class="page-heading">
		<div>
			<div class="eyebrow"><span class="eyebrow-line"></span> BEBAN OPERASIONAL</div>
			<h1>Listrik, sewa, gaji — semua tercatat.</h1>
			<p>Laba bersih = omzet − HPP (dari resep) − beban operasional.</p>
		</div>
		<div class="heading-actions">
			<label class="month-picker">
				<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5.5" width="16" height="14" rx="2" /><path d="M8 3.5v4M16 3.5v4M4 10h16" /></svg>
				<input type="month" bind:value={month} aria-label="Pilih bulan" />
			</label>
			<button class="button button-primary" type="button" onclick={openAdd}>+ Catat beban</button>
		</div>
	</section>

	<section class="metrics-grid" aria-label="Ringkasan laba bersih">
		<article class="metric-card metric-revenue">
			<div class="metric-topline"><span class="metric-label">Omzet</span><span class="metric-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 20V10M12 20V4M18 20v-7" /></svg></span></div>
			<strong class="metric-value">{formatIDR(omzet)}</strong>
			<div class="metric-meta"><span>bulan {month}</span></div>
		</article>
		<article class="metric-card">
			<div class="metric-topline"><span class="metric-label">HPP (bahan)</span><span class="metric-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h9L19 7v13.5H6V3.5Z" /><path d="M14 3.5V8h5" /></svg></span></div>
			<strong class="metric-value">{formatIDR(hpp)}</strong>
			<div class="metric-meta"><span>dari resep &amp; harga modal</span></div>
		</article>
		<article class="metric-card">
			<div class="metric-topline"><span class="metric-label">Laba kotor</span><span class="metric-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 20V10M12 20V4M18 20v-7" /></svg></span></div>
			<strong class="metric-value">{formatIDR(grossProfit)}</strong>
			<div class="metric-meta"><span>omzet − HPP</span></div>
		</article>
		<article class="metric-card">
			<div class="metric-topline"><span class="metric-label">Beban operasional</span><span class="metric-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 3 5 13h6l-1 8 8-10h-6l1-8Z" /></svg></span></div>
			<strong class="metric-value">{formatIDR(expensesTotal)}</strong>
			<div class="metric-meta"><span>{monthExpenses.length} catatan bulan ini</span></div>
		</article>
		<article class="metric-card metric-orders">
			<div class="metric-topline"><span class="metric-label">Laba BERSIH</span><span class="metric-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5c0 4.6-2.9 8-7 10-4.1-2-7-5.4-7-10V6l7-3Z" /><path d="M9 12l2 2 4-4" /></svg></span></div>
			<strong class="metric-value" style="color:{netProfit >= 0 ? 'var(--green)' : 'var(--red)'}">{formatIDR(netProfit)}</strong>
			<div class="metric-meta">
				{#if loading}<span>memuat...</span>{:else}<span class="trend-{netMargin <= 15 ? (netProfit >= 0 ? 'good' : 'alert') : 'good'}">{netMargin}% margin bersih</span>{/if}
			</div>
		</article>
	</section>

	<section class="panel" style="padding: 24px;margin-top: 19px">
		<div class="panel-heading compact-heading" style="margin-bottom: 18px">
			<div><div class="section-kicker">RINCIAN BEBAN</div><h2>Beban operasional — {month}</h2></div>
			<span class="live-label"><i></i> {monthExpenses.length} catatan</span>
		</div>

		{#if byCategory.length > 0}
			<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px">
				{#each byCategory as [cat, total]}
					<span class="admin-pill" style="font-size:11px">
						<b>{expenseLabel(cat)}</b> · {formatIDR(total)}
					</span>
				{/each}
			</div>
		{/if}

		<div style="overflow-x:auto">
			<table class="data-table">
				<thead>
					<tr>
						<th>Tanggal</th>
						<th>Kategori</th>
						<th>Keterangan</th>
						<th class="num">Jumlah</th>
						<th>Aksi</th>
					</tr>
				</thead>
				<tbody>
					{#each monthExpenses as expense}
						<tr>
							<td style="white-space:nowrap">{new Date(expense.expenseDate + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
							<td><span class="admin-pill">{expenseLabel(expense.category)}</span></td>
							<td style="max-width:240px;font-size:11px">{expense.note || '—'}</td>
							<td class="num" style="font-family:var(--font-display);font-weight:700">{formatIDR(expense.amount)}</td>
							<td>
								<div style="display:flex;gap:6px">
									<button class="text-button" type="button" onclick={() => openEdit(expense)}>Ubah</button>
									<button class="text-button" type="button" style="color:var(--red)" onclick={() => removeExpense(expense.id)}>Hapus</button>
								</div>
							</td>
						</tr>
					{:else}
						<tr>
							<td colspan="5"><div class="cart-empty" style="padding-top:12px">Belum ada beban operasional bulan ini. Klik "+ Catat beban" untuk mulai mencatat listrik, sewa, gaji, dll.</div></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
</div>

<Modal bind:open={addOpen} title="Catat beban operasional">
	<div class="form-grid">
		<div class="form-row">
			<label for="addCategory">Kategori</label>
			<div class="form-input">
				<select id="addCategory" bind:value={addCategory}>
					{#each EXPENSE_CATEGORIES as cat}
						<option value={cat.id}>{cat.label}</option>
					{/each}
				</select>
			</div>
		</div>
		<div class="form-grid two">
			<div class="form-row">
				<label for="addAmount">Jumlah (Rp)</label>
				<div class="form-input"><input id="addAmount" type="number" min="0" step="any" bind:value={addAmount} placeholder="cth. 350000" /></div>
			</div>
			<div class="form-row">
				<label for="addDate">Tanggal</label>
				<div class="form-input"><input id="addDate" type="date" bind:value={addDate} /></div>
			</div>
		</div>
		<div class="form-row">
			<label for="addNote">Keterangan (opsional)</label>
			<div class="form-input"><input id="addNote" type="text" bind:value={addNote} placeholder="cth. Tagihan listrik bulan ini" /></div>
		</div>
	</div>
	<div class="modal-actions">
		<button class="button button-secondary" type="button" onclick={() => (addOpen = false)}>Batal</button>
		<button class="button button-primary" type="button" onclick={submitAdd}>Simpan beban</button>
	</div>
</Modal>

<Modal bind:open={editOpen} title="Ubah beban operasional">
	{#if editing}
		<div class="form-grid">
			<div class="form-row">
				<label for="editCategory">Kategori</label>
				<div class="form-input">
					<select id="editCategory" bind:value={editCategory}>
						{#each EXPENSE_CATEGORIES as cat}
							<option value={cat.id}>{cat.label}</option>
						{/each}
					</select>
				</div>
			</div>
			<div class="form-grid two">
				<div class="form-row">
					<label for="editAmount">Jumlah (Rp)</label>
					<div class="form-input"><input id="editAmount" type="number" min="0" step="any" bind:value={editAmount} /></div>
				</div>
				<div class="form-row">
					<label for="editDate">Tanggal</label>
					<div class="form-input"><input id="editDate" type="date" bind:value={editDate} /></div>
				</div>
			</div>
			<div class="form-row">
				<label for="editNote">Keterangan (opsional)</label>
				<div class="form-input"><input id="editNote" type="text" bind:value={editNote} /></div>
			</div>
		</div>
		<div class="modal-actions">
			<button class="button button-secondary" type="button" onclick={closeEdit}>Batal</button>
			<button class="button button-primary" type="button" onclick={submitEdit}>Simpan perubahan</button>
		</div>
	{/if}
</Modal>

<style>
	.month-picker {
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
	.month-picker svg {
		width: 15px;
		height: 15px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.6;
	}
	.month-picker input {
		border: none;
		background: none;
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		color: var(--forest-800);
	}
</style>