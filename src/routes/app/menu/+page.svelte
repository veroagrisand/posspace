<script lang="ts">
	import { showToast } from '$lib/toast.svelte';
	import { store, categories, backend, addProduct, addIngredient, updateIngredient, toggleProductActive, deleteProduct, saveProductFull, hppOf, formatRupiahExact } from '$lib/store.svelte';
	import type { Variant } from '$lib/store.svelte';
	import Modal from '$lib/components/Modal.svelte';

	const formatIDR = (amount: number) => `Rp ${new Intl.NumberFormat('id-ID').format(Math.max(0, Math.round(amount)))}`;

	// Status proses (mencegah input ganda saat tombol ditekan berkali-kali)
	let saving = $state(false);
	let busyMenu = $state('');

	// Tambah menu
	let addOpen = $state(false);
	let addName = $state('');
	let addCategory = $state('Kopi');
	let addVariantName = $state('Reguler');
	let addPrice = $state(18000);

	// Kelola menu (draft lokal, disimpan sekali)
	type DraftRecipe = { ingredientId: string; qty: number };
	type DraftVariant = { id: string | null; name: string; price: number; recipe: DraftRecipe[] };

	let manageProductId = $state('');
	let manageOpen = $state(false);
	let draftName = $state('');
	let draftCategory = $state('Kopi');
	let draftVariants = $state<DraftVariant[]>([]);
	let newVariantName = $state('');
	let newVariantPrice = $state(0);

	// Bahan baku: langkah modal — pilih dulu: bahan baru atau bahan yang sudah ada.
	type IngStep = 'choose' | 'new' | 'existing';
	let ingOpen = $state(false);
	let ingStep = $state<IngStep>('choose');
	let ingEditId = $state<string | null>(null);
	let ingName = $state('');
	let ingUnit = $state<'gram' | 'ml' | 'pcs'>('gram');
	let ingStock = $state(0);
	let ingMin = $state(0);
	let ingCost = $state(0);
	let ingPick = $state('');
	let ingStockAdd = $state(0);

	const ingEdited = $derived(store.ingredients.find((i) => i.id === ingEditId));
	const ingModalTitle = $derived(
		ingStep === 'choose' ? 'Kelola bahan baku' : ingStep === 'new' ? 'Tambah bahan baru' : ingEditId ? 'Ubah bahan baku' : 'Pilih bahan yang sudah ada'
	);

	// Hitung harga modal otomatis: harga modal = total harga ÷ jumlah
	let ingQtyAuto = $state(0);
	let ingTotalAuto = $state(0);
	const ingCostAuto = $derived(ingQtyAuto > 0 ? ingTotalAuto / ingQtyAuto : 0);

	function syncIngCostAuto() {
		if (ingQtyAuto > 0 && ingTotalAuto > 0) {
			ingCost = Math.round(ingCostAuto * 100) / 100;
		}
	}

	// Bahan lain (bukan yang sedang diedit) dengan nama sama persis (abaikan huruf besar/kecil).
	const ingNameTaken = $derived(store.ingredients.find((i) => i.id !== ingEditId && i.name.toLowerCase() === ingName.trim().toLowerCase()));

	function withSaving(action: () => Promise<void>, onFail?: () => void) {
		if (saving) return;
		saving = true;
		action()
			.catch((err) => {
				const message = err instanceof Error ? err.message : 'Terjadi kesalahan';
				showToast(`Gagal: ${message}`);
				onFail?.();
			})
			.finally(() => (saving = false));
	}

	function openManage(id: string) {
		const p = store.products.find((x) => x.id === id);
		if (!p) return;
		manageProductId = id;
		draftName = p.name;
		draftCategory = p.category;
		draftVariants = p.variants.map((v) => ({
			id: v.id,
			name: v.name,
			price: v.price,
			recipe: v.recipe.map((r) => ({ ...r }))
		}));
		newVariantName = '';
		newVariantPrice = 0;
		manageOpen = true;
	}

	async function submitAdd() {
		if (saving || !addName.trim()) return;
		withSaving(async () => {
			await addProduct({ name: addName.trim(), category: addCategory, price: addPrice, variantName: addVariantName.trim() || 'Reguler' });
			addName = '';
			addVariantName = 'Reguler';
			addPrice = 18000;
			addOpen = false;
			showToast('Menu baru ditambahkan');
		});
	}

	// Operasi draft pada modal kelola (tanpa API — disimpan sekali)
	function draftAddIngredient(variant: DraftVariant) {
		const ingId = store.ingredients[0]?.id;
		if (!ingId) return;
		variant.recipe = [...variant.recipe, { ingredientId: ingId, qty: 1 }];
	}

	function draftRemoveIngredient(variant: DraftVariant, index: number) {
		variant.recipe = variant.recipe.filter((_, i) => i !== index);
	}

	function draftAddVariant() {
		if (saving || !newVariantName.trim() || newVariantPrice <= 0) return;
		draftVariants = [
			...draftVariants,
			{ id: `__new__${Date.now()}`, name: newVariantName.trim(), price: newVariantPrice, recipe: [] }
		];
		newVariantName = '';
		newVariantPrice = 0;
	}

	function draftRemoveVariant(variantId: string) {
		draftVariants = draftVariants.filter((v) => v.id !== variantId);
	}

	function draftHpp(variant: DraftVariant): number {
		return hppOf({ id: variant.id ?? '', name: variant.name, price: variant.price, recipe: variant.recipe } as Variant);
	}

	async function saveManage() {
		if (saving || !draftName.trim()) return;
		const p = store.products.find((x) => x.id === manageProductId);
		if (!p) return;
		// Salin dulu ke draft lokal; store baru dimutasi setelah server berhasil.
		const nextVariants = draftVariants.map((v) => ({
			id: v.id ?? `__new__${Date.now()}`,
			name: v.name.trim() || 'Reguler',
			price: v.price,
			recipe: v.recipe.filter((r) => r.ingredientId && r.qty > 0).map((r) => ({ ...r }))
		}));
		const previous = { name: p.name, category: p.category, variants: p.variants };
		const applyDraft = () => {
			p.name = draftName.trim();
			p.category = draftCategory;
			p.variants = nextVariants;
		};
		applyDraft();
		withSaving(async () => {
			try {
				if (backend.enabled) {
					await saveProductFull(p.id);
				}
				manageOpen = false;
				showToast('Perubahan menu disimpan');
			} catch (err) {
				// Kembalikan data toko ke kondisi sebelum draft (rollback UI).
				p.name = previous.name;
				p.category = previous.category;
				p.variants = previous.variants;
				throw err;
			}
		});
	}

	async function confirmDeleteProduct() {
		if (saving) return;
		if (!window.confirm(`Hapus menu "${draftName}" beserta semua varian & resepnya? Tindakan ini tidak bisa dibatalkan.`)) return;
		withSaving(async () => {
			await deleteProduct(manageProductId);
			manageOpen = false;
			showToast('Menu dihapus');
		});
	}

	async function submitIngredient() {
		if (saving || !ingName.trim()) return;
		if (ingNameTaken) {
			showToast(ingEditId ? `Nama "${ingNameTaken.name}" sudah dipakai bahan lain` : `Bahan "${ingNameTaken.name}" sudah ada. Gunakan "Ubah" di daftar, jangan duplikat`);
			return;
		}
		withSaving(async () => {
			if (ingEditId) {
				await updateIngredient(ingEditId, { name: ingName.trim(), unit: ingUnit, minStock: ingMin, costPerUnit: ingCost, stockToAdd: ingStockAdd });
				showToast(
					ingStockAdd > 0
						? `Stok ${ingName.trim()} ditambah ${Number(ingStockAdd).toLocaleString('id-ID')} ${ingUnit}`
						: 'Bahan baku diperbarui'
				);
			} else {
				const result = await addIngredient({ name: ingName.trim(), unit: ingUnit, stock: ingStock, minStock: ingMin, costPerUnit: ingCost });
				showToast(
					result.merged
						? `Bahan sudah ada, stok ditambah ${Number(ingStock).toLocaleString('id-ID')} ${ingUnit}`
						: 'Bahan baku ditambahkan'
				);
			}
			ingOpen = false;
		});
	}

	function openIngredient(id: string | null) {
		if (saving) return;
		ingEditId = id;
		ingPick = '';
		ingStockAdd = 0;
		const ing = id ? store.ingredients.find((i) => i.id === id) : null;
		ingName = ing?.name ?? '';
		ingUnit = ing?.unit ?? 'gram';
		ingStock = ing?.stock ?? 0;
		ingMin = ing?.minStock ?? 0;
		ingCost = ing?.costPerUnit ?? 0;
		ingQtyAuto = 0;
		ingTotalAuto = 0;
		ingStep = id ? 'existing' : 'choose';
		ingOpen = true;
	}

	function pickIngredient() {
		if (saving) return;
		ingEditId = null;
		ingPick = '';
		ingStockAdd = 0;
		ingStep = 'existing';
	}

	function backToIngChoose() {
		ingEditId = null;
		ingPick = '';
		ingStockAdd = 0;
		ingStep = 'choose';
	}

	function onIngPick(e: Event) {
		const v = (e.currentTarget as HTMLSelectElement).value;
		(e.currentTarget as HTMLSelectElement).value = '';
		const ing = store.ingredients.find((i) => i.id === v);
		if (ing) openIngredient(ing.id);
	}

	async function toggleActive(productId: string) {
		if (saving) return;
		busyMenu = productId;
		try {
			await toggleProductActive(productId);
		} catch (err) {
			showToast(`Gagal mengubah status: ${err instanceof Error ? err.message : 'error'}`);
		} finally {
			busyMenu = '';
		}
	}
</script>

<header class="topbar">
	<div class="breadcrumbs" aria-label="Breadcrumb">
		<span>Operasional</span>
		<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
		<strong>Menu &amp; resep</strong>
	</div>
</header>

<div class="page-content">
	<section class="page-heading">
		<div>
			<div class="eyebrow"><span class="eyebrow-line"></span> FASE 2 - ATUR MENU &amp; RESEP</div>
			<h1>Menu, resep, dan bahan baku.</h1>
			<p>Setiap varian punya harga dan resep sendiri. HPP dihitung otomatis dari BOM.</p>
		</div>
		<div class="heading-actions">
			<button class="button button-secondary" type="button" disabled={saving} onclick={() => openIngredient(null)}>+ Kelola bahan</button>
			<button class="button button-primary" type="button" disabled={saving} onclick={() => (addOpen = true)}>+ Tambah menu</button>
		</div>
	</section>

	<section class="panel" style="padding: 24px">
		<div class="panel-heading compact-heading" style="margin-bottom: 18px">
			<div><div class="section-kicker">DAFTAR MENU</div><h2>Menu aktif</h2></div>
			<span style="color:#5d6861;font-size:11px">{store.products.length} menu</span>
		</div>
		<div style="overflow-x:auto">
			<table class="data-table">
				<thead>
					<tr>
						<th>Menu</th>
						<th>Kategori</th>
						<th>Varian</th>
						<th>Harga</th>
						<th>HPP</th>
						<th>Marjin</th>
						<th>Status</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each store.products as product}
						<tr>
							<td>{product.name}</td>
							<td>{product.category}</td>
							<td>{product.variants.map((v) => v.name).join(' · ')}</td>
							<td style="font-family:var(--font-display)">
								{#each product.variants as variant}
									<div class="hpp-line">{formatIDR(variant.price)}</div>
								{/each}
							</td>
							<td style="font-family:var(--font-display)">
								{#each product.variants as variant}
									<div class="hpp-line">{formatRupiahExact(hppOf(variant))}</div>
								{/each}
							</td>
							<td style="color:var(--green);font-weight:700">
								{#each product.variants as variant}
									<div class="hpp-line">{variant.price ? Math.round(((variant.price - hppOf(variant)) / variant.price) * 100) : 0}%</div>
								{/each}
							</td>
							<td>
								<label class="switch">
									<input
										type="checkbox"
										checked={product.isActive}
										disabled={saving || busyMenu === product.id}
										aria-label="{product.name} aktif"
										onchange={() => toggleActive(product.id)}
									/>
									<i></i>
								</label>
							</td>
							<td>
								<button class="text-button" type="button" disabled={saving} onclick={() => openManage(product.id)}>
									Kelola <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
								</button>
							</td>
						</tr>
					{:else}
						<tr><td colspan="8" class="empty-cell">Belum ada menu. Tambahkan menu pertama Anda.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	<section class="panel" style="padding: 24px;margin-top: 19px">
		<div class="panel-heading compact-heading" style="margin-bottom: 18px">
			<div><div class="section-kicker">KELOLA BAHAN BAKU</div><h2>Ingredient &amp; satuan</h2></div>
			<button class="text-button" type="button" disabled={saving} onclick={() => openIngredient(null)}>+ Tambah bahan</button>
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
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each store.ingredients as ing}
						<tr>
							<td>{ing.name}</td>
							<td>{ing.unit}</td>
							<td style="font-family:var(--font-display)">{ing.stock.toLocaleString('id-ID')} {ing.unit}</td>
							<td>{ing.minStock.toLocaleString('id-ID')} {ing.unit}</td>
							<td>
								<span class="stock-status {ing.stock <= ing.minStock * 0.4 ? 'critical' : ing.stock <= ing.minStock ? 'warning' : 'ok'}">
									{ing.stock <= ing.minStock * 0.4 ? 'Kritis' : ing.stock <= ing.minStock ? 'Menipis' : 'Aman'}
								</span>
							</td>
							<td><button class="text-button" type="button" disabled={saving} onclick={() => openIngredient(ing.id)}>Ubah</button></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
</div>

<Modal bind:open={addOpen} title="Tambah menu baru">
	<div class="form-grid">
		<div class="form-row">
			<label for="addName">Nama menu</label>
			<div class="form-input"><input id="addName" type="text" bind:value={addName} placeholder="cth. Espresso" disabled={saving} /></div>
		</div>
		<div class="form-grid two">
			<div class="form-row">
				<label for="addCategory">Kategori</label>
				<div class="form-input">
					<select id="addCategory" bind:value={addCategory} disabled={saving}>
						{#each categories as category}
							<option value={category}>{category}</option>
						{/each}
					</select>
				</div>
			</div>
			<div class="form-row">
				<label for="addVariantName">Nama varian awal</label>
				<div class="form-input"><input id="addVariantName" type="text" bind:value={addVariantName} placeholder="Reguler" disabled={saving} /></div>
			</div>
		</div>
		<div class="form-row">
			<label for="addPrice">Harga awal (Rp)</label>
			<div class="form-input"><input id="addPrice" type="number" min="0" step="1000" bind:value={addPrice} disabled={saving} /></div>
		</div>
	</div>
	<div class="modal-actions">
		<button class="button button-secondary" type="button" disabled={saving} onclick={() => (addOpen = false)}>Batal</button>
		<button class="button button-primary" type="button" disabled={saving} onclick={submitAdd}>
			{#if saving}<span class="btn-spinner"></span> Menyimpan...{:else}Simpan menu{/if}
		</button>
	</div>
</Modal>

<Modal bind:open={manageOpen} title={`Kelola menu - ${draftName}`} wide>
	<div class="form-grid">
		<div class="form-grid two">
			<div class="form-row">
				<label for="draftName">Nama menu</label>
				<div class="form-input"><input id="draftName" type="text" bind:value={draftName} disabled={saving} /></div>
			</div>
			<div class="form-row">
				<label for="draftCategory">Kategori</label>
				<div class="form-input">
					<select id="draftCategory" bind:value={draftCategory} disabled={saving}>
						{#each categories as category}
							<option value={category}>{category}</option>
						{/each}
					</select>
				</div>
			</div>
		</div>

		<div class="form-row">
			<span style="display:block;color:var(--ink-soft);font-size:10px;font-weight:600;margin-bottom:7px">Varian, harga &amp; resep (1 porsi)</span>
			{#each draftVariants as variant, vi}
				<div class="variant-editor">
					<div class="variant-editor-head">
						<div class="form-input"><input type="text" value={variant.name} placeholder="Nama varian" disabled={saving} onchange={(e) => (variant.name = (e.currentTarget as HTMLInputElement).value)} /></div>
						<div class="form-input"><input type="number" min="0" step="1000" value={variant.price} placeholder="Harga (Rp)" disabled={saving} onchange={(e) => (variant.price = Number((e.currentTarget as HTMLInputElement).value))} /></div>
						<button class="rm-row" type="button" disabled={saving} onclick={() => draftRemoveVariant(variant.id!)} aria-label="Hapus varian {variant.name}" title="Hapus varian">×</button>
					</div>
					{#each variant.recipe as entry, ri}
						{@const riIng = store.ingredients.find((i) => i.id === entry.ingredientId)}
						<div class="recipe-row">
							<div class="form-input">
								<select
									value={entry.ingredientId}
									disabled={saving}
									onchange={(e) => (variant.recipe[ri].ingredientId = (e.currentTarget as HTMLSelectElement).value)}
								>
									{#each store.ingredients as ing}
										<option value={ing.id}>{ing.name} ({ing.unit})</option>
									{/each}
								</select>
							</div>
							<div class="form-input"><input type="number" min="0" step="1" value={entry.qty} disabled={saving} onchange={(e) => (variant.recipe[ri].qty = Number((e.currentTarget as HTMLInputElement).value))} /></div>
							<button class="rm-row" type="button" disabled={saving} onclick={() => draftRemoveIngredient(variant, ri)} aria-label="Hapus bahan">×</button>
						</div>
						{#if riIng}
							<div class="recipe-hint">
								Stok {riIng.stock.toLocaleString('id-ID')} {riIng.unit} · {entry.qty || 0} × {formatRupiahExact(riIng.costPerUnit)}/{riIng.unit} = {formatRupiahExact(riIng.costPerUnit * (entry.qty || 0))}
								{#if riIng.costPerUnit === 0}
									<span class="recipe-hint-warn">Harga modal 0, isi di Kelola bahan agar HPP akurat</span>
								{/if}
							</div>
						{/if}
					{/each}
					<div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px">
						<span style="color:#98a29a;font-size:10px">HPP: <b style="color:var(--forest-800)">{formatRupiahExact(draftHpp(variant))}</b></span>
						<button class="text-button" type="button" disabled={saving || store.ingredients.length === 0} onclick={() => draftAddIngredient(variant)}>+ Tambah bahan</button>
					</div>
				</div>
			{:else}
				<p style="color:#98a29a;font-size:11px">Belum ada varian. Tambahkan varian di bawah.</p>
			{/each}
		</div>

		<div class="form-row">
			<label for="newVariantName">Tambah varian ukuran</label>
			<div class="form-grid two">
				<div class="form-input"><input id="newVariantName" type="text" bind:value={newVariantName} placeholder="Besar" disabled={saving} /></div>
				<div class="form-input"><input type="number" min="0" step="1000" bind:value={newVariantPrice} placeholder="Harga" disabled={saving} /></div>
			</div>
			<button class="button button-secondary" type="button" style="width:100%;margin-top:8px" disabled={saving || !newVariantName.trim() || newVariantPrice <= 0} onclick={draftAddVariant}>
				+ Tambah varian
			</button>
		</div>
	</div>
	<div class="modal-actions" style="display:flex;gap:9px">
		<button class="button button-danger" type="button" disabled={saving} onclick={confirmDeleteProduct}>Hapus menu</button>
		<div style="flex:1"></div>
		<button class="button button-secondary" type="button" disabled={saving} onclick={() => (manageOpen = false)}>Batal</button>
		<button class="button button-primary" type="button" disabled={saving} onclick={saveManage}>
			{#if saving}<span class="btn-spinner"></span> Menyimpan...{:else}Simpan perubahan{/if}
		</button>
	</div>
</Modal>

<Modal bind:open={ingOpen} title={ingModalTitle}>
	{#if ingStep === 'choose'}
		<div class="ing-choose">
			<button class="ing-choice" type="button" disabled={saving} onclick={() => (ingStep = 'new')}>
				<span class="ing-choice-mark">+</span>
				<span class="ing-choice-copy">
					<strong>Tambah bahan baru</strong>
					<small>Buat bahan baru dengan stok awal, satuan, batas minimum, dan harga modal.</small>
				</span>
			</button>
			<button class="ing-choice" type="button" disabled={saving || store.ingredients.length === 0} onclick={pickIngredient}>
				<span class="ing-choice-mark">▤</span>
				<span class="ing-choice-copy">
					<strong>Pilih bahan yang sudah ada</strong>
					<small>Tambah stok atau ubah data bahan yang sudah terdaftar, tanpa membuat duplikat.</small>
				</span>
			</button>
			{#if store.ingredients.length === 0}
				<p class="ing-empty-hint">Belum ada bahan di daftar. Mulai dengan "Tambah bahan baru".</p>
			{/if}
		</div>
	{:else if ingStep === 'new'}
		<button class="ing-back" type="button" disabled={saving} onclick={backToIngChoose}>&larr; Kembali</button>
		<div class="form-grid">
			<div class="form-row">
				<label for="ingName">Nama bahan <small class="ing-name-hint">(bahan baru)</small></label>
				<div class="form-input">
					<input
						id="ingName"
						type="text"
						bind:value={ingName}
						placeholder="Ketik nama bahan baru"
						aria-describedby={ingNameTaken ? 'ing-name-taken' : undefined}
						disabled={saving}
					/>
				</div>
				{#if ingNameTaken}
					<p id="ing-name-taken" class="dup-hint" role="alert">
						Bahan <b>"{ingNameTaken.name}" ({ingNameTaken.unit})</b> sudah ada di daftar. Tidak akan dibuat duplikat.
						<button class="text-button" type="button" disabled={saving} onclick={() => openIngredient(ingNameTaken.id)}>Ubah bahan itu</button>
					</p>
				{/if}
			</div>
			<div class="form-grid two">
				<div class="form-row">
					<label for="ingUnit">Satuan</label>
					<div class="form-input">
						<select id="ingUnit" bind:value={ingUnit} disabled={saving}>
							<option value="gram">gram</option>
							<option value="ml">ml</option>
							<option value="pcs">pcs</option>
						</select>
					</div>
				</div>
				<div class="form-row">
					<label for="ingMin">Batas minimum</label>
					<div class="form-input"><input id="ingMin" type="number" min="0" bind:value={ingMin} disabled={saving} /></div>
				</div>
			</div>
			<div class="form-row">
				<label for="ingStock">Stok awal</label>
				<div class="form-input"><input id="ingStock" type="number" min="0" bind:value={ingStock} disabled={saving} /></div>
			</div>
			<div class="form-row">
				<label for="ingCost">Harga modal per {ingUnit} (Rp)</label>
				<div class="form-input"><input id="ingCost" type="number" min="0" step="any" bind:value={ingCost} placeholder="cth. 750 untuk 200 gram seharga 150.000" disabled={saving} /></div>
			</div>
			<div class="form-row auto-cost-row">
				<span class="auto-cost-label">Hitung otomatis dari jumlah &amp; total harga</span>
				<div class="form-grid two">
					<div class="form-row">
						<label for="ingQtyAuto">Jumlah ({ingUnit})</label>
						<div class="form-input"><input id="ingQtyAuto" type="number" min="0" step="any" bind:value={ingQtyAuto} oninput={syncIngCostAuto} placeholder="cth. 200" disabled={saving} /></div>
					</div>
					<div class="form-row">
						<label for="ingTotalAuto">Total harga (Rp)</label>
						<div class="form-input"><input id="ingTotalAuto" type="number" min="0" step="any" bind:value={ingTotalAuto} oninput={syncIngCostAuto} placeholder="cth. 150000" disabled={saving} /></div>
					</div>
				</div>
				{#if ingQtyAuto > 0 && ingTotalAuto > 0}
					<p class="cost-hint">
						= {formatRupiahExact(ingCostAuto)} per {ingUnit} &nbsp;({new Intl.NumberFormat('id-ID').format(Math.round(ingTotalAuto))} ÷ {ingQtyAuto.toLocaleString('id-ID')})
					</p>
				{:else}
					<p class="cost-hint">Rumus: harga modal = total harga ÷ jumlah. Contoh: 150.000 ÷ 200 gram = <b>Rp 750/gram</b>.</p>
				{/if}
			</div>
			<p class="cost-hint" style="margin-top:2px">Dipakai rumus HPP: HPP menu = Σ (bahan × jumlah resep × harga modal). Diisi manual, pembelian tidak mengubahnya otomatis.</p>
		</div>
		<div class="modal-actions">
			<button class="button button-secondary" type="button" disabled={saving} onclick={() => (ingOpen = false)}>Batal</button>
			<button class="button button-primary" type="button" disabled={saving || !!ingNameTaken} onclick={submitIngredient}>
				{#if saving}<span class="btn-spinner"></span> Menyimpan...{:else}Simpan{/if}
			</button>
		</div>
	{:else}
		{#if !ingEditId}
			<button class="ing-back" type="button" disabled={saving} onclick={backToIngChoose}>&larr; Kembali</button>
			<div class="form-grid">
				<div class="form-row">
					<label for="ingPick">Pilih bahan dari daftar</label>
					<div class="form-input">
						<select id="ingPick" disabled={saving} onchange={onIngPick}>
							<option value="">Pilih bahan untuk ditambah stok atau diubah</option>
							{#each store.ingredients as ing}
								<option value={ing.id}>{ing.name} ({ing.unit}) · stok {ing.stock.toLocaleString('id-ID')}</option>
							{/each}
						</select>
					</div>
				</div>
			</div>
			<p class="ing-pick-hint">Setelah dipilih, form terbuka dengan data bahan tersebut. Jumlah stok yang dimasukkan akan ditambahkan ke stok yang ada.</p>
		{:else}
			<button class="ing-back" type="button" disabled={saving} onclick={backToIngChoose}>&larr; Pilih bahan lain</button>
			<div class="form-grid">
				<div class="form-row">
					<label for="ingName">Nama bahan</label>
					<div class="form-input">
						<input
							id="ingName"
							type="text"
							bind:value={ingName}
							placeholder="Ubah nama bahan"
							aria-describedby={ingNameTaken ? 'ing-name-taken' : undefined}
							disabled={saving}
						/>
					</div>
					{#if ingNameTaken}
						<p id="ing-name-taken" class="dup-hint" role="alert">
							Nama ini sudah dipakai bahan <b>"{ingNameTaken.name}" ({ingNameTaken.unit})</b>. Pilih nama lain agar tidak ada dua bahan dengan nama sama.
						</p>
					{/if}
				</div>
				<div class="form-grid two">
					<div class="form-row">
						<label for="ingUnit">Satuan</label>
						<div class="form-input">
							<select id="ingUnit" bind:value={ingUnit} disabled={saving}>
								<option value="gram">gram</option>
								<option value="ml">ml</option>
								<option value="pcs">pcs</option>
							</select>
						</div>
					</div>
					<div class="form-row">
						<label for="ingMin">Batas minimum</label>
						<div class="form-input"><input id="ingMin" type="number" min="0" bind:value={ingMin} disabled={saving} /></div>
					</div>
				</div>
				<div class="form-grid two">
					<div class="form-row">
						<span class="ing-static-label">Stok saat ini</span>
						<div class="form-input ing-stock-now" aria-label="Stok saat ini">{ingEdited?.stock.toLocaleString('id-ID') ?? '0'} {ingUnit}</div>
					</div>
					<div class="form-row">
						<label for="ingStockAdd">Tambah stok</label>
						<div class="form-input"><input id="ingStockAdd" type="number" min="0" step="any" bind:value={ingStockAdd} placeholder="cth. 500" disabled={saving} /></div>
					</div>
				</div>
				<p class="cost-hint">Jumlah di "Tambah stok" ditambahkan ke stok saat ini. Isi 0 jika hanya mengubah data bahan.</p>
				<div class="form-row">
					<label for="ingCost">Harga modal per {ingUnit} (Rp)</label>
					<div class="form-input"><input id="ingCost" type="number" min="0" step="any" bind:value={ingCost} placeholder="cth. 750 untuk 200 gram seharga 150.000" disabled={saving} /></div>
				</div>
				<div class="form-row auto-cost-row">
					<span class="auto-cost-label">Hitung otomatis dari jumlah &amp; total harga</span>
					<div class="form-grid two">
						<div class="form-row">
							<label for="ingQtyAuto">Jumlah ({ingUnit})</label>
							<div class="form-input"><input id="ingQtyAuto" type="number" min="0" step="any" bind:value={ingQtyAuto} oninput={syncIngCostAuto} placeholder="cth. 200" disabled={saving} /></div>
						</div>
						<div class="form-row">
							<label for="ingTotalAuto">Total harga (Rp)</label>
							<div class="form-input"><input id="ingTotalAuto" type="number" min="0" step="any" bind:value={ingTotalAuto} oninput={syncIngCostAuto} placeholder="cth. 150000" disabled={saving} /></div>
						</div>
					</div>
					{#if ingQtyAuto > 0 && ingTotalAuto > 0}
						<p class="cost-hint">
							= {formatRupiahExact(ingCostAuto)} per {ingUnit} &nbsp;({new Intl.NumberFormat('id-ID').format(Math.round(ingTotalAuto))} ÷ {ingQtyAuto.toLocaleString('id-ID')})
						</p>
					{:else}
						<p class="cost-hint">Rumus: harga modal = total harga ÷ jumlah. Contoh: 150.000 ÷ 200 gram = <b>Rp 750/gram</b>.</p>
					{/if}
				</div>
			</div>
			<div class="modal-actions">
				<button class="button button-secondary" type="button" disabled={saving} onclick={() => (ingOpen = false)}>Batal</button>
				<button class="button button-primary" type="button" disabled={saving || !!ingNameTaken} onclick={submitIngredient}>
					{#if saving}<span class="btn-spinner"></span> Menyimpan...{:else}Simpan{/if}
				</button>
			</div>
		{/if}
	{/if}
</Modal>

<style>
	.variant-editor-head {
		display: flex;
		gap: 8px;
		align-items: center;
		margin-bottom: 8px;
	}

	.variant-editor-head .form-input {
		flex: 1;
		min-width: 0;
	}

	.btn-spinner {
		display: inline-block;
		width: 13px;
		height: 13px;
		border: 2px solid rgba(255, 255, 255, 0.4);
		border-top-color: #fff;
		border-radius: 50%;
		animation: menu-spin 700ms linear infinite;
	}

	@keyframes menu-spin {
		to {
			transform: rotate(360deg);
		}
	}

	.button:disabled {
		cursor: not-allowed;
		opacity: 0.55;
		transform: none;
		box-shadow: none;
	}

	.button-danger {
		color: #fff;
		background: var(--red);
		box-shadow: 0 8px 18px rgba(209, 94, 80, 0.2);
	}

	.button-danger:hover {
		background: #b84a3e;
	}

	.hpp-line {
		line-height: 1.7;
		white-space: nowrap;
	}

	.cost-hint {
		color: #5e6a64;
		font-size: 10px;
		line-height: 1.5;
		margin-top: 5px;
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
		margin-bottom: 8px;
	}

	.recipe-hint {
		color: #98a29a;
		font-size: 9px;
		line-height: 1.4;
		margin: 3px 0 8px;
	}

	.recipe-hint-warn {
		color: var(--red);
	}

	.dup-hint {
		color: var(--red);
		font-size: 10px;
		line-height: 1.6;
		margin-top: 5px;
	}

	.dup-hint .text-button {
		color: var(--red);
		font-size: 10px;
		padding: 0;
		margin-left: 4px;
		text-decoration: underline;
	}

	.dup-hint .text-button:hover {
		color: #b84a3e;
	}

	.ing-name-hint {
		color: var(--ink-soft);
		font-weight: 500;
	}

	.ing-pick-hint {
		color: var(--ink-soft);
		font-size: 10px;
		line-height: 1.5;
		margin-top: 4px;
	}

	.ing-choose {
		display: grid;
		gap: 10px;
	}

	.ing-choice {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 14px;
		border: 1px solid var(--line-strong);
		border-radius: 12px;
		background: var(--surface);
		color: var(--ink);
		text-align: left;
		cursor: pointer;
	}

	.ing-choice:hover:not(:disabled) {
		border-color: var(--orange);
	}

	.ing-choice:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.ing-choice-mark {
		display: grid;
		place-items: center;
		flex: 0 0 36px;
		width: 36px;
		height: 36px;
		border: 1px solid var(--line-strong);
		border-radius: 10px;
		background: var(--paper);
		color: var(--orange);
		font-size: 15px;
		font-weight: 700;
	}

	.ing-choice-copy {
		display: grid;
		gap: 2px;
		min-width: 0;
	}

	.ing-choice-copy strong {
		font-size: 13px;
	}

	.ing-choice-copy small {
		color: var(--ink-soft);
		font-size: 11px;
		line-height: 1.5;
	}

	.ing-empty-hint {
		color: var(--ink-soft);
		font-size: 11px;
		line-height: 1.5;
		margin-top: 2px;
	}

	.ing-back {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		background: none;
		border: 0;
		padding: 0;
		margin-bottom: 12px;
		color: var(--ink-soft);
		font-size: 11px;
		font-weight: 600;
		cursor: pointer;
	}

	.ing-back:hover:not(:disabled) {
		color: var(--orange);
	}

	.ing-stock-now {
		color: var(--ink-soft);
		font-size: 12px;
		font-weight: 700;
	}

	.ing-static-label {
		display: block;
		color: var(--ink-soft);
		font-size: 10px;
		font-weight: 600;
	}
</style>