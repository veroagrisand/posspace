// ===== Store data demo terpusat (frontend-only, menunggu backend Supabase) =====

import { getBrowserClient } from './supabase';

export type Unit = 'gram' | 'ml' | 'pcs';

export type Ingredient = {
	id: string;
	name: string;
	unit: Unit;
	stock: number;
	minStock: number;
};

export type RecipeEntry = { ingredientId: string; qty: number };

export type Variant = {
	id: string;
	name: string;
	price: number;
	recipe: RecipeEntry[];
};

export type Product = {
	id: string;
	name: string;
	category: string;
	art: string;
	badge?: string;
	isActive: boolean;
	variants: Variant[];
};

export type Shift = {
	id: string;
	openingCash: number;
	openedAt: string;
	status: 'open' | 'closed';
	closedAt?: string;
	expectedCash?: number;
	actualCash?: number;
	note?: string;
};

export type TxItem = { productName: string; variant: string; qty: number; unitPrice: number; lineTotal: number };

export type PaymentMethod = 'cash' | 'qris' | 'debit';

export type Transaction = {
	id: string;
	receiptNo: string;
	items: TxItem[];
	total: number;
	paymentMethod: PaymentMethod;
	channel?: string;
	gatewayRef?: string;
	cashReceived?: number;
	changeAmount?: number;
	paidAt: string;
};

export type MovementType = 'sale' | 'purchase' | 'adjustment' | 'waste' | 'opname';

export type StockMovement = {
	id: string;
	ingredientId: string;
	ingredientName: string;
	change: number;
	type: MovementType;
	note: string;
	at: string;
};

export type PurchaseOrder = {
	id: string;
	ingredientId: string;
	ingredientName: string;
	supplier: string;
	quantity: number;
	unitPrice: number;
	receivedAt: string;
};

export type Opname = {
	id: string;
	ingredientId: string;
	ingredientName: string;
	systemQty: number;
	actualQty: number;
	difference: number;
	reason: string;
	status: 'draft' | 'approved';
	createdAt: string;
};

export const categories = ['Kopi', 'Non-kopi', 'Makanan'] as const;

function ingredient(id: string, name: string, unit: Unit, stock: number, minStock: number): Ingredient {
	return { id, name, unit, stock, minStock };
}

const initialIngredients: Ingredient[] = [
	ingredient('biji-kopi', 'Biji kopi house blend', 'gram', 360, 2000),
	ingredient('susu', 'Susu segar', 'ml', 3800, 5000),
	ingredient('sirup-aren', 'Sirup aren', 'ml', 720, 1000),
	ingredient('sirup-vanila', 'Sirup vanila', 'ml', 6400, 800),
	ingredient('sirup-karamel', 'Sirup karamel', 'ml', 2100, 800),
	ingredient('matcha', 'Bubuk matcha', 'gram', 850, 300),
	ingredient('cokelat', 'Bubuk cokelat', 'gram', 1200, 400),
	ingredient('adonan-croffle', 'Adonan croffle', 'pcs', 90, 30),
	ingredient('keju', 'Keju parut', 'gram', 1400, 300),
	ingredient('gula', 'Gula batu', 'pcs', 1500, 300),
	ingredient('cup', 'Set cup (gelas + tutup)', 'pcs', 1120, 400),
	ingredient('creamer', 'Creamer', 'ml', 4900, 600)
];

function variant(id: string, name: string, price: number, recipe: RecipeEntry[]): Variant {
	return { id, name, price, recipe };
}

const initialProducts: Product[] = [
	{
		id: 'kopi-susu',
		name: 'Es Kopi Susu',
		category: 'Kopi',
		art: 'art-coffee-milk',
		badge: 'TERLARIS',
		isActive: true,
		variants: [
			variant('kopi-susu-r', 'Reguler', 22000, [
				{ ingredientId: 'biji-kopi', qty: 15 },
				{ ingredientId: 'susu', qty: 150 },
				{ ingredientId: 'sirup-aren', qty: 20 },
				{ ingredientId: 'cup', qty: 1 }
			]),
			variant('kopi-susu-b', 'Besar', 26000, [
				{ ingredientId: 'biji-kopi', qty: 20 },
				{ ingredientId: 'susu', qty: 200 },
				{ ingredientId: 'sirup-aren', qty: 25 },
				{ ingredientId: 'cup', qty: 1 }
			])
		]
	},
	{
		id: 'americano',
		name: 'Americano',
		category: 'Kopi',
		art: 'art-americano',
		isActive: true,
		variants: [
			variant('americano-r', 'Reguler', 18000, [
				{ ingredientId: 'biji-kopi', qty: 18 },
				{ ingredientId: 'cup', qty: 1 }
			]),
			variant('americano-b', 'Besar', 22000, [
				{ ingredientId: 'biji-kopi', qty: 24 },
				{ ingredientId: 'cup', qty: 1 }
			])
		]
	},
	{
		id: 'caramel-latte',
		name: 'Caramel Latte',
		category: 'Kopi',
		art: 'art-caramel',
		isActive: true,
		variants: [
			variant('caramel-latte-r', 'Reguler', 24000, [
				{ ingredientId: 'biji-kopi', qty: 15 },
				{ ingredientId: 'susu', qty: 150 },
				{ ingredientId: 'sirup-karamel', qty: 20 },
				{ ingredientId: 'cup', qty: 1 }
			]),
			variant('caramel-latte-b', 'Besar', 28000, [
				{ ingredientId: 'biji-kopi', qty: 20 },
				{ ingredientId: 'susu', qty: 200 },
				{ ingredientId: 'sirup-karamel', qty: 25 },
				{ ingredientId: 'cup', qty: 1 }
			])
		]
	},
	{
		id: 'matcha-cloud',
		name: 'Matcha Cloud',
		category: 'Non-kopi',
		art: 'art-matcha',
		isActive: true,
		variants: [
			variant('matcha-cloud-r', 'Reguler', 25000, [
				{ ingredientId: 'matcha', qty: 12 },
				{ ingredientId: 'susu', qty: 180 },
				{ ingredientId: 'cup', qty: 1 }
			]),
			variant('matcha-cloud-b', 'Besar', 29000, [
				{ ingredientId: 'matcha', qty: 16 },
				{ ingredientId: 'susu', qty: 230 },
				{ ingredientId: 'cup', qty: 1 }
			])
		]
	},
	{
		id: 'chocolate',
		name: 'Dark Chocolate',
		category: 'Non-kopi',
		art: 'art-chocolate',
		isActive: true,
		variants: [
			variant('chocolate-r', 'Reguler', 23000, [
				{ ingredientId: 'cokelat', qty: 25 },
				{ ingredientId: 'susu', qty: 180 },
				{ ingredientId: 'cup', qty: 1 }
			]),
			variant('chocolate-b', 'Besar', 27000, [
				{ ingredientId: 'cokelat', qty: 32 },
				{ ingredientId: 'susu', qty: 230 },
				{ ingredientId: 'cup', qty: 1 }
			])
		]
	},
	{
		id: 'croffle',
		name: 'Croffle Butter',
		category: 'Makanan',
		art: 'art-croffle',
		badge: 'BARU',
		isActive: true,
		variants: [
			variant('croffle-o', 'Original', 18000, [
				{ ingredientId: 'adonan-croffle', qty: 1 },
				{ ingredientId: 'gula', qty: 2 }
			]),
			variant('croffle-k', 'Keju', 22000, [
				{ ingredientId: 'adonan-croffle', qty: 1 },
				{ ingredientId: 'keju', qty: 30 },
				{ ingredientId: 'gula', qty: 1 }
			])
		]
	}
];

let shiftSeq = 0;
let txSeq = 41;
let moveSeq = 0;
let purchaseSeq = 0;
let opnameSeq = 0;

function now(): string {
	return new Date().toISOString();
}

function formatClock(iso: string): string {
	return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

const initialMovements: StockMovement[] = [
	{ id: `mv-${moveSeq++}`, ingredientId: 'susu', ingredientName: 'Susu segar', change: 10000, type: 'purchase', note: 'Pembelian dari Fresh Milk Co', at: new Date(Date.now() - 1000 * 60 * 20).toISOString() },
	{ id: `mv-${moveSeq++}`, ingredientId: 'sirup-vanila', ingredientName: 'Sirup vanila', change: -200, type: 'adjustment', note: 'Sirup vanila, tumpah', at: new Date(Date.now() - 1000 * 60 * 60).toISOString() }
];

const initialTransactions: Transaction[] = [
	{
		id: 'txn-0804',
		receiptNo: 'PS-20260821-0804',
		items: [
			{ productName: 'Es Kopi Susu', variant: 'Reguler', qty: 1, unitPrice: 22000, lineTotal: 22000 },
			{ productName: 'Croffle Butter', variant: 'Original', qty: 1, unitPrice: 18000, lineTotal: 18000 }
		],
		total: 44000,
		paymentMethod: 'qris',
		channel: 'QRIS',
		gatewayRef: 'DKT-88A2F1',
		paidAt: new Date(Date.now() - 1000 * 60 * 120).toISOString()
	}
];

export const store = $state({
	ingredients: initialIngredients.map((i) => ({ ...i })),
	products: JSON.parse(JSON.stringify(initialProducts)) as Product[],
	movements: initialMovements.map((m) => ({ ...m })),
	transactions: initialTransactions.map((t) => ({ ...t, items: t.items.map((i) => ({ ...i })) })),
	purchases: [] as PurchaseOrder[],
	opnames: [] as Opname[],
	shift: {
		id: 'shift-1',
		openingCash: 500000,
		openedAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
		status: 'open'
	} as Shift,
	shop: {
		name: 'Kopi Senja',
		address: 'Jl. Merdeka No. 12, Bandung',
		currency: 'IDR',
		phone: '0812-3456-7890'
	},
	profiles: [
		{ id: 'u1', name: 'Rina Anjani', email: 'rina@posspace.id', role: 'kasir' },
		{ id: 'u2', name: 'Sari Putri', email: 'sari@posspace.id', role: 'admin_gudang' },
		{ id: 'u3', name: 'Budi Santoso', email: 'budi@posspace.id', role: 'pemilik' }
	] as { id: string; name: string; email: string; role: string }[],
	plan: 'Pro'
});

// ===== Bantuan =====
export const backend = $state<{
	enabled: boolean;
	shopId: string;
	role: string;
	shopName: string;
	subscription: { status: string; planId: string; planName: string; periodEnd: string | null } | null;
}>({
	enabled: false,
	shopId: '',
	role: '',
	shopName: '',
	subscription: null
});

async function apiFetch(path: string, init?: RequestInit) {
	const res = await fetch(path, {
		...init,
		headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }
	});
	if (!res.ok) {
		let message = 'Request gagal';
		try {
			const j = (await res.json()) as { message?: string };
			message = j.message ?? message;
		} catch {
			/* ignore */
		}
		throw new Error(message);
	}
	return res.json();
}

const artPool = ['art-coffee-milk', 'art-americano', 'art-caramel', 'art-matcha', 'art-chocolate', 'art-croffle'];

/**
 * Muat seluruh data toko dari backend (Supabase, RLS aktif).
 * Dipanggil oleh layout setelah guard server lolos.
 */
export async function hydrateStore() {
	if (!backend.enabled) return;

	const { data: products } = await getBrowserClient()!
		.from('products')
		.select('*, product_variants(*, recipes(*))')
		.eq('shop_id', backend.shopId);

	store.products = (products ?? []).map((p, i) => ({
		id: p.id,
		name: p.name,
		category: p.category,
		art: artPool[i % artPool.length],
		isActive: p.is_active,
		variants: (p.product_variants ?? []).map((v: any) => ({
			id: v.id,
			name: v.name,
			price: Number(v.price),
			recipe: (v.recipes ?? []).map((r: any) => ({ ingredientId: r.ingredient_id, qty: Number(r.quantity_required) }))
		}))
	}));

	const { data: ingredients } = await getBrowserClient()!.from('ingredients').select('*').eq('shop_id', backend.shopId);
	store.ingredients = (ingredients ?? []).map((i) => ({
		id: i.id,
		name: i.name,
		unit: i.unit,
		stock: Number(i.stock_quantity),
		minStock: Number(i.min_stock)
	}));

	const { data: movements } = await getBrowserClient()!
		.from('stock_movements')
		.select('*, ingredients(name)')
		.order('created_at', { ascending: false })
		.limit(50);
	store.movements = (movements ?? []).map((m) => ({
		id: m.id,
		ingredientId: m.ingredient_id,
		ingredientName: (m.ingredients as { name?: string } | null)?.name ?? '',
		change: Number(m.quantity_change),
		type: m.movement_type,
		note: m.note,
		at: m.created_at
	}));

	const { data: transactions } = await getBrowserClient()!
		.from('transactions')
		.select('*, transaction_items(*)')
		.order('created_at', { ascending: false })
		.limit(100);
	store.transactions = (transactions ?? []).map((t) => ({
		id: t.id,
		receiptNo: t.receipt_no,
		items: (t.transaction_items ?? []).map((it: any) => ({
			productName: it.product_name,
			variant: '',
			qty: it.quantity,
			unitPrice: Number(it.unit_price),
			lineTotal: Number(it.line_total)
		})),
		total: Number(t.total_amount),
		paymentMethod: t.payment_method,
		channel: t.payment_channel,
		gatewayRef: t.payment_gateway_ref,
		cashReceived: t.cash_received,
		changeAmount: t.change_amount,
		paidAt: t.paid_at
	}));

	const { data: shift } = await getBrowserClient()!
		.from('shifts')
		.select('*')
		.eq('shop_id', backend.shopId)
		.eq('status', 'open')
		.order('opened_at', { ascending: false })
		.limit(1)
		.single();
	store.shift = shift
		? { id: shift.id, openingCash: Number(shift.opening_cash), openedAt: shift.opened_at, status: 'open' }
		: { ...store.shift, status: 'closed' as const };

	const { data: shopData } = await getBrowserClient()!.from('shops').select('*').eq('id', backend.shopId).single();
	if (shopData) {
		store.shop = { name: shopData.name, address: shopData.address, phone: shopData.phone, currency: shopData.currency };
	}

	const { data: profiles } = await getBrowserClient()!.from('profiles').select('id, full_name, role').eq('shop_id', backend.shopId);
	store.profiles = (profiles ?? []).map((p) => ({ id: p.id, name: p.full_name, email: '', role: p.role }));

	const { data: opnames } = await getBrowserClient()!
		.from('stock_opnames')
		.select('*, ingredients(name)')
		.order('created_at', { ascending: false })
		.limit(50);
	store.opnames = (opnames ?? []).map((o) => ({
		id: o.id,
		ingredientId: o.ingredient_id,
		ingredientName: (o.ingredients as { name?: string } | null)?.name ?? '',
		systemQty: Number(o.system_quantity),
		actualQty: Number(o.actual_quantity),
		difference: Number(o.difference),
		reason: o.reason,
		status: o.status,
		createdAt: o.created_at
	}));

	const { data: purchases } = await getBrowserClient()!.from('purchase_orders').select('*').order('received_at', { ascending: false }).limit(50);
	store.purchases = (purchases ?? []).map((p) => ({
		id: p.id,
		ingredientId: p.ingredient_id,
		ingredientName: '',
		supplier: p.supplier,
		quantity: Number(p.quantity),
		unitPrice: Number(p.unit_price),
		receivedAt: p.received_at
	}));
}

export function getIngredient(id: string): Ingredient | undefined {
	return store.ingredients.find((i) => i.id === id);
}

export function ingredientUnitLabel(unit: Unit): string {
	return unit;
}

export function variantPrice(productId: string, variantName: string): number {
	const product = store.products.find((p) => p.id === productId);
	return product?.variants.find((v) => v.name === variantName)?.price ?? 0;
}

export function findVariant(productId: string, variantName: string): Variant | undefined {
	return store.products.find((p) => p.id === productId)?.variants.find((v) => v.name === variantName);
}

// ===== Akses ketersediaan =====
export function stockStatus(ing: Ingredient): 'critical' | 'warning' | 'ok' {
	if (ing.stock <= ing.minStock * 0.4) return 'critical';
	if (ing.stock <= ing.minStock) return 'warning';
	return 'ok';
}

export function lowStockIngredients(): Ingredient[] {
	return store.ingredients.filter((i) => i.stock <= i.minStock);
}

export function hppOf(variant: Variant): number {
	return variant.recipe.reduce((sum, entry) => {
		const ing = getIngredient(entry.ingredientId);
		return sum + (ing ? ingredientCost(ing, entry.qty) : 0);
	}, 0);
}

// Harga modal per unit — nilai demo sederhana per satuan
function ingredientCost(ing: Ingredient, qty: number): number {
	const pricePerUnit: Record<string, number> = {
		'biji-kopi': 400,
		susu: 12,
		'sirup-aren': 120,
		'sirup-vanila': 60,
		'sirup-karamel': 110,
		matcha: 300,
		cokelat: 150,
		'adonan-croffle': 4500,
		keju: 35,
		gula: 250,
		cup: 1800,
		creamer: 8
	};
	return (pricePerUnit[ing.id] ?? 0) * qty;
}

// ===== Transaksi & potong stok otomatis =====
export type TxInputItem = TxItem & { variantId?: string };

export async function createTransaction(input: {
	items: TxInputItem[];
	paymentMethod: PaymentMethod;
	channel?: string;
	gatewayRef?: string;
	cashReceived?: number;
	changeAmount?: number;
	paymentStatus?: 'pending' | 'completed';
}): Promise<Transaction> {
	if (backend.enabled) {
		const data = (await apiFetch('/api/transactions', {
			method: 'POST',
			body: JSON.stringify({
				shiftId: store.shift.status === 'open' ? store.shift.id : null,
				paymentMethod: input.paymentMethod,
				channel: input.channel,
				gatewayRef: input.gatewayRef,
				items: input.items.map((i) => ({ variantId: i.variantId, qty: i.qty })),
				paymentStatus: input.paymentStatus ?? 'completed'
			})
		})) as { transaction: any };
		await hydrateStore();
		return {
			id: data.transaction?.id ?? '',
			receiptNo: data.transaction?.receiptNo ?? '',
			items: input.items.map((i) => ({ ...i, variant: i.variant })),
			total: Number(data.transaction?.total ?? 0),
			paymentMethod: input.paymentMethod,
			channel: input.channel,
			gatewayRef: input.gatewayRef,
			cashReceived: input.cashReceived,
			changeAmount: input.changeAmount,
			paidAt: new Date().toISOString()
		};
	}

	txSeq += 1;
	const receiptNo = `PS-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(txSeq).padStart(4, '0')}`;
	const txn: Transaction = {
		id: `txn-${txSeq}`,
		receiptNo,
		items: input.items,
		total: input.items.reduce((sum, i) => sum + i.lineTotal, 0),
		paymentMethod: input.paymentMethod,
		channel: input.channel,
		gatewayRef: input.gatewayRef,
		cashReceived: input.cashReceived,
		changeAmount: input.changeAmount,
		paidAt: now()
	};
	store.transactions.push(txn);

	// Potong stok otomatis sesuai BOM + catat pergerakan "terjual"
	const consumption = new Map<string, number>();
	for (const item of input.items) {
		const variant = findVariantByItem(item);
		if (!variant) continue;
		for (const entry of variant.recipe) {
			consumption.set(entry.ingredientId, (consumption.get(entry.ingredientId) ?? 0) + entry.qty * item.qty);
		}
	}
	for (const [ingredientId, qty] of consumption) {
		const ing = getIngredient(ingredientId);
		if (!ing) continue;
		ing.stock = Math.max(0, ing.stock - qty);
		store.movements.unshift({
			id: `mv-${moveSeq++}`,
			ingredientId,
			ingredientName: ing.name,
			change: -qty,
			type: 'sale',
			note: `Penjualan ${receiptNo}`,
			at: now()
		});
	}
	return txn;
}

function findVariantByItem(item: TxItem): Variant | undefined {
	return store.products
		.map((p) => p.variants.find((v) => v.name === item.variant && v.price === item.unitPrice))
		.find((v) => v !== undefined);
}

// ===== Shift =====
export async function openShift(openingCash: number): Promise<void> {
	if (backend.enabled) {
		await apiFetch('/api/data/shifts', {
			method: 'POST',
			body: JSON.stringify({ openingCash })
		});
		await hydrateStore();
		return;
	}
	shiftSeq += 1;
	store.shift = {
		id: `shift-${shiftSeq}`,
		openingCash,
		openedAt: now(),
		status: 'open'
	};
}

export async function closeShift(actualCash: number): Promise<{ expectedCash: number; difference: number }> {
	if (backend.enabled) {
		const data = (await apiFetch(`/api/data/shifts/${store.shift.id}/close`, {
			method: 'POST',
			body: JSON.stringify({ actualCash })
		})) as { expectedCash: number; difference: number };
		store.shift = { ...store.shift, status: 'closed' };
		return { expectedCash: Number(data.expectedCash), difference: Number(data.difference) };
	}
	const shift = store.shift;
	const expectedCash = shift.openingCash + store.transactions.reduce((sum, t) => sum + t.total, 0);
	store.shift = {
		...shift,
		status: 'closed',
		closedAt: now(),
		expectedCash,
		actualCash,
		note: 'Ditutup dari aplikasi'
	};
	return { expectedCash, difference: actualCash - expectedCash };
}

// ===== Bahan baku =====
export async function addIngredient(data: { name: string; unit: Unit; stock: number; minStock: number }): Promise<void> {
	if (backend.enabled) {
		await apiFetch('/api/data/ingredients', {
			method: 'POST',
			body: JSON.stringify({ name: data.name, unit: data.unit, stock: data.stock, minStock: data.minStock })
		});
		await hydrateStore();
		return;
	}
	store.ingredients.push({
		id: `ing-${Date.now()}`,
		name: data.name,
		unit: data.unit,
		stock: data.stock,
		minStock: data.minStock
	});
}

export async function updateIngredient(id: string, data: { name: string; unit: Unit; minStock: number }): Promise<void> {
	if (backend.enabled) {
		await apiFetch(`/api/data/ingredients/${id}`, {
			method: 'PATCH',
			body: JSON.stringify({ name: data.name, unit: data.unit, minStock: data.minStock })
		});
		await hydrateStore();
		return;
	}
	const ing = getIngredient(id);
	if (!ing) return;
	ing.name = data.name;
	ing.unit = data.unit;
	ing.minStock = data.minStock;
}

// ===== Pembelian =====
export async function recordPurchase(data: { ingredientId: string; supplier: string; quantity: number; unitPrice: number }): Promise<void> {
	if (backend.enabled) {
		await apiFetch('/api/data/purchases', {
			method: 'POST',
			body: JSON.stringify(data)
		});
		await hydrateStore();
		return;
	}
	const ing = getIngredient(data.ingredientId)!;
	const purchase: PurchaseOrder = {
		id: `po-${purchaseSeq++}`,
		ingredientId: data.ingredientId,
		ingredientName: ing.name,
		supplier: data.supplier,
		quantity: data.quantity,
		unitPrice: data.unitPrice,
		receivedAt: now()
	};
	store.purchases.push(purchase);
	ing.stock += data.quantity;
	store.movements.unshift({
		id: `mv-${moveSeq++}`,
		ingredientId: data.ingredientId,
		ingredientName: ing.name,
		change: data.quantity,
		type: 'purchase',
		note: `Pembelian dari ${data.supplier}`,
		at: now()
	});
}

// ===== Stock opname & koreksi selisih =====
export async function createOpname(ingredientId: string, actualQty: number): Promise<string | undefined> {
	if (backend.enabled) {
		await apiFetch('/api/data/opnames', {
			method: 'POST',
			body: JSON.stringify({ ingredientId, actualQty })
		});
		await hydrateStore();
		return store.opnames[0]?.id;
	}
	const ing = getIngredient(ingredientId)!;
	const opname: Opname = {
		id: `op-${opnameSeq++}`,
		ingredientId,
		ingredientName: ing.name,
		systemQty: ing.stock,
		actualQty,
		difference: actualQty - ing.stock,
		reason: '',
		status: 'draft',
		createdAt: now()
	};
	store.opnames.unshift(opname);
	return opname.id;
}

export async function approveOpname(opnameId: string, reason: string): Promise<void> {
	if (backend.enabled) {
		await apiFetch(`/api/data/opnames/${opnameId}/approve`, {
			method: 'POST',
			body: JSON.stringify({ reason })
		});
		await hydrateStore();
		return;
	}
	const opname = store.opnames.find((o) => o.id === opnameId);
	if (!opname || opname.status === 'approved') return;
	const ing = getIngredient(opname.ingredientId);
	if (!ing) return;
	opname.status = 'approved';
	opname.reason = reason;
	const diff = opname.actualQty - opname.systemQty;
	ing.stock = opname.actualQty;
	store.movements.unshift({
		id: `mv-${moveSeq++}`,
		ingredientId: opname.ingredientId,
		ingredientName: opname.ingredientName,
		change: diff,
		type: 'opname',
		note: `Koreksi opname: ${reason}`,
		at: now()
	});
}

// ===== Produk, varian, resep =====
export async function addProduct(data: { name: string; category: string; price: number; variantName?: string }): Promise<void> {
	if (backend.enabled) {
		await apiFetch('/api/data/products', {
			method: 'POST',
			body: JSON.stringify(data)
		});
		await hydrateStore();
		return;
	}
	const variantName = data.variantName || 'Reguler';
	const product: Product = {
		id: `prod-${Date.now()}`,
		name: data.name,
		category: data.category,
		art: 'art-americano',
		isActive: true,
		variants: [variant(`v-${Date.now()}`, variantName, data.price, [])]
	};
	store.products.push(product);
}

export async function addVariant(productId: string, name: string, price: number): Promise<void> {
	if (backend.enabled) {
		await saveProductFull(productId);
		return;
	}
	const product = store.products.find((p) => p.id === productId);
	if (!product) return;
	product.variants.push(variant(`v-${Date.now()}`, name, price, []));
}

export async function setVariantPrice(productId: string, variantId: string, price: number): Promise<void> {
	if (backend.enabled) {
		await saveProductFull(productId);
		return;
	}
	const product = store.products.find((p) => p.id === productId);
	const v = product?.variants.find((x) => x.id === variantId);
	if (v) v.price = price;
}

export async function updateRecipe(productId: string, variantId: string, recipe: RecipeEntry[]): Promise<void> {
	if (backend.enabled) {
		await saveProductFull(productId);
		return;
	}
	const product = store.products.find((p) => p.id === productId);
	const v = product?.variants.find((x) => x.id === variantId);
	if (v) v.recipe = recipe.map((r) => ({ ...r }));
}

export async function toggleProductActive(productId: string): Promise<void> {
	if (backend.enabled) {
		await saveProductFull(productId);
		return;
	}
	const product = store.products.find((p) => p.id === productId);
	if (product) product.isActive = !product.isActive;
}

/** Hapus menu beserta varian & resepnya. */
export async function deleteProduct(productId: string): Promise<void> {
	if (backend.enabled) {
		await apiFetch(`/api/data/products/${productId}`, { method: 'DELETE' });
		await hydrateStore();
		return;
	}
	store.products = store.products.filter((p) => p.id !== productId);
}

/** Hapus satu varian menu (termasuk resepnya). */
export async function deleteVariant(productId: string, variantId: string): Promise<void> {
	const product = store.products.find((p) => p.id === productId);
	if (!product) return;
	if (backend.enabled) {
		product.variants = product.variants.filter((v) => v.id !== variantId);
		await saveProductFull(productId);
		return;
	}
	product.variants = product.variants.filter((v) => v.id !== variantId);
}

/** Simpan seluruh produk (nama/kategori/varian/resep) ke backend lalu muat ulang. */
export async function saveProductFull(productId: string) {
	const product = store.products.find((p) => p.id === productId);
	if (!product) return;
	await apiFetch(`/api/data/products/${productId}`, {
		method: 'PUT',
		body: JSON.stringify({
			name: product.name,
			category: product.category,
			isActive: product.isActive,
			variants: product.variants.map((v) => ({
				// id sementara (varian baru di form) → biarkan backend membuatnya
				id: v.id.startsWith('__new__') ? undefined : v.id,
				name: v.name,
				price: v.price,
				recipe: v.recipe.map((r) => ({ ingredientId: r.ingredientId, qty: r.qty }))
			}))
		})
	});
	await hydrateStore();
}

export function formatClockLabel(iso: string): string {
	return formatClock(iso);
}

// ===== Profil toko & hak akses =====
export async function saveShop(data: { name: string; address: string; phone: string; currency: string }): Promise<void> {
	if (backend.enabled) {
		await apiFetch('/api/shop', { method: 'PATCH', body: JSON.stringify(data) });
		await hydrateStore();
		return;
	}
	store.shop = { ...store.shop, ...data };
}

export async function setMemberRole(profileId: string, role: string): Promise<void> {
	if (backend.enabled) {
		await apiFetch(`/api/shop/members/${profileId}`, { method: 'PATCH', body: JSON.stringify({ role }) });
		await hydrateStore();
		return;
	}
	const profile = store.profiles.find((p) => p.id === profileId);
	if (profile) profile.role = role;
}
