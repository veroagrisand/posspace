<script lang="ts">
	import { showToast } from '$lib/toast.svelte';
	import { store, recordPurchase, createOpname, approveOpname, stockStatus, formatClockLabel } from '$lib/store.svelte';
	import Modal from '$lib/components/Modal.svelte';

	const formatIDR = (amount: number) => `Rp ${new Intl.NumberFormat('id-ID').format(Math.max(0, Math.round(amount)))}`;

	let purchaseOpen = $state(false);
	let purchaseIngredient = $state('');
	let purchaseSupplier = $state('');
	let purchaseQty = $state(0);
	let purchasePrice = $state(0);

	let opnameOpen = $state(false);
	let opnameIngredient = $state('');
	let opnameActual = $state(0);
	let pendingOpname = $state<string | null>(null);

	let opnameReason = $state('');
	let typeFilter = $state('all');

	const movementTypes = [
		{ id: 'all', label: 'Semua' },
		{ id: 'sale', label: 'Terjual' },
		{ id: 'purchase', label: 'Masuk' },
		{ id: 'opname', label: 'Opname' },
		{ id: 'adjustment', label: 'Penyesuaian' }
	];

	function openPurchase() {
		purchaseIngredient = store.ingredients[0]?.id ?? '';
		purchaseSupplier = '';
		purchaseQty = 0;
		purchasePrice = 0;
		purchaseOpen = true;
	}

	async function submitPurchase() {
		if (!purchaseIngredient || purchaseQty <= 0) return;
		await recordPurchase({ ingredientId: purchaseIngredient, supplier: purchaseSupplier || 'Pemasok', quantity: purchaseQty, unitPrice: purchasePrice });
		purchaseOpen = false;
		showToast('Pembelian dicatat, stok bertambah otomatis');
	}

	function openOpname() {
		opnameIngredient = store.ingredients.find((i) => i.stock <= i.minStock)?.id ?? store.ingredients[0]?.id ?? '';
		opnameActual = store.ingredients.find((i) => i.id === opnameIngredient)?.stock ?? 0;
		pendingOpname = null;
		opnameOpen = true;
	}

	async function submitOpname() {
		if (!opnameIngredient) return;
		const opnameId = await createOpname(opnameIngredient, opnameActual);
		pendingOpname = opnameId ?? null;
		showToast('Hasil hitung fisik dicatat sebagai draft');
	}

	async function approveCurrent() {
		if (!pendingOpname) return;
		if (!opnameReason.trim()) {
			showToast('Alasan selisih wajib diisi');
			return;
		}
		await approveOpname(pendingOpname, opnameReason.trim());
		opnameOpen = false;
		opnameReason = '';
		showToast('Selisih disetujui, stok sistem disesuaikan');
	}

	function rejectCurrent() {
		opnameOpen = false;
		opnameReason = '';
		pendingOpname = null;
		showToast('Opname draft dibatalkan');
	}

	const filteredMovements = $derived(store.movements.filter((m) => typeFilter === 'all' || m.type === typeFilter));
	const selectedIng = $derived(store.ingredients.find((i) => i.id === opnameIngredient));
	const activeOpname = $derived(pendingOpname ? store.opnames.find((o) => o.id === pendingOpname) : null);
</script>

<header class="topbar">
	<div class="breadcrumbs" aria-label="Breadcrumb">
		<span>Operasional</span>
		<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
		<strong>Inventaris</strong>
	</div>
</header>

<div class="page-content">
	<section class="page-heading">
		<div>
			<div class="eyebrow"><span class="eyebrow-line"></span> STOK REAL-TIME · FASE 3</div>
			<h1>Bahan baku selalu terpantau.</h1>
			<p>Pembelian, opname, dan koreksi selisih — semuanya dengan jejak audit yang jelas.</p>
		</div>
		<div class="heading-actions">
			<button class="button button-secondary" type="button" onclick={openOpname}>Hitung fisik</button>
			<button class="button button-primary" type="button" onclick={openPurchase}>+ Catat pembelian</button>
		</div>
	</section>

	<section class="panel" style="padding: 24px">
		<div class="panel-heading compact-heading" style="margin-bottom: 18px">
			<div><div class="section-kicker">KETERSEDIAAN BAHAN</div><h2>Stok saat ini</h2></div>
			<span class="live-label"><i></i> Live</span>
		</div>
		<div style="overflow-x:auto">
			<table class="data-table">
				<thead>
					<tr>
						<th>Bahan</th>
						<th>Satuan</th>
						<th>Stok</th>
						<th>Batas minimum</th>
						<th>Status</th>
					</tr>
				</thead>
				<tbody>
					{#each store.ingredients as ing}
						{@const status = stockStatus(ing)}
						<tr>
							<td>{ing.name}</td>
							<td>{ing.unit}</td>
							<td style="font-family:var(--font-display)">{ing.stock.toLocaleString('id-ID')} {ing.unit}</td>
							<td>{ing.minStock.toLocaleString('id-ID')} {ing.unit}</td>
							<td>
								<span class="stock-status {status === 'critical' ? 'critical' : status === 'warning' ? 'warning' : 'ok'}">
									{status === 'critical' ? 'Kritis' : status === 'warning' ? 'Menipis' : 'Aman'}
								</span>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	<section class="panel" style="padding: 24px;margin-top: 19px">
		<div class="panel-heading compact-heading" style="margin-bottom: 18px">
			<div><div class="section-kicker">STOCK OPNAME</div><h2>Hasil hitung fisik &amp; koreksi</h2></div>
			<button class="text-button" type="button" onclick={openOpname}>+ Hitung fisik baru</button>
		</div>
		{#if store.opnames.length === 0}
			<div class="cart-empty" style="padding-top:16px">
				<strong style="font-size:12px">Belum ada opname</strong>
				<p>Klik "Hitung fisik" untuk mulai mencocokkan stok.</p>
			</div>
		{:else}
			<div style="overflow-x:auto">
				<table class="data-table">
					<thead>
						<tr>
							<th>Bahan</th>
							<th>Sistem</th>
							<th>Fisik</th>
							<th>Selisih</th>
							<th>Alasan</th>
							<th>Status</th>
						</tr>
					</thead>
					<tbody>
						{#each store.opnames as opname}
							<tr>
								<td>{opname.ingredientName}</td>
								<td style="font-family:var(--font-display)">{opname.systemQty.toLocaleString('id-ID')}</td>
								<td style="font-family:var(--font-display)">{opname.actualQty.toLocaleString('id-ID')}</td>
								<td style="font-family:var(--font-display);color:{opname.difference >= 0 ? 'var(--green)' : 'var(--red)'}">{opname.difference >= 0 ? '+' : ''}{opname.difference.toLocaleString('id-ID')}</td>
								<td style="max-width:200px;font-size:11px">{opname.reason || '—'}</td>
								<td><span class="stock-status {opname.status === 'approved' ? 'ok' : 'warning'}">{opname.status === 'approved' ? 'Disetujui' : 'Draft'}</span></td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>

	<section class="panel" style="padding: 24px;margin-top: 19px">
		<div class="panel-heading compact-heading" style="margin-bottom: 18px">
			<div><div class="section-kicker">RIWAYAT PERGERAKAN</div><h2>Aktivitas stok</h2></div>
			<div class="category-tabs" role="tablist" aria-label="Filter jenis pergerakan">
				{#each movementTypes as type}
					<button class="category-tab" class:active={typeFilter === type.id} type="button" onclick={() => (typeFilter = type.id)}>{type.label}</button>
				{/each}
			</div>
		</div>
		<div style="overflow-x:auto">
			<table class="data-table">
				<thead>
					<tr>
						<th>Jenis</th>
						<th>Keterangan</th>
						<th>Perubahan</th>
						<th>Waktu</th>
					</tr>
				</thead>
				<tbody>
					{#each filteredMovements as movement}
						<tr>
							<td>
								<span class="stock-status {movement.type === 'purchase' ? 'ok' : movement.type === 'sale' ? 'critical' : movement.type === 'opname' ? 'warning' : 'warning'}">
									{{ sale: 'Terjual', purchase: 'Masuk', opname: 'Opname', adjustment: 'Penyesuaian', waste: 'Rusak' }[movement.type]}
								</span>
							</td>
							<td>{movement.note}</td>
							<td style="font-family:var(--font-display);color:{movement.change >= 0 ? 'var(--green)' : 'var(--red)'}">{movement.change >= 0 ? '+' : ''}{movement.change.toLocaleString('id-ID')} {store.ingredients.find((i) => i.id === movement.ingredientId)?.unit ?? ''}</td>
							<td style="color:#9aa39c">{formatClockLabel(movement.at)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
</div>

<Modal bind:open={purchaseOpen} title="Catat pembelian stok">
	<div class="form-grid">
		<div class="form-row">
			<label for="purchaseIngredient">Bahan</label>
			<div class="form-input">
				<select id="purchaseIngredient" bind:value={purchaseIngredient}>
					{#each store.ingredients as ing}
						<option value={ing.id}>{ing.name} ({ing.unit})</option>
					{/each}
				</select>
			</div>
		</div>
		<div class="form-row">
			<label for="purchaseSupplier">Pemasok</label>
			<div class="form-input"><input id="purchaseSupplier" type="text" bind:value={purchaseSupplier} placeholder="cth. Fresh Milk Co" /></div>
		</div>
		<div class="form-grid two">
			<div class="form-row">
				<label for="purchaseQty">Jumlah ({store.ingredients.find((i) => i.id === purchaseIngredient)?.unit ?? ''})</label>
				<div class="form-input"><input id="purchaseQty" type="number" min="0" bind:value={purchaseQty} /></div>
			</div>
			<div class="form-row">
				<label for="purchasePrice">Harga satuan (Rp)</label>
				<div class="form-input"><input id="purchasePrice" type="number" min="0" bind:value={purchasePrice} /></div>
			</div>
		</div>
	</div>
	<div class="modal-actions">
		<button class="button button-secondary" type="button" onclick={() => (purchaseOpen = false)}>Batal</button>
		<button class="button button-primary" type="button" onclick={submitPurchase}>Simpan pembelian</button>
	</div>
</Modal>

<Modal bind:open={opnameOpen} title={activeOpname?.status === 'approved' ? 'Selisih disetujui' : 'Hitung fisik (stock opname)'}>
	{#if !activeOpname}
		<div class="form-grid">
			<div class="form-row">
				<label for="opnameIngredient">Bahan yang dihitung</label>
				<div class="form-input">
					<select id="opnameIngredient" bind:value={opnameIngredient} onchange={() => (opnameActual = store.ingredients.find((i) => i.id === opnameIngredient)?.stock ?? 0)}>
						{#each store.ingredients as ing}
							<option value={ing.id}>{ing.name} ({ing.unit})</option>
						{/each}
					</select>
				</div>
			</div>
			<div class="form-row">
				<label for="opnameActual">Jumlah fisik aktual ({selectedIng?.unit})</label>
				<div class="form-input"><input id="opnameActual" type="number" min="0" bind:value={opnameActual} /></div>
			</div>
			<p style="color:#9aa39c;font-size:10px;line-height:1.5">Sistem saat ini mencatat <b style="color:var(--forest-800)">{selectedIng?.stock.toLocaleString('id-ID') ?? 0}</b> {selectedIng?.unit}. Bandingkan dengan hitung fisik di lapangan.</p>
		</div>
		<div class="modal-actions">
			<button class="button button-secondary" type="button" onclick={() => (opnameOpen = false)}>Batal</button>
			<button class="button button-primary" type="button" onclick={submitOpname}>Buat draft opname</button>
		</div>
	{:else}
		<div class="opname-diff {activeOpname.difference >= 0 ? 'pos' : 'neg'}">
			<span>Selisih fisik vs sistem</span>
			<strong>{activeOpname.difference >= 0 ? '+' : ''}{activeOpname.difference.toLocaleString('id-ID')} {selectedIng?.unit}</strong>
		</div>
		<p style="color:#7f8b82;font-size:11px;margin-top:12px;line-height:1.5">Setujui selisih dengan alasan agar stok sistem disesuaikan dan tercatat di riwayat audit.</p>
		<div class="au-field">
			<label for="opnameReason">Alasan koreksi selisih</label>
			<div class="form-input"><input id="opnameReason" type="text" bind:value={opnameReason} placeholder="cth. Bahan tumpah saat penyimpanan" /></div>
		</div>
		<div class="modal-actions">
			<button class="button button-secondary" type="button" onclick={rejectCurrent}>Tolak</button>
			<button class="button button-primary" type="button" onclick={approveCurrent}>Setujui &amp; sesuaikan</button>
		</div>
	{/if}
</Modal>
