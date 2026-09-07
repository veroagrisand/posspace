<script lang="ts">
	import { showToast } from '$lib/toast.svelte';
	import { store, recordPurchase, createOpname, approveOpname, stockStatus, formatClockLabel, purchaseUnitsFor, setIngredientCost, formatRupiahExact } from '$lib/store.svelte';
	import { page } from '$app/state';
	import Modal from '$lib/components/Modal.svelte';

	const formatIDR = (amount: number) => `Rp ${new Intl.NumberFormat('id-ID').format(Math.max(0, Math.round(amount)))}`;

	let purchaseOpen = $state(false);
	let purchaseIngredient = $state('');
	let purchaseSupplier = $state('');
	let purchaseQty = $state(0);
	let purchaseUnit = $state('gram');
	let purchaseTotal = $state(0);

	let costOpen = $state(false);
	let costIngredient = $state('');
	let costValue = $state(0);

	// Hitung harga modal otomatis: harga modal = total harga ÷ jumlah
	let costQtyAuto = $state(0);
	let costTotalAuto = $state(0);
	const costCostAuto = $derived(costQtyAuto > 0 ? costTotalAuto / costQtyAuto : 0);

	function syncCostAuto() {
		if (costQtyAuto > 0 && costTotalAuto > 0) {
			costValue = Math.round(costCostAuto * 100) / 100;
		}
	}

	let opnameOpen = $state(false);
	let opnameIngredient = $state('');
	let opnameActual = $state(0);
	let pendingOpname = $state<string | null>(null);

	let opnameReason = $state('');
	let typeFilter = $state('all');
	let saving = $state(false);
	let purchaseActionHandled = $state(false);

	const movementTypes = [
		{ id: 'all', label: 'Semua' },
		{ id: 'sale', label: 'Terjual' },
		{ id: 'purchase', label: 'Masuk' },
		{ id: 'opname', label: 'Opname' },
		{ id: 'adjustment', label: 'Penyesuaian' }
	];

	const selectedPurchaseIng = $derived(store.ingredients.find((i) => i.id === purchaseIngredient));
	const purchaseUnits = $derived(purchaseUnitsFor(selectedPurchaseIng?.unit ?? 'gram'));
	const purchaseFactor = $derived(purchaseUnits.find((u) => u.id === purchaseUnit)?.factor ?? 1);
	const baseQuantity = $derived(purchaseQty * purchaseFactor);
	const purchaseUnitPrice = $derived(baseQuantity > 0 ? purchaseTotal / baseQuantity : 0);
	const selectedCostIng = $derived(store.ingredients.find((i) => i.id === costIngredient));

	function openPurchase() {
		const first = store.ingredients[0];
		purchaseIngredient = first?.id ?? '';
		purchaseSupplier = '';
		purchaseQty = 0;
		purchaseUnit = first ? purchaseUnitsFor(first.unit)[0].id : 'gram';
		purchaseTotal = 0;
		purchaseOpen = true;
	}

	$effect(() => {
		if (!purchaseActionHandled && page.url.searchParams.get('action') === 'purchase' && store.ingredients.length > 0) {
			purchaseActionHandled = true;
			openPurchase();
		}
	});

	function changePurchaseIngredient() {
		const ing = store.ingredients.find((i) => i.id === purchaseIngredient);
		if (ing) purchaseUnit = purchaseUnitsFor(ing.unit)[0].id;
		purchaseQty = 0;
		purchaseTotal = 0;
	}

	async function submitPurchase() {
		if (saving) return;
		if (!purchaseIngredient || baseQuantity <= 0) {
			showToast('Isi jumlah pembelian yang valid');
			return;
		}
		if (purchaseTotal <= 0) {
			showToast('Isi total harga pembelian');
			return;
		}
		saving = true;
		try {
			await recordPurchase({
				ingredientId: purchaseIngredient,
				supplier: purchaseSupplier || 'Pemasok',
				quantity: purchaseQty,
				unit: purchaseUnit,
				totalPrice: purchaseTotal
			});
			purchaseOpen = false;
			showToast('Pembelian dicatat, stok bertambah otomatis');
		} catch (err) {
			showToast(`Gagal mencatat pembelian: ${err instanceof Error ? err.message : 'error'}`);
		} finally {
			saving = false;
		}
	}

	function openCost(ing: { id: string; name: string; costPerUnit: number }) {
		costIngredient = ing.id;
		costValue = ing.costPerUnit;
		costQtyAuto = 0;
		costTotalAuto = 0;
		costOpen = true;
	}

	async function submitCost() {
		if (saving) return;

		if (!costIngredient) return;
		if (!Number.isFinite(costValue) || costValue < 0) {
			showToast('Harga modal tidak valid');
			return;
		}
		saving = true;
		try {
			await setIngredientCost(costIngredient, costValue);
			costOpen = false;
			showToast('Harga modal diperbarui, HPP & laporan terhitung ulang');
		} catch (err) {
			showToast(`Gagal mengubah harga modal: ${err instanceof Error ? err.message : 'error'}`);
		} finally {
			saving = false;
		}
	}

	function openOpname() {
		opnameIngredient = store.ingredients.find((i) => i.stock <= i.minStock)?.id ?? store.ingredients[0]?.id ?? '';
		opnameActual = store.ingredients.find((i) => i.id === opnameIngredient)?.stock ?? 0;
		pendingOpname = null;
		opnameOpen = true;
	}

	async function submitOpname() {
		if (saving) return;

		if (!opnameIngredient) return;
		saving = true;
		try {
			const opnameId = await createOpname(opnameIngredient, opnameActual);
			pendingOpname = opnameId ?? null;
			showToast('Hasil hitung fisik dicatat sebagai draft');
		} catch (err) {
			showToast(`Gagal membuat opname: ${err instanceof Error ? err.message : 'error'}`);
		} finally {
			saving = false;
		}
	}

	async function approveCurrent() {
		if (saving) return;

		if (!pendingOpname) return;
		if (!opnameReason.trim()) {
			showToast('Alasan selisih wajib diisi');
			return;
		}
		saving = true;
		try {
			await approveOpname(pendingOpname, opnameReason.trim());
			opnameReason = '';
			opnameOpen = false;
			showToast('Selisih disetujui, stok sistem disesuaikan');
		} catch (err) {
			showToast(`Gagal menyetujui opname: ${err instanceof Error ? err.message : 'error'}`);
		} finally {
			saving = false;
		}
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
			<p>Pembelian, opname, dan koreksi selisih: semuanya dengan jejak audit yang jelas.</p>
		</div>
		<div class="heading-actions">
			<button class="button button-secondary" type="button" onclick={openOpname}>Hitung fisik</button>
			<button class="button button-primary" type="button" onclick={openPurchase}>+ Catat pembelian</button>
		</div>
	</section>

	<section id="stok" class="panel" style="padding: 24px">
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
						<th>Harga modal</th>
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
								<button class="hpp-cell" type="button" onclick={() => openCost(ing)} title="Klik untuk ubah harga modal">
									<span>{ing.costPerUnit > 0 ? formatRupiahExact(ing.costPerUnit) : '-'}</span>
									<small>/{ing.unit} · set</small>
								</button>
							</td>
							<td>
								<span class="stock-status {status === 'critical' ? 'critical' : status === 'warning' ? 'warning' : 'ok'}">
									{status === 'critical' ? 'Kritis' : status === 'warning' ? 'Menipis' : 'Aman'}
								</span>
							</td>
						</tr>
					{:else}
						<tr><td colspan="6" class="empty-cell">Belum ada bahan baku. Tambahkan bahan pertama di halaman ini.</td></tr>
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
								<td style="max-width:200px;font-size:11px">{opname.reason || '-'}</td>
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
					<button class="category-tab" class:active={typeFilter === type.id} type="button" role="tab" aria-selected={typeFilter === type.id} onclick={() => (typeFilter = type.id)}>{type.label}</button>
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
							<td style="color:#5d6861">{formatClockLabel(movement.at)}</td>
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
				<select id="purchaseIngredient" bind:value={purchaseIngredient} onchange={changePurchaseIngredient}>
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
				<label for="purchaseQty">Jumlah</label>
				<div class="form-input"><input id="purchaseQty" type="number" min="0" step="any" bind:value={purchaseQty} /></div>
			</div>
			<div class="form-row">
				<label for="purchaseUnit">Satuan beli</label>
				<div class="form-input">
					<select id="purchaseUnit" bind:value={purchaseUnit}>
						{#each purchaseUnits as u}
							<option value={u.id}>{u.label}</option>
						{/each}
					</select>
				</div>
			</div>
		</div>
		<div class="form-row">
			<label for="purchaseTotal">Total harga pembelian (Rp)</label>
			<div class="form-input"><input id="purchaseTotal" type="number" min="0" step="any" bind:value={purchaseTotal} placeholder="cth. 150000 untuk 1 kg" /></div>
		</div>
		<p class="purchase-preview" style="margin:2px 0 0">
			{baseQuantity > 0
				? `≈ ${formatRupiahExact(purchaseUnitPrice)} per ${selectedPurchaseIng?.unit ?? ''} · stok bertambah ${baseQuantity.toLocaleString('id-ID')} ${selectedPurchaseIng?.unit ?? ''}`
				: 'Masukkan jumlah & total harga untuk melihat harga/satuan.'}
			<br />Harga modal (HPP) <b>tidak berubah otomatis</b>, sesuaikan manual di kolom "Harga modal" bila harga beli berubah.
		</p>
	</div>
	<div class="modal-actions">
		<button class="button button-secondary" type="button" disabled={saving} onclick={() => (purchaseOpen = false)}>Batal</button>
		<button class="button button-primary" type="button" disabled={saving} onclick={submitPurchase}>
			{#if saving}<span class="btn-spinner"></span>Menyimpan...{:else}Simpan pembelian{/if}
		</button>
	</div>
</Modal>

<Modal bind:open={costOpen} title="Atur harga modal (HPP)">
	<div class="form-grid">
		<div class="form-row">
			<label for="costIngredient">Bahan</label>
			<div class="form-input">
				<select id="costIngredient" bind:value={costIngredient}>
					{#each store.ingredients as ing}
						<option value={ing.id}>{ing.name} ({ing.unit})</option>
					{/each}
				</select>
			</div>
		</div>
		<div class="form-row">
			<label for="costValue">Harga modal per {selectedCostIng?.unit ?? ''} (Rp)</label>
			<div class="form-input"><input id="costValue" type="number" min="0" step="any" bind:value={costValue} /></div>
		</div>
		<div class="form-row auto-cost-row">
			<span class="auto-cost-label">Hitung otomatis dari jumlah &amp; total harga</span>
			<div class="form-grid two">
				<div class="form-row">
					<label for="costQtyAuto">Jumlah ({selectedCostIng?.unit ?? ''})</label>
					<div class="form-input"><input id="costQtyAuto" type="number" min="0" step="any" bind:value={costQtyAuto} oninput={syncCostAuto} placeholder="cth. 200" /></div>
				</div>
				<div class="form-row">
					<label for="costTotalAuto">Total harga (Rp)</label>
					<div class="form-input"><input id="costTotalAuto" type="number" min="0" step="any" bind:value={costTotalAuto} oninput={syncCostAuto} placeholder="cth. 150000" /></div>
				</div>
			</div>
			{#if costQtyAuto > 0 && costTotalAuto > 0}
				<p class="purchase-preview" style="margin:6px 0 0">= {formatRupiahExact(costCostAuto)} per {selectedCostIng?.unit ?? ''} &nbsp;({new Intl.NumberFormat('id-ID').format(Math.round(costTotalAuto))} ÷ {costQtyAuto.toLocaleString('id-ID')})</p>
			{:else}
				<p class="purchase-preview" style="margin:6px 0 0">Rumus: harga modal = total harga ÷ jumlah. Contoh: 150.000 ÷ 200 gram = <b>Rp 750/gram</b>.</p>
			{/if}
		</div>
		<p class="purchase-preview" style="margin:2px 0 0">
			HPP menu = Σ (bahan × jumlah resep). Koreksi di sini tidak menambah/mengurangi stok.
		</p>
	</div>
	<div class="modal-actions">
		<button class="button button-secondary" type="button" disabled={saving} onclick={() => (costOpen = false)}>Batal</button>
		<button class="button button-primary" type="button" disabled={saving} onclick={submitCost}>
			{#if saving}<span class="btn-spinner"></span>Menyimpan...{:else}Simpan harga modal{/if}
		</button>
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
			<p style="color:#5d6861;font-size:10px;line-height:1.5">Sistem saat ini mencatat <b style="color:var(--forest-800)">{selectedIng?.stock.toLocaleString('id-ID') ?? 0}</b> {selectedIng?.unit}. Bandingkan dengan hitung fisik di lapangan.</p>
		</div>
		<div class="modal-actions">
			<button class="button button-secondary" type="button" disabled={saving} onclick={() => (opnameOpen = false)}>Batal</button>
			<button class="button button-primary" type="button" disabled={saving} onclick={submitOpname}>
				{#if saving}<span class="btn-spinner"></span>Menyimpan...{:else}Buat draft opname{/if}
			</button>
		</div>
	{:else}
		<div class="opname-diff {activeOpname.difference >= 0 ? 'pos' : 'neg'}">
			<span>Selisih fisik vs sistem</span>
			<strong>{activeOpname.difference >= 0 ? '+' : ''}{activeOpname.difference.toLocaleString('id-ID')} {selectedIng?.unit}</strong>
		</div>
		<p style="color:#5e6a64;font-size:11px;margin-top:12px;line-height:1.5">Setujui selisih dengan alasan agar stok sistem disesuaikan dan tercatat di riwayat audit.</p>
		<div class="au-field">
			<label for="opnameReason">Alasan koreksi selisih</label>
			<div class="form-input"><input id="opnameReason" type="text" bind:value={opnameReason} placeholder="cth. Bahan tumpah saat penyimpanan" /></div>
		</div>
		<div class="modal-actions">
			<button class="button button-secondary" type="button" disabled={saving} onclick={rejectCurrent}>Tolak</button>
			<button class="button button-primary" type="button" disabled={saving} onclick={approveCurrent}>
				{#if saving}<span class="btn-spinner"></span>Menyimpan...{:else}Setujui &amp; sesuaikan{/if}
			</button>
		</div>
	{/if}
</Modal>

<style>
	.hpp-cell {
		display: inline-flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 1px;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		color: var(--forest-800);
		text-align: left;
	}
	.hpp-cell span {
		font-family: var(--font-display);
		font-weight: 700;
	}
	.hpp-cell small {
		color: var(--brand-orange);
		font-size: 9px;
		font-weight: 700;
		text-transform: uppercase;
	}
	.hpp-cell:hover small {
		text-decoration: underline;
	}
	.purchase-preview {
		color: #5e6a64;
		font-size: 11px;
		line-height: 1.5;
	}

	.auto-cost-row {
		padding: 12px;
		border: 1px solid var(--line-strong);
		border-radius: 12px;
		background: var(--surface);
	}

	.auto-cost-label {
		display: block;
		color: var(--ink-soft);
		font-size: 10px;
		font-weight: 700;
		margin-bottom: 2px;
	}
</style>
