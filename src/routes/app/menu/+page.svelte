<script lang="ts">
	import { showToast } from '$lib/toast.svelte';
	import { store, categories, backend, addProduct, addIngredient, updateIngredient, toggleProductActive, deleteProduct, saveProductFull, hppOf } from '$lib/store.svelte';
	import type { Variant } from '$lib/store.svelte';
	import Modal from '$lib/components/Modal.svelte';

	const formatIDR = (amount: number) => `Rp ${new Intl.NumberFormat('id-ID').format(Math.max(0, Math.round(amount)))}`;

	// ===== Status proses (mencegah input ganda saat tombol ditekan berkali-kali) =====
	let saving = $state(false);
	let busyMenu = $state('');

	// ===== Tambah menu =====
	let addOpen = $state(false);
	let addName = $state('');
	let addCategory = $state('Kopi');
	let addVariantName = $state('Reguler');
	let addPrice = $state(18000);

	// ===== Kelola menu (draft lokal, disimpan sekali) =====
	type DraftRecipe = { ingredientId: string; qty: number };
	type DraftVariant = { id: string | null; name: string; price: number; recipe: DraftRecipe[] };

	let manageProductId = $state('');
	let manageOpen = $state(false);
	let draftName = $state('');
	let draftCategory = $state('Kopi');
	let draftVariants = $state<DraftVariant[]>([]);
	let newVariantName = $state('');
	let newVariantPrice = $state(0);

	// ===== Bahan baku =====
	let ingOpen = $state(false);
	let ingEditId = $state<string | null>(null);
	let ingName = $state('');
	let ingUnit = $state<'gram' | 'ml' | 'pcs'>('gram');
	let ingStock = $state(0);
	let ingMin = $state(0);

	function withSaving(action: () => Promise<void>) {
		if (saving) return;
		saving = true;
		action()
			.catch((err) => {
				const message = err instanceof Error ? err.message : 'Terjadi kesalahan';
				showToast(`Gagal: ${message}`);
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
		saving = true;
		try {
			await addProduct({ name: addName.trim(), category: addCategory, price: addPrice, variantName: addVariantName.trim() || 'Reguler' });
			addOpen = false;
			addName = '';
			addVariantName = 'Reguler';
			addPrice = 18000;
			showToast('Menu baru ditambahkan');
		} catch (err) {
			showToast(`Gagal menambah menu: ${err instanceof Error ? err.message : 'error'}`);
		} finally {
			saving = false;
		}
	}

	// ===== Operasi draft pada modal kelola (tanpa API — disimpan sekali) =====
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
		saving = true;
		try {
			const p = store.products.find((x) => x.id === manageProductId);
			if (!p) return;
			p.name = draftName.trim();
			p.category = draftCategory;
			p.variants = draftVariants.map((v) => ({
				id: v.id ?? `__new__${Date.now()}`,
				name: v.name.trim() || 'Reguler',
				price: v.price,
				recipe: v.recipe.filter((r) => r.ingredientId && r.qty > 0).map((r) => ({ ...r }))
			}));
			if (backend.enabled) {
				await saveProductFull(p.id);
			}
			manageOpen = false;
			showToast('Perubahan menu disimpan');
		} catch (err) {
			showToast(`Gagal menyimpan: ${err instanceof Error ? err.message : 'error'}`);
		} finally {
			saving = false;
		}
	}

	async function confirmDeleteProduct() {
		if (saving) return;
		if (!window.confirm(`Hapus menu "${draftName}" beserta semua varian & resepnya? Tindakan ini tidak bisa dibatalkan.`)) return;
		saving = true;
		try {
			await deleteProduct(manageProductId);
			manageOpen = false;
			showToast('Menu dihapus');
		} catch (err) {
			showToast(`Gagal menghapus: ${err instanceof Error ? err.message : 'error'}`);
		} finally {
			saving = false;
		}
	}

	async function submitIngredient() {
		if (saving || !ingName.trim()) return;
		saving = true;
		try {
			if (ingEditId) {
				await updateIngredient(ingEditId, { name: ingName.trim(), unit: ingUnit, minStock: ingMin });
				showToast('Bahan baku diperbarui');
			} else {
				await addIngredient({ name: ingName.trim(), unit: ingUnit, stock: ingStock, minStock: ingMin });
				showToast('Bahan baku ditambahkan');
			}
			ingOpen = false;
		} catch (err) {
			showToast(`Gagal: ${err instanceof Error ? err.message : 'error'}`);
		} finally {
			saving = false;
		}
	}

	function openIngredient(id: string | null) {
		ingEditId = id;
		const ing = id ? store.ingredients.find((i) => i.id === id) : null;
		ingName = ing?.name ?? '';
		ingUnit = ing?.unit ?? 'gram';
		ingStock = ing?.stock ?? 0;
		ingMin = ing?.minStock ?? 0;
		ingOpen = true;
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
			<div class="eyebrow"><span class="eyebrow-line"></span> FASE 2 — ATUR MENU &amp; RESEP</div>
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
			<span style="color:#9aa39c;font-size:11px">{store.products.length} menu</span>
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
							<td style="font-family:var(--font-display)">{formatIDR(product.variants[0]?.price ?? 0)}</td>
							<td style="font-family:var(--font-display)">{formatIDR(product.variants[0] ? hppOf(product.variants[0]) : 0)}</td>
							<td style="color:var(--green);font-weight:700">{product.variants[0]?.price ? Math.round(((product.variants[0].price - hppOf(product.variants[0])) / product.variants[0].price) * 100) : 0}%</td>
							<td>
								<label class="switch">
									<input
										type="checkbox"
										checked={product.isActive}
										disabled={saving || busyMenu === product.id}
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

<Modal bind:open={manageOpen} title={`Kelola menu — ${draftName}`} wide>
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
					{/each}
					<div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px">
						<span style="color:#98a29a;font-size:10px">HPP: <b style="color:var(--forest-800)">{formatIDR(draftHpp(variant))}</b></span>
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

<Modal bind:open={ingOpen} title={ingEditId ? 'Ubah bahan baku' : 'Tambah bahan baku'}>
	<div class="form-grid">
		<div class="form-row">
			<label for="ingName">Nama bahan</label>
			<div class="form-input"><input id="ingName" type="text" bind:value={ingName} placeholder="cth. Biji kopi robusta" disabled={saving} /></div>
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
		{#if !ingEditId}
			<div class="form-row">
				<label for="ingStock">Stok awal</label>
				<div class="form-input"><input id="ingStock" type="number" min="0" bind:value={ingStock} disabled={saving} /></div>
			</div>
		{/if}
	</div>
	<div class="modal-actions">
		<button class="button button-secondary" type="button" disabled={saving} onclick={() => (ingOpen = false)}>Batal</button>
		<button class="button button-primary" type="button" disabled={saving} onclick={submitIngredient}>
			{#if saving}<span class="btn-spinner"></span> Menyimpan...{:else}Simpan{/if}
		</button>
	</div>
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
</style>