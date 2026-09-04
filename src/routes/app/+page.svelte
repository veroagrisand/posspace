<script lang="ts">
	import { showToast } from '$lib/toast.svelte';
	import { store, backend, findVariant, stockStatus, lowStockIngredients, createTransaction, hydrateStore, formatClockLabel, hppOf } from '$lib/store.svelte';
	import ShiftModal from '$lib/components/ShiftModal.svelte';
	import PaymentModal from '$lib/components/PaymentModal.svelte';
	import ReceiptModal from '$lib/components/ReceiptModal.svelte';

	const formatIDR = (amount: number) => `Rp ${new Intl.NumberFormat('id-ID').format(Math.max(0, Math.round(amount)))}`;

	type CartItem = { productId: string; variantId: string; variantName: string; qty: number };

	let cart = $state<CartItem[]>([]);
	let paymentMethod = $state<'cash' | 'qris' | 'debit'>('cash');
	let cashReceived = $state(50000);
	let searchQuery = $state('');
	let activeCategory = $state('all');
	let syncSeconds = $state(2);
	let selectedVariants = $state<Record<string, string>>({});
	let paymentSubmitting = $state(false);

	let shiftOpen = $state(false);
	let paymentOpen = $state(false);
	let pendingTxn = $state<{ id: string; receiptNo: string; total: number } | null>(null);
	let orderType = $state<'takeaway' | 'dinein'>('takeaway');
	let chartPeriod = $state<'7' | '30'>('7');
	let receipt: {
		receiptNo: string;
		items: { productName: string; variant: string; qty: number; unitPrice: number; lineTotal: number }[];
		subtotal: number;
		tax: number;
		total: number;
		paymentMethod: string;
		channel?: string;
		gatewayRef?: string;
		cashReceived: number;
		changeAmount: number;
	} | null = $state(null);
	let receiptOpen = $state(false);

	const categories = [
		{ id: 'all', label: 'Semua' },
		{ id: 'Kopi', label: 'Kopi' },
		{ id: 'Non-kopi', label: 'Non-kopi' },
		{ id: 'Makanan', label: 'Makanan' }
	];

	const visibleProducts = $derived(
		store.products.filter((p) => {
			if (!p.isActive) return false;
			const matchesCategory = activeCategory === 'all' || p.category === activeCategory;
			const matchesQuery = p.name.toLowerCase().includes(searchQuery.trim().toLowerCase());
			return matchesCategory && matchesQuery;
		})
	);

	const subtotal = $derived(
		cart.reduce((sum, item) => {
			const v = findVariant(item.productId, item.variantName);
			return sum + (v?.price ?? 0) * item.qty;
		}, 0)
	);
	const tax = $derived(subtotal * 0.1);
	const total = $derived(subtotal + tax);
	const itemCount = $derived(cart.reduce((sum, item) => sum + item.qty, 0));
	const change = $derived(cashReceived - total);

	function dateKey(d: Date): string {
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}

	function omzetOn(date: Date): number {
		const key = dateKey(date);
		return store.transactions.filter((t) => dateKey(new Date(t.paidAt)) === key).reduce((s, t) => s + t.total, 0);
	}

	function trendPct(current: number, previous: number): number | null {
		if (previous <= 0) return null;
		return Math.round(((current - previous) / previous) * 1000) / 10;
	}

	const todayTransactions = $derived(store.transactions.filter((t) => dateKey(new Date(t.paidAt)) === dateKey(new Date())));
	const todayOmzet = $derived(todayTransactions.reduce((s, t) => s + t.total, 0));
	const todayHpp = $derived(
		todayTransactions.reduce((sum, t) => {
			for (const item of t.items) {
				const v = store.products.map((p) => p.variants.find((x) => x.name === item.variant && x.price === item.unitPrice)).find((x) => x);
				if (v) sum += hppOf(v) * item.qty;
			}
			return sum;
		}, 0)
	);
	const yesterdayOmzet = $derived(() => {
		const d = new Date();
		d.setDate(d.getDate() - 1);
		return omzetOn(d);
	});
	const todayTrend = $derived(trendPct(todayOmzet, yesterdayOmzet()));

	const chartBars = $derived.by(() => {
		const days: { label: string; date: string; omzet: number; current: boolean }[] = [];
		for (let i = 6; i >= 0; i--) {
			const d = new Date();
			d.setDate(d.getDate() - i);
			days.push({ date: dateKey(d), label: d.toLocaleDateString('id-ID', { weekday: 'short' }), omzet: 0, current: i === 0 });
		}
		const max = Math.max(1, ...days.map((day) => omzetOn(new Date(`${day.date}T00:00:00`))));
		return days.map((day) => ({
			...day,
			omzet: omzetOn(new Date(`${day.date}T00:00:00`)),
			height: `${Math.max(4, Math.round((omzetOn(new Date(`${day.date}T00:00:00`)) / max) * 100))}%`
		}));
	});
	const weekTotal = $derived(chartBars.reduce((s, b) => s + b.omzet, 0));
	const prevWeekTotal = $derived(() => {
		let sum = 0;
		for (let i = 13; i >= 7; i--) {
			const d = new Date();
			d.setDate(d.getDate() - i);
			sum += omzetOn(d);
		}
		return sum;
	});
	const weekTrend = $derived(trendPct(weekTotal, prevWeekTotal()));
	const hppPct = $derived(todayOmzet > 0 ? Math.round((todayHpp / todayOmzet) * 1000) / 10 : 0);

	const activities = $derived(store.movements.slice(0, 4));

	function addToCart(productId: string, variantId: string, variantName: string) {
		const existing = cart.find((item) => item.productId === productId && item.variantId === variantId);
		if (existing) {
			existing.qty += 1;
		} else {
			cart.push({ productId, variantId, variantName, qty: 1 });
		}
		const product = store.products.find((p) => p.id === productId);
		showToast(`${product!.name} (${variantName}) ditambahkan`);
	}

	function selectVariant(productId: string, variantId: string) {
		selectedVariants[productId] = variantId;
	}

	function transactionErrorMessage(err: unknown): string {
		const code = err instanceof Error ? err.message : '';
		const messages: Record<string, string> = {
			INSUFFICIENT_CASH: 'Uang diterima belum cukup.',
			INSUFFICIENT_STOCK: 'Stok bahan tidak mencukupi.',
			INVALID_VARIANT: 'Varian menu sudah tidak tersedia.',
			TRANSACTION_FAILED: 'Server gagal menyimpan transaksi.'
		};
		return `Transaksi gagal: ${messages[code] ?? 'Server tidak dapat menyimpan transaksi. Coba lagi.'}`;
	}

	function changeQuantity(productId: string, variantId: string, delta: number) {
		const item = cart.find((i) => i.productId === productId && i.variantId === variantId);
		if (!item) return;
		item.qty += delta;
		if (item.qty <= 0) {
			cart = cart.filter((i) => !(i.productId === productId && i.variantId === variantId));
		}
	}

	function clearCart() {
		if (!cart.length) {
			showToast('Keranjang sudah kosong');
			return;
		}
		cart = [];
		showToast('Keranjang sudah dikosongkan');
	}

	async function handlePay() {
		if (paymentSubmitting) return;
		if (!cart.length) {
			showToast('Pilih menu terlebih dahulu untuk membuat pesanan');
			return;
		}
		if (paymentMethod === 'cash') {
			if (!Number.isFinite(cashReceived)) {
				showToast('Masukkan jumlah uang diterima.');
				return;
			}
			if (cashReceived < total) {
				showToast(`Uang diterima masih kurang ${formatIDR(total - cashReceived)}`);
				return;
			}
		}

		paymentSubmitting = true;
		try {
			if (paymentMethod === 'cash') {
				await finishPayment('cash', undefined, undefined, undefined);
			} else {
				// Pembayaran digital: transaksi dibuat PENDING dulu (stok belum dipotong),
				// lalu QR Midtrans dibuat; stok dipotong saat pembayaran terkonfirmasi.
				const items = cart.map((item) => {
					const v = findVariant(item.productId, item.variantName)!;
					return {
						variantId: item.variantId,
						productName: store.products.find((p) => p.id === item.productId)?.name ?? 'Menu',
						variant: item.variantName,
						qty: item.qty,
						unitPrice: v.price,
						lineTotal: v.price * item.qty
					};
				});
				const txn = await createTransaction({
					items,
					paymentMethod,
					paymentStatus: 'pending'
				});
				pendingTxn = txn;
				paymentOpen = true;
			}
		} catch (err) {
			showToast(transactionErrorMessage(err));
		} finally {
			paymentSubmitting = false;
		}
	}

	async function finishPayment(method: 'cash' | 'qris' | 'debit', channel?: string, gatewayRef?: string, paymentTxn?: { id: string; receiptNo: string; total: number }) {
		const items = cart.map((item) => {
			const v = findVariant(item.productId, item.variantName)!;
			return {
				variantId: item.variantId,
				productName: store.products.find((p) => p.id === item.productId)?.name ?? 'Menu',
				variant: item.variantName,
				qty: item.qty,
				unitPrice: v.price,
				lineTotal: v.price * item.qty
			};
		});
		let txn: { id: string; receiptNo: string; total: number };
		let changeAmount = 0;
		if (method === 'cash') {
			changeAmount = cashReceived - total;
			txn = await createTransaction({
				items,
				paymentMethod: 'cash',
				cashReceived,
				changeAmount
			});
		} else {
			txn = paymentTxn ?? { id: '', receiptNo: '', total: 0 };
			if (backend.enabled) await hydrateStore().catch(() => undefined);
		}
		receipt = {
			receiptNo: txn.receiptNo,
			items,
			subtotal,
			tax,
			total,
			paymentMethod: method,
			channel,
			gatewayRef,
			cashReceived: method === 'cash' ? cashReceived : 0,
			changeAmount: method === 'cash' ? changeAmount : 0
		};
		cart = [];
		cashReceived = 50000;
		paymentMethod = 'cash';
		receiptOpen = true;
		pendingTxn = null;
		showToast('Transaksi selesai. Stok bahan dipotong otomatis sesuai resep.');
	}

	function handleDigitalPaid(result: { channel: string; gatewayRef: string }) {
		void finishPayment(paymentMethod, result.channel, result.gatewayRef, pendingTxn ?? undefined).catch((err) => {
			showToast(transactionErrorMessage(err));
		});
	}

	function openShiftDialog() {
		shiftOpen = true;
	}

	if (typeof window !== 'undefined') {
		window.setInterval(() => {
			syncSeconds += 1;
		}, 10000);
	}
</script>

<header class="topbar">
	<div class="breadcrumbs" aria-label="Breadcrumb">
		<span>Operasional</span>
		<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
		<strong>Kasir cepat</strong>
	</div>
	<div class="topbar-actions">
		<div class="sync-status">
			<span class="sync-pulse"></span>
			<span>Live sync</span>
			<small>{syncSeconds < 60 ? `${syncSeconds} detik lalu` : '1 menit lalu'}</small>
		</div>
		<button
			class="icon-button notification-button"
			type="button"
			onclick={() =>
				lowStockIngredients().length
					? showToast(`${lowStockIngredients().length} bahan stok menipis: ${lowStockIngredients().map((i) => i.name).join(', ')}`)
					: showToast('Tidak ada notifikasi baru')}
			aria-label="Lihat notifikasi"
		>
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" /></svg>
			{#if lowStockIngredients().length}
				<span class="notification-dot"></span>
			{/if}
		</button>
	</div>
</header>

<div class="page-content">
	<section class="page-heading">
		<div>
			<div class="eyebrow"><span class="eyebrow-line"></span> SHIFT {store.shift.status === 'open' ? 'AKTIF' : 'DITUTUP'}</div>
			<h1>Kasir cepat, stok tetap tepat.</h1>
			<p>Selamat bekerja. Layani pesanan berikutnya dengan lebih ringan.</p>
		</div>
		<div class="heading-actions">
			{#if store.shift.status === 'open'}
				<div class="shift-pill"><span></span><strong>Shift aktif</strong><small>Rp {store.shift.openingCash.toLocaleString('id-ID')} awal</small></div>
				<button class="button button-secondary" type="button" onclick={openShiftDialog}>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8V5.5A1.5 1.5 0 0 1 9.5 4h9A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 8 17.5V15M4 12h9M9.5 8.5 13 12l-3.5 3.5" /></svg>
					Tutup shift
				</button>
			{:else}
				<button class="button button-primary" type="button" onclick={openShiftDialog}>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14v12H5zM8 8V6a4 4 0 0 1 8 0v2M9 12h6" /></svg>
					Buka shift
				</button>
			{/if}
		</div>
	</section>

	<section class="metrics-grid" aria-label="Ringkasan hari ini">
		<article class="metric-card metric-revenue">
			<div class="metric-topline"><span class="metric-label">Omzet hari ini</span><span class="metric-icon">
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 20V10M12 20V4M18 20v-7" /></svg>
			</span></div>
			<strong class="metric-value">{formatIDR(todayOmzet)}</strong>
			<div class="metric-meta">{#if todayTrend !== null}<span class="trend-up">{todayTrend >= 0 ? '+' : ''}{todayTrend}%</span><span>vs. kemarin</span>{:else}<span>Belum ada penjualan hari ini</span>{/if}</div>
		</article>
		<article class="metric-card metric-orders">
			<div class="metric-topline"><span class="metric-label">Pesanan hari ini</span><span class="metric-icon">
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h4" /></svg>
			</span></div>
			<strong class="metric-value">{todayTransactions.length} <small>transaksi</small></strong>
			<div class="metric-meta"><span class="trend-up">+{todayTransactions.filter((t) => new Date(t.paidAt).getHours() >= 8).length}</span><span>sejak pukul 08.00</span></div>
		</article>
		<article class="metric-card metric-profit">
			<div class="metric-topline"><span class="metric-label">HPP hari ini</span><span class="metric-icon">
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17.5 9.5 12l3.5 3.5L20 8.5M15 8.5h5v5" /></svg>
			</span></div>
			<strong class="metric-value">{hppPct}% <small>dari omzet</small></strong>
			<div class="metric-meta"><span class="trend-{hppPct <= 35 ? 'good' : 'alert'}">{hppPct <= 35 ? 'Dalam target' : 'Perlu perhatian'}</span><span>target &lt; 35%</span></div>
		</article>
		<article class="metric-card metric-stock">
			<div class="metric-topline"><span class="metric-label">Stok perlu perhatian</span><span class="metric-icon">
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 21 20H3L12 4Z" /><path d="M12 10v4M12 17h.01" /></svg>
			</span></div>
			<strong class="metric-value">{lowStockIngredients().length} <small>bahan</small></strong>
			<div class="metric-meta"><span class="trend-alert">Segera cek</span><span>{lowStockIngredients().filter((i) => stockStatus(i) === 'critical').length} kritis, {lowStockIngredients().filter((i) => stockStatus(i) === 'warning').length} menipis</span></div>
		</article>
	</section>

	<section class="workspace-grid" aria-label="Kasir dan pesanan">
		<article class="panel menu-panel">
			<div class="panel-heading menu-heading">
				<div>
					<div class="section-kicker">KATALOG MENU</div>
					<h2>Pilih menu</h2>
				</div>
				<a class="text-button" href="/app/menu">
					Atur menu
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
				</a>
			</div>
			<div class="menu-toolbar">
				<label class="search-box">
					<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
					<input type="search" placeholder="Cari menu..." bind:value={searchQuery} />
				</label>
				<div class="category-tabs" role="tablist" aria-label="Kategori menu">
					{#each categories as category}
						<button
							class="category-tab"
							class:active={activeCategory === category.id}
							type="button"
							role="tab"
							aria-selected={activeCategory === category.id}
							onclick={() => (activeCategory = category.id)}
						>
							{category.label}
							<span>{category.id === 'all' ? store.products.filter((p) => p.isActive).length : store.products.filter((p) => p.isActive && p.category === category.id).length}</span>
						</button>
					{/each}
				</div>
			</div>

			<div class="product-grid">
				{#each visibleProducts as product}
					{@const selectedVariantId = selectedVariants[product.id] ?? product.variants[0]?.id}
					{@const selectedVariant = product.variants.find((v) => v.id === selectedVariantId) ?? product.variants[0]}
					<article class="product-card">
						<div class="product-art {product.art}">
							{#if product.badge}
								<span class="art-badge" class:art-badge-light={product.badge === 'BARU'}>{product.badge}</span>
							{/if}
							{#if product.category !== 'Makanan'}
								<span class="art-cup"></span><span class="art-steam"></span>
							{:else}
								<span class="art-croffle-shape"></span>
							{/if}
						</div>
						<div class="product-info">
							<div>
								<h3>{product.name}</h3>
								<div class="variant-badges" role="group" aria-label="Pilih varian {product.name}">
									{#each product.variants as variant}
										<button
											class="variant-badge"
											class:active={selectedVariant?.id === variant.id}
											type="button"
											aria-pressed={selectedVariant?.id === variant.id}
											onclick={() => selectVariant(product.id, variant.id)}
										>
											{variant.name}
										</button>
									{/each}
								</div>
							</div>
							<button
								class="add-product"
								type="button"
								disabled={!selectedVariant}
								onclick={() => selectedVariant && addToCart(product.id, selectedVariant.id, selectedVariant.name)}
								aria-label="Tambah {product.name} {selectedVariant?.name ?? ''}"
							>+</button>
						</div>
						<div class="product-price"><span>Harga · {selectedVariant?.name ?? '-'}</span><strong>{formatIDR(selectedVariant?.price ?? 0)}</strong></div>
					</article>
				{/each}
			</div>

			{#if visibleProducts.length === 0}
				<div class="empty-search">
					<span class="empty-search-icon">⌕</span>
					<strong>Menu tidak ditemukan</strong>
					<p>Coba kata kunci atau kategori lain.</p>
				</div>
			{/if}
		</article>

		<aside class="panel order-panel" aria-label="Ringkasan pesanan">
			<div class="order-heading">
				<div>
					<div class="section-kicker">PESANAN BARU</div>
					<h2>Keranjang <span class="order-count">{itemCount} item</span></h2>
				</div>
				<button class="icon-button clear-button" type="button" onclick={clearCart} aria-label="Kosongkan keranjang">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 11v6M14 11v6M7 7l.7 12.2a1 1 0 0 0 1 .8h6.6a1 1 0 0 0 1-.8L17 7M9 7l.6-2h4.8l.6 2" /></svg>
				</button>
			</div>
			<div class="order-context">
				<span class="context-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14v12H5zM8 8V6a4 4 0 0 1 8 0v2M9 12h6" /></svg></span>
				<span><small>Order type</small><strong>{orderType === 'takeaway' ? 'Take away' : 'Dine-in'}</strong></span>
				<button
					type="button"
					class="context-change"
					onclick={() => {
						orderType = orderType === 'takeaway' ? 'dinein' : 'takeaway';
						showToast(`Order type diganti menjadi ${orderType === 'takeaway' ? 'Take away' : 'Dine-in'}`);
					}}
				>
					Ubah
				</button>
			</div>

			<div class="cart-items">
				{#each cart as item (item.productId + item.variantId)}
					{@const v = findVariant(item.productId, item.variantName)}
					{@const product = store.products.find((p) => p.id === item.productId)}
					<div class="cart-item">
						<span class="mini-art {product!.art === 'art-croffle' ? 'art-croffle-mini' : ''}"></span>
						<div class="cart-item-info">
							<strong>{product!.name}</strong>
							<small>{item.variantName} · {formatIDR(v!.price)}</small>
						</div>
						<div class="cart-item-side">
							<strong>{formatIDR(v!.price * item.qty)}</strong>
							<div class="quantity-control" aria-label="Jumlah {product!.name}">
								<button type="button" onclick={() => changeQuantity(item.productId, item.variantId, -1)} aria-label="Kurangi {product!.name}">−</button>
								<span>{item.qty}</span>
								<button type="button" onclick={() => changeQuantity(item.productId, item.variantId, 1)} aria-label="Tambah {product!.name}">+</button>
							</div>
						</div>
					</div>
				{:else}
					<div class="cart-empty">
						<span class="cart-empty-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14v12H5zM8 8V6a4 4 0 0 1 8 0v2M9 12h6" /></svg></span>
						<strong>Keranjang masih kosong</strong>
						<p>Pilih menu untuk mulai membuat pesanan.</p>
					</div>
				{/each}
			</div>

			<div class="order-note">
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5A1.5 1.5 0 0 1 6.5 4h11A1.5 1.5 0 0 1 19 5.5v10.8a1.7 1.7 0 0 1-1.7 1.7H10l-4 3v-15.5Z" /><path d="M9 9h6M9 13h4" /></svg>
				<input type="text" placeholder="Tambahkan catatan pesanan..." aria-label="Catatan pesanan" />
			</div>
			<div class="order-summary">
				<div><span>Subtotal</span><strong>{formatIDR(subtotal)}</strong></div>
				<div><span>Pajak &amp; layanan <small>10%</small></span><strong>{formatIDR(tax)}</strong></div>
				<div class="total-row"><span>Total pembayaran</span><strong>{formatIDR(total)}</strong></div>
			</div>

			<div class="payment-section">
				<div class="payment-label"><span>Metode pembayaran</span><button type="button" onclick={() => showToast('Metode pembayaran digital dikelola oleh Midtrans (QRIS)')}>Midtrans terhubung</button></div>
				<div class="payment-methods" role="group" aria-label="Metode pembayaran">
					{#each ['cash', 'qris', 'debit'] as method}
						<button class="payment-method" class:active={paymentMethod === method} type="button" onclick={() => (paymentMethod = method as 'cash' | 'qris' | 'debit')}>
							<span class="payment-icon">
								{#if method === 'cash'}
									<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 9h.01M18 15h.01" /></svg>
								{:else if method === 'qris'}
									<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2M18 14h2M14 18h2M18 18h2" /></svg>
								{:else}
									<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h4" /></svg>
								{/if}
							</span>
							<span>{{ cash: 'Tunai', qris: 'QRIS', debit: 'Debit' }[method]}</span>
						</button>
					{/each}
				</div>

				{#if paymentMethod === 'cash'}
					<div class="cash-payment">
						<label for="cashReceived">Uang diterima</label>
						<div class="cash-input-wrap"><span>Rp</span><input id="cashReceived" type="number" min="0" step="1000" bind:value={cashReceived} /></div>
						<div class="quick-cash">
							<button type="button" onclick={() => (cashReceived = Math.ceil(total))}>Uang pas</button>
							<button type="button" onclick={() => (cashReceived = 50000)}>Rp 50.000</button>
							<button type="button" onclick={() => (cashReceived = 100000)}>Rp 100.000</button>
						</div>
						<div class="change-row" class:insufficient={total > 0 && change < 0}>
							<span>Kembalian</span>
							<strong>{total > 0 && change < 0 ? `Kurang ${formatIDR(Math.abs(change))}` : formatIDR(change)}</strong>
						</div>
					</div>
				{:else}
					<div class="digital-payment">
						<span class="digital-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2M18 14h2M14 18h2M18 18h2" /></svg></span>
						<span><strong>QRIS Midtrans siap dibuat</strong><small>QRIS dinamis ditampilkan saat Bayar ditekan — stok dipotong setelah pembayaran terkonfirmasi.</small></span>
					</div>
				{/if}

				<button class="button button-primary pay-button" type="button" disabled={paymentSubmitting} onclick={handlePay}>
					<span>{paymentSubmitting ? 'Memproses...' : 'Bayar sekarang'}</span>
					<strong>{formatIDR(total)}</strong>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
				</button>
				<p class="secure-note"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5c0 4.6-2.9 8-7 10-4.1-2-7-5.4-7-10V6l7-3Z" /><path d="m9 12 2 2 4-4" /></svg> Stok dipotong otomatis setelah pembayaran terkonfirmasi</p>
			</div>
		</aside>
	</section>

	<section class="insights-grid" aria-label="Ringkasan operasional">
		<article class="panel chart-panel">
			<div class="panel-heading compact-heading">
				<div><div class="section-kicker">PERFORMA PENJUALAN</div><h2>Omzet minggu ini</h2></div>
				<button class="period-select" type="button" onclick={() => {
						chartPeriod = chartPeriod === '7' ? '30' : '7';
						showToast(`Grafik menampilkan omzet ${chartPeriod} hari terakhir`);
					}}>{chartPeriod} hari <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg></button>
			</div>
			<div class="chart-summary"><strong>{formatIDR(weekTotal)}</strong>{#if weekTrend !== null}<span class="trend-up">{weekTrend >= 0 ? '+' : ''}{weekTrend}%</span>{/if}<small>7 hari terakhir</small></div>
			<div class="sales-chart" aria-label="Grafik omzet tujuh hari terakhir">
				<div class="chart-y-axis"><span>10 jt</span><span>7,5 jt</span><span>5 jt</span><span>2,5 jt</span><span>0</span></div>
				<div class="chart-plot">
					<div class="chart-gridline line-one"></div><div class="chart-gridline line-two"></div><div class="chart-gridline line-three"></div><div class="chart-gridline line-four"></div>
					<div class="chart-bars">
						{#each chartBars as bar}
							<div class="bar-column" class:current={bar.current}>
								<span class="bar-value">{bar.omzet >= 1_000_000 ? `${(bar.omzet / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt` : formatIDR(bar.omzet)}</span>
								<div class="bar" class:bar-highlight={bar.current} style="--bar-height: {bar.height}"></div>
								<small>{bar.label}</small>
							</div>
						{/each}
					</div>
				</div>
			</div>
		</article>

		<article class="panel stock-panel">
			<div class="panel-heading compact-heading"><div><div class="section-kicker">INVENTARIS LIVE</div><h2>Stok perlu perhatian</h2></div><span class="live-label"><i></i> Live</span></div>
			<div class="stock-list">
				{#each lowStockIngredients().slice(0, 3) as ing}
					{@const status = stockStatus(ing)}
					<div class="stock-item">
						<span class="stock-symbol {status === 'critical' ? 'stock-symbol-red' : 'stock-symbol-amber'}">{ing.name.slice(0, 2).toUpperCase()}</span>
						<div class="stock-detail">
							<div><strong>{ing.name}</strong><span class="stock-status {status === 'critical' ? 'critical' : 'warning'}">{status === 'critical' ? 'Kritis' : 'Menipis'}</span></div>
							<small>Min. stok {ing.minStock.toLocaleString('id-ID')} {ing.unit}</small>
							<div class="stock-progress"><span style="--stock-width: {Math.min(100, (ing.stock / ing.minStock) * 50)}%; --stock-color: {status === 'critical' ? '#d15e50' : '#d4973b'}"></span></div>
						</div>
						<strong class="stock-amount">{ing.stock.toLocaleString('id-ID')} {ing.unit}</strong>
					</div>
				{:else}
					<div class="cart-empty" style="padding-top:18px">
						<strong style="font-size:12px">Semua stok aman</strong>
						<p>Tidak ada bahan yang menipis saat ini.</p>
					</div>
				{/each}
			</div>
			<a class="full-link" href="/app/inventaris">Lihat semua stok <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg></a>
		</article>

		<article class="panel activity-panel">
			<div class="panel-heading compact-heading"><div><div class="section-kicker">AKTIVITAS TERBARU</div><h2>Pergerakan stok</h2></div><button class="more-dots" type="button" aria-label="Lihat riwayat lengkap" onclick={() => (window.location.href = '/app/inventaris')}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></svg></button></div>
			<div class="activity-list">
				{#each activities as movement}
					<div class="activity-item">
						<span class="activity-icon activity-{movement.change >= 0 ? 'stock' : 'sale'}">
							{#if movement.type === 'purchase'}
								<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 12l6-7 6 7" /></svg>
							{:else if movement.type === 'opname'}
								<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 21 20H3L12 4Z" /><path d="M12 10v4M12 17h.01" /></svg>
							{:else if movement.type === 'adjustment' || movement.type === 'waste'}
								<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>
							{:else}
								<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v14H5zM8 9h8M8 13h5" /></svg>
							{/if}
						</span>
						<div><strong>{movement.note}</strong><small>{movement.change > 0 ? '+' : ''}{movement.change.toLocaleString('id-ID')} {movement.ingredientName}</small></div>
						<time>{formatClockLabel(movement.at)}</time>
					</div>
				{/each}
			</div>
			<a class="full-link" href="/app/inventaris">Lihat riwayat <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg></a>
		</article>
	</section>
</div>

<ShiftModal bind:open={shiftOpen} />
<PaymentModal
	bind:open={paymentOpen}
	total={total}
	transactionId={pendingTxn?.id ?? ''}
	onPaid={handleDigitalPaid}
/>
<ReceiptModal
	bind:open={receiptOpen}
	receiptNo={receipt?.receiptNo ?? ''}
	items={receipt?.items ?? []}
	subtotal={receipt?.subtotal ?? 0}
	tax={receipt?.tax ?? 0}
	total={receipt?.total ?? 0}
	paymentMethod={receipt?.paymentMethod ?? 'cash'}
	channel={receipt?.channel}
	gatewayRef={receipt?.gatewayRef}
	cashReceived={receipt?.cashReceived ?? 0}
	changeAmount={receipt?.changeAmount ?? 0}
/>
