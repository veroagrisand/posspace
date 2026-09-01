import { Hono } from 'hono';
import { json, httpError } from '../http.js';
import { requireApiAuth } from '../guards.js';

/**
 * Service POS — data operasional toko:
 * produk & resep, bahan baku, shift, transaksi, pembelian, opname, laporan.
 * Semua route wajib login + toko + subscription aktif (requireApiAuth).
 */

/** Error RLS dari PostgREST (denied / violates policy) → 403, bukan 500. */
function rlsDenied(err: { message?: string } | null): boolean {
	return !!err && /permission denied|row-level security/i.test(err.message ?? '');
}

export const posDataService = new Hono();
export const transactionsService = new Hono();
export const reportsService = new Hono();

// ============ PRODUCTS ============
/** GET /api/data/products — menu toko lengkap dengan varian & resep. */
posDataService.get('/products', async (c) => {
	const ctx = await requireApiAuth(c);

	const { data, error: selectError } = await ctx.db
		.from('products')
		.select('*, product_variants(*, recipes(*))')
		.eq('shop_id', ctx.shop.shopId)
		.order('created_at', { ascending: false });

	if (selectError) httpError(500, 'FETCH_FAILED');
	return json({ products: data ?? [] });
});

/** POST /api/data/products — tambah menu baru (dengan varian awal & resep kosong). */
posDataService.post('/products', async (c) => {
	const ctx = await requireApiAuth(c);

	const body = (await c.req.json().catch(() => ({}))) as {
		name?: string;
		category?: string;
		price?: number;
		variantName?: string;
	};

	if (!body.name?.trim()) httpError(400, 'NAME_REQUIRED');
	const price = Number(body.price ?? 0);
	if (!Number.isFinite(price) || price < 0) httpError(400, 'INVALID_PRICE');
	if (body.variantName && body.variantName.trim().length > 60) httpError(400, 'INVALID_VARIANT_NAME');

	const { data: product, error: productError } = await ctx.db
		.from('products')
		.insert({ shop_id: ctx.shop.shopId, name: body.name, category: body.category ?? 'Kopi' })
		.select('id')
		.single();
	if (rlsDenied(productError)) httpError(403, 'FORBIDDEN');
	if (productError || !product) httpError(500, 'INSERT_FAILED');

	const { data: variant, error: variantError } = await ctx.db
		.from('product_variants')
		.insert({ product_id: product.id, name: body.variantName ?? 'Reguler', price: body.price ?? 0 })
		.select('id')
		.single();
	if (rlsDenied(variantError)) httpError(403, 'FORBIDDEN');
	if (variantError) httpError(500, 'INSERT_FAILED');

	return json({ ok: true, productId: product.id, variantId: variant?.id });
});

/**
 * PUT /api/data/products/[id]
 * Update menu secara utuh: nama, kategori, status, varian (harga), dan resep/BOM.
 */
posDataService.put('/products/:id', async (c) => {
	const ctx = await requireApiAuth(c);
	const productId = c.req.param('id');

	const body = (await c.req.json().catch(() => ({}))) as {
		name?: string;
		category?: string;
		isActive?: boolean;
		variants?: {
			id?: string | null;
			name: string;
			price: number;
			isActive?: boolean;
			recipe?: { ingredientId: string; qty: number }[];
		}[];
	};

	if (body.name !== undefined && !body.name.trim()) httpError(400, 'NAME_REQUIRED');
	for (const v of body.variants ?? []) {
		if (!v.name?.trim()) httpError(400, 'INVALID_VARIANT_NAME');
		if (!Number.isFinite(Number(v.price)) || Number(v.price) < 0) httpError(400, 'INVALID_PRICE');
		for (const r of v.recipe ?? []) {
			if (!r.ingredientId || !Number.isFinite(Number(r.qty)) || Number(r.qty) <= 0) httpError(400, 'INVALID_RECIPE');
		}
	}

	const { data: existing, error: existError } = await ctx.db
		.from('products')
		.select('id, product_variants(id)')
		.eq('id', productId)
		.eq('shop_id', ctx.shop.shopId)
		.single();
	if (rlsDenied(existError)) httpError(403, 'FORBIDDEN');
	if (existError || !existing) httpError(404, 'NOT_FOUND');

	const { error: updateError } = await ctx.db
		.from('products')
		.update({
			name: body.name ?? undefined,
			category: body.category ?? undefined,
			is_active: body.isActive ?? undefined
		})
		.eq('id', productId);
	if (rlsDenied(updateError)) httpError(403, 'FORBIDDEN');
	if (updateError) httpError(500, 'UPDATE_FAILED');

	if (body.variants) {
		const oldIds = (existing.product_variants as { id: string }[]).map((v) => v.id);
		if (oldIds.length) {
			const { error: delRecipeError } = await ctx.db.from('recipes').delete().in('variant_id', oldIds);
			if (rlsDenied(delRecipeError)) httpError(403, 'FORBIDDEN');
			if (delRecipeError) httpError(500, 'UPDATE_FAILED');
		}

		const keptIds: string[] = [];
		for (const variant of body.variants) {
			let variantId: string | null = null;
			if (variant.id) {
				const { data: v, error: vError } = await ctx.db
					.from('product_variants')
					.update({ name: variant.name, price: variant.price, is_active: variant.isActive ?? true })
					.eq('id', variant.id)
					.eq('product_id', productId)
					.select('id')
					.single();
				if (rlsDenied(vError)) httpError(403, 'FORBIDDEN');
				if (vError || !v) httpError(500, 'UPDATE_FAILED');
				variantId = v.id;
			} else {
				const { data: v, error: vError } = await ctx.db
					.from('product_variants')
					.insert({ product_id: productId, name: variant.name, price: variant.price })
					.select('id')
					.single();
				if (rlsDenied(vError)) httpError(403, 'FORBIDDEN');
				if (vError || !v) httpError(500, 'UPDATE_FAILED');
				variantId = v.id;
			}
			keptIds.push(variantId as string);

			for (const entry of variant.recipe ?? []) {
				const { error: rError } = await ctx.db
					.from('recipes')
					.insert({ variant_id: variantId!, ingredient_id: entry.ingredientId, quantity_required: entry.qty });
				if (rlsDenied(rError)) httpError(403, 'FORBIDDEN');
				if (rError) httpError(500, 'UPDATE_FAILED');
			}
		}

		const removedIds = oldIds.filter((id) => !keptIds.includes(id));
		if (removedIds.length) {
			const { error: delVariantError } = await ctx.db
				.from('product_variants')
				.delete()
				.in('id', removedIds)
				.eq('product_id', productId);
			if (rlsDenied(delVariantError)) httpError(403, 'FORBIDDEN');
			if (delVariantError) httpError(500, 'UPDATE_FAILED');
		}
	}

	return json({ ok: true });
});

/** DELETE /api/data/products/[id] — hapus menu beserta varian & resep (cascade). */
posDataService.delete('/products/:id', async (c) => {
	const ctx = await requireApiAuth(c);
	const productId = c.req.param('id');

	const { data: existing, error: existError } = await ctx.db
		.from('products')
		.select('id')
		.eq('id', productId)
		.eq('shop_id', ctx.shop.shopId)
		.single();
	if (rlsDenied(existError)) httpError(403, 'FORBIDDEN');
	if (existError || !existing) httpError(404, 'NOT_FOUND');

	const { error: deleteError } = await ctx.db.from('products').delete().eq('id', productId);
	if (rlsDenied(deleteError)) httpError(403, 'FORBIDDEN');
	if (deleteError) httpError(500, 'DELETE_FAILED');

	return json({ ok: true });
});

// ============ INGREDIENTS ============
/** GET /api/data/ingredients — stok bahan baku toko (real-time). */
posDataService.get('/ingredients', async (c) => {
	const ctx = await requireApiAuth(c);

	const { data, error: selectError } = await ctx.db
		.from('ingredients')
		.select('*')
		.eq('shop_id', ctx.shop.shopId)
		.order('name', { ascending: true });

	if (selectError) httpError(500, 'FETCH_FAILED');
	return json({ ingredients: data ?? [] });
});

/** POST /api/data/ingredients — tambah bahan baku baru. */
posDataService.post('/ingredients', async (c) => {
	const ctx = await requireApiAuth(c);

	const body = (await c.req.json().catch(() => ({}))) as {
		name?: string;
		unit?: string;
		stock?: number;
		minStock?: number;
	};
	if (!body.name) httpError(400, 'NAME_REQUIRED');
	if (!['gram', 'ml', 'pcs'].includes(body.unit ?? '')) httpError(400, 'INVALID_UNIT');
	const stock = Number(body.stock ?? 0);
	const minStock = Number(body.minStock ?? 0);
	if (!Number.isFinite(stock) || stock < 0) httpError(400, 'INVALID_STOCK');
	if (!Number.isFinite(minStock) || minStock < 0) httpError(400, 'INVALID_MIN_STOCK');

	const { data, error: insertError } = await ctx.db
		.from('ingredients')
		.insert({
			shop_id: ctx.shop.shopId,
			name: body.name,
			unit: body.unit ?? 'gram',
			stock_quantity: stock,
			min_stock: minStock
		})
		.select('*')
		.single();

	if (rlsDenied(insertError)) httpError(403, 'FORBIDDEN');
	if (insertError || !data) httpError(500, 'INSERT_FAILED');
	return json({ ingredient: data });
});

/** PATCH /api/data/ingredients/[id] — ubah nama, satuan, batas minimum. */
posDataService.patch('/ingredients/:id', async (c) => {
	const ctx = await requireApiAuth(c);
	const ingredientId = c.req.param('id');

	const body = (await c.req.json().catch(() => ({}))) as {
		name?: string;
		unit?: string;
		minStock?: number;
	};

	if (body.name !== undefined && !body.name.trim()) httpError(400, 'NAME_REQUIRED');
	if (body.unit !== undefined && !['gram', 'ml', 'pcs'].includes(body.unit)) httpError(400, 'INVALID_UNIT');
	if (body.minStock !== undefined && (!Number.isFinite(Number(body.minStock)) || Number(body.minStock) < 0))
		httpError(400, 'INVALID_MIN_STOCK');

	const { data, error: updateError } = await ctx.db
		.from('ingredients')
		.update({
			name: body.name ?? undefined,
			unit: body.unit ?? undefined,
			min_stock: body.minStock ?? undefined
		})
		.eq('id', ingredientId)
		.eq('shop_id', ctx.shop.shopId)
		.select('*')
		.single();

	if (rlsDenied(updateError)) httpError(403, 'FORBIDDEN');
	if (updateError || !data) httpError(404, 'NOT_FOUND');
	return json({ ingredient: data });
});

// ============ SHIFTS ============
/** POST /api/data/shifts — buka shift dengan saldo awal. */
posDataService.post('/shifts', async (c) => {
	const ctx = await requireApiAuth(c);

	const body = (await c.req.json().catch(() => ({}))) as { openingCash?: number };
	const openingCash = Number(body.openingCash ?? 0);
	if (!Number.isFinite(openingCash) || openingCash < 0) httpError(400, 'INVALID_CASH');

	const { data: existing } = await ctx.db
		.from('shifts')
		.select('id')
		.eq('profile_id', ctx.user.id)
		.eq('status', 'open')
		.maybeSingle();
	if (existing) httpError(409, 'SHIFT_ALREADY_OPEN');

	const { data: profile } = await ctx.db.from('profiles').select('id').eq('id', ctx.user.id).single();

	const { data, error: insertError } = await ctx.db
		.from('shifts')
		.insert({
			profile_id: profile?.id,
			shop_id: ctx.shop.shopId,
			opening_cash: openingCash,
			status: 'open'
		})
		.select('*')
		.single();

	if (insertError || !data) httpError(500, 'INSERT_FAILED');
	return json({ shift: data });
});

/** POST /api/data/shifts/[id]/close — tutup shift dengan rekap kas (atomik via RPC). */
posDataService.post('/shifts/:id/close', async (c) => {
	await requireApiAuth(c);
	const shiftId = c.req.param('id');

	const body = (await c.req.json().catch(() => ({}))) as { actualCash?: number };
	if (body.actualCash == null) httpError(400, 'ACTUAL_CASH_REQUIRED');

	const { data, error: rpcError } = await c.get('db')!.rpc('close_shift', {
		p_shift_id: shiftId,
		p_actual_cash: body.actualCash
	});

	if (rpcError) {
		if (String(rpcError.message).includes('NOT_FOUND')) httpError(404, 'NOT_FOUND');
		httpError(500, 'CLOSE_FAILED');
	}

	return json({ ok: true, ...data });
});

// ============ PURCHASES ============
/** POST /api/data/purchases — catat pembelian, stok bertambah atomik via RPC. */
posDataService.post('/purchases', async (c) => {
	const ctx = await requireApiAuth(c);

	const body = (await c.req.json().catch(() => ({}))) as {
		ingredientId?: string;
		supplier?: string;
		quantity?: number;
		unitPrice?: number;
	};
	if (!body.ingredientId || !body.quantity || body.quantity <= 0) httpError(400, 'INVALID_INPUT');

	const { data, error: rpcError } = await ctx.db.rpc('record_purchase', {
		p_ingredient_id: body.ingredientId,
		p_supplier: body.supplier ?? 'Pemasok',
		p_quantity: body.quantity,
		p_unit_price: body.unitPrice ?? 0
	});

	if (rpcError) {
		if (String(rpcError.message).includes('FORBIDDEN')) httpError(403, 'FORBIDDEN');
		if (String(rpcError.message).includes('NOT_FOUND')) httpError(404, 'NOT_FOUND');
		httpError(500, 'PURCHASE_FAILED');
	}

	return json({ ok: true, id: data?.id });
});

// ============ OPNAMES ============
/** GET /api/data/opnames — daftar opname toko. */
posDataService.get('/opnames', async (c) => {
	await requireApiAuth(c);

	const { data, error: selectError } = await c.get('db')!
		.from('stock_opnames')
		.select('*, ingredients(shop_id)')
		.order('created_at', { ascending: false });

	if (selectError) httpError(500, 'FETCH_FAILED');
	return json({ opnames: data ?? [] });
});

/** POST /api/data/opnames — catat hasil hitung fisik (draft). */
posDataService.post('/opnames', async (c) => {
	const ctx = await requireApiAuth(c);

	const body = (await c.req.json().catch(() => ({}))) as { ingredientId?: string; actualQty?: number };
	if (!body.ingredientId || body.actualQty == null) httpError(400, 'INVALID_INPUT');

	const { data: ingredient } = await ctx.db
		.from('ingredients')
		.select('stock_quantity')
		.eq('id', body.ingredientId)
		.eq('shop_id', ctx.shop.shopId)
		.single();
	if (!ingredient) httpError(404, 'NOT_FOUND');

	const { data, error: insertError } = await ctx.db
		.from('stock_opnames')
		.insert({
			ingredient_id: body.ingredientId,
			system_quantity: ingredient.stock_quantity,
			actual_quantity: body.actualQty,
			difference: body.actualQty - ingredient.stock_quantity,
			status: 'draft'
		})
		.select('*')
		.single();

	if (rlsDenied(insertError)) httpError(403, 'FORBIDDEN');
	if (insertError || !data) httpError(500, 'INSERT_FAILED');
	return json({ opname: data });
});

/** POST /api/data/opnames/[id]/approve — setujui selisih dengan alasan (atomik via RPC). */
posDataService.post('/opnames/:id/approve', async (c) => {
	await requireApiAuth(c);
	const opnameId = c.req.param('id');

	const body = (await c.req.json().catch(() => ({}))) as { reason?: string };
	if (!body.reason?.trim()) httpError(400, 'REASON_REQUIRED');

	const { data, error: rpcError } = await c.get('db')!.rpc('approve_opname', {
		p_opname_id: opnameId,
		p_reason: body.reason.trim()
	});

	if (rpcError) {
		if (String(rpcError.message).includes('FORBIDDEN')) httpError(403, 'FORBIDDEN');
		if (String(rpcError.message).includes('NOT_FOUND')) httpError(404, 'NOT_FOUND');
		httpError(500, 'APPROVE_FAILED');
	}

	return json({ ok: true, ...data });
});

// ============ TRANSACTIONS ============
/** POST /api/transactions — buat transaksi, potong stok otomatis sesuai BOM (atomik di DB). */
transactionsService.post('/', async (c) => {
	const ctx = await requireApiAuth(c);

	const body = (await c.req.json().catch(() => ({}))) as {
		shiftId?: string;
		paymentMethod?: 'cash' | 'qris' | 'debit';
		channel?: string;
		gatewayRef?: string;
		items?: { variantId: string; qty: number }[];
		paymentStatus?: 'pending' | 'completed';
	};

	if (!body.items?.length) httpError(400, 'EMPTY_ITEMS');

	const { data, error: rpcError } = await ctx.db.rpc('process_transaction', {
		p_shift_id: body.shiftId ?? null,
		p_payment_method: body.paymentMethod ?? 'cash',
		p_payment_channel: body.channel ?? null,
		p_payment_gateway_ref: body.gatewayRef ?? null,
		p_items: body.items.map((i) => ({ variantId: i.variantId, qty: i.qty })),
		p_payment_status: body.paymentStatus ?? 'completed'
	});

	if (rpcError) {
		const msg = String(rpcError.message);
		if (msg.includes('NO_ACTIVE_SUBSCRIPTION')) httpError(403, 'SUBSCRIPTION_REQUIRED');
		if (msg.includes('INSUFFICIENT_STOCK')) httpError(422, 'INSUFFICIENT_STOCK');
		if (msg.includes('INVALID_VARIANT')) httpError(422, 'INVALID_VARIANT');
		httpError(500, 'TRANSACTION_FAILED');
	}

	return json({ ok: true, transaction: data });
});

/** GET /api/transactions — daftar transaksi toko (untuk laporan). */
transactionsService.get('/', async (c) => {
	const ctx = await requireApiAuth(c);
	const limit = Number(c.req.query('limit') ?? '50');

	const { data, error: selectError } = await ctx.db
		.from('transactions')
		.select('*, transaction_items(*)')
		.order('created_at', { ascending: false })
		.limit(limit);

	if (selectError) httpError(500, 'FETCH_FAILED');
	return json({ transactions: data ?? [] });
});

/** POST /api/transactions/[id]/confirm — konfirmasi pembayaran digital PAID → potong stok. */
transactionsService.post('/:id/confirm', async (c) => {
	const ctx = await requireApiAuth(c);
	const transactionId = c.req.param('id');

	const { data, error: rpcError } = await ctx.db.rpc('confirm_payment', {
		p_transaction_id: transactionId
	});

	if (rpcError) {
		const msg = String(rpcError.message);
		if (msg.includes('NOT_FOUND')) httpError(404, 'NOT_FOUND');
		if (msg.includes('NO_ACTIVE_SUBSCRIPTION')) httpError(403, 'SUBSCRIPTION_REQUIRED');
		if (msg.includes('INSUFFICIENT_STOCK')) httpError(422, 'INSUFFICIENT_STOCK');
		httpError(500, 'CONFIRM_FAILED');
	}

	return json({ ok: true, ...data });
});

// ============ REPORTS ============
/** GET /api/reports/summary?from=...&to=... — ringkasan penjualan & HPP. */
reportsService.get('/summary', async (c) => {
	const ctx = await requireApiAuth(c);

	const from = c.req.query('from') ?? new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
	const to = c.req.query('to') ?? new Date().toISOString().slice(0, 10);
	const fromIso = `${from}T00:00:00.000Z`;
	const toIso = `${to}T23:59:59.999Z`;

	const [txResult, ingResult, recipeResult] = await Promise.all([
		ctx.db
			.from('transactions')
			.select('id, receipt_no, total_amount, payment_method, paid_at, transaction_items(variant_id, product_name, quantity, unit_price, line_total)')
			.gte('paid_at', fromIso)
			.lte('paid_at', toIso)
			.order('paid_at', { ascending: false })
			.limit(2000),
		ctx.db.from('ingredients').select('id, name, unit, stock_quantity, min_stock, cost_per_unit'),
		ctx.db.from('recipes').select('variant_id, ingredient_id, quantity_required')
	]);
	if (txResult.error) httpError(500, 'FETCH_FAILED');

	const ingredients = (ingResult.data ?? []) as {
		id: string;
		name: string;
		unit: string;
		stock_quantity: number;
		min_stock: number;
		cost_per_unit: number;
	}[];
	const recipes = (recipeResult.data ?? []) as {
		variant_id: string;
		ingredient_id: string;
		quantity_required: number;
	}[];

	const costMap = new Map<string, number>(ingredients.map((i) => [i.id, Number(i.cost_per_unit ?? 0)]));
	const recipeCost = new Map<string, number>();
	for (const r of recipes) {
		const cst = recipeCost.get(r.variant_id) ?? 0;
		recipeCost.set(r.variant_id, cst + Number(r.quantity_required) * (costMap.get(r.ingredient_id) ?? 0));
	}

	const transactions = (txResult.data ?? []) as {
		id: string;
		receipt_no: string;
		total_amount: number;
		payment_method: string;
		paid_at: string;
		transaction_items: {
			variant_id: string | null;
			product_name: string;
			quantity: number;
			unit_price: number;
			line_total: number;
		}[];
	}[];

	let omzet = 0;
	let hppTotal = 0;
	let count = 0;
	const menuMap = new Map<string, { name: string; qty: number; revenue: number; hpp: number }>();
	const dailyMap = new Map<string, { date: string; omzet: number; count: number }>();

	for (const t of transactions) {
		omzet += Number(t.total_amount ?? 0);
		count += 1;
		const day = (t.paid_at ?? '').slice(0, 10);
		const daily = dailyMap.get(day) ?? { date: day, omzet: 0, count: 0 };
		daily.omzet += Number(t.total_amount ?? 0);
		daily.count += 1;
		dailyMap.set(day, daily);

		for (const item of t.transaction_items ?? []) {
			const qty = Number(item.quantity ?? 0);
			const unitHpp = item.variant_id ? (recipeCost.get(item.variant_id) ?? 0) : 0;
			const itemHpp = unitHpp * qty;
			hppTotal += itemHpp;
			const key = `${item.product_name}|${item.variant_id ?? ''}`;
			const cur = menuMap.get(key) ?? { name: item.product_name, qty: 0, revenue: 0, hpp: 0 };
			cur.qty += qty;
			cur.revenue += Number(item.line_total ?? 0);
			cur.hpp += itemHpp;
			menuMap.set(key, cur);
		}
	}

	const topMenus = [...menuMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
	const profit = omzet - hppTotal;
	const lowStock = ingredients
		.filter((i) => Number(i.stock_quantity) <= Number(i.min_stock))
		.map((i) => ({ id: i.id, name: i.name, unit: i.unit, stock: Number(i.stock_quantity), minStock: Number(i.min_stock) }));

	const days: string[] = [];
	for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
		days.push(d.toISOString().slice(0, 10));
	}
	const daily = days.map((date) => dailyMap.get(date) ?? { date, omzet: 0, count: 0 });

	return json({
		period: { from, to },
		omzet,
		txCount: count,
		hpp: hppTotal,
		profit,
		marginPct: omzet > 0 ? Math.round((profit / omzet) * 1000) / 10 : 0,
		topMenus: topMenus.map((m) => ({ ...m, profit: m.revenue - m.hpp })),
		lowStock,
		daily,
		shopName: ctx.shop.shopName
	});
});

/** GET /api/reports/export/sales?from=...&to=... — ekspor penjualan CSV. */
reportsService.get('/export/sales', async (c) => {
	const ctx = await requireApiAuth(c);

	const from = c.req.query('from') ?? new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
	const to = c.req.query('to') ?? new Date().toISOString().slice(0, 10);

	const { data, error: selectError } = await ctx.db
		.from('transactions')
		.select('receipt_no, paid_at, total_amount, payment_method, payment_channel, payment_gateway_ref, transaction_items(product_name, quantity, unit_price, line_total)')
		.gte('paid_at', `${from}T00:00:00.000Z`)
		.lte('paid_at', `${to}T23:59:59.999Z`)
		.order('paid_at', { ascending: false })
		.limit(5000);
	if (selectError) httpError(500, 'FETCH_FAILED');

	const rows: string[][] = [['No. Struk', 'Waktu', 'Item', 'Metode', 'Channel', 'Ref ID', 'Total']];
	for (const t of data ?? []) {
		rows.push([
			t.receipt_no ?? '',
			new Date(t.paid_at).toLocaleString('id-ID'),
			(t.transaction_items ?? []).map((i) => `${i.quantity}x ${i.product_name}`).join('; '),
			t.payment_method ?? '',
			t.payment_channel ?? '',
			t.payment_gateway_ref ?? '',
			String(Number(t.total_amount ?? 0))
		]);
	}

	const csv = '\uFEFF' + rows.map((r) => r.map((cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(',')).join('\n');

	return new Response(csv, {
		headers: {
			'Content-Type': 'text/csv;charset=utf-8',
			'Content-Disposition': `attachment; filename="posspace-penjualan-${from}-${to}.csv"`
		}
	});
});

/** GET /api/reports/export/stock — ekspor laporan stok CSV. */
reportsService.get('/export/stock', async (c) => {
	const ctx = await requireApiAuth(c);

	const { data, error: selectError } = await ctx.db
		.from('ingredients')
		.select('name, unit, stock_quantity, min_stock, cost_per_unit')
		.eq('shop_id', ctx.shop.shopId)
		.order('name', { ascending: true });
	if (selectError) httpError(500, 'FETCH_FAILED');

	const rows: string[][] = [['Bahan', 'Satuan', 'Stok', 'Batas Minimum', 'HPP / Satuan', 'Status']];
	for (const i of data ?? []) {
		const stock = Number(i.stock_quantity ?? 0);
		const min = Number(i.min_stock ?? 0);
		rows.push([
			i.name ?? '',
			i.unit ?? '',
			String(stock),
			String(min),
			String(Number(i.cost_per_unit ?? 0)),
			stock <= min ? 'Perlu beli' : 'Aman'
		]);
	}

	const csv = '\uFEFF' + rows.map((r) => r.map((cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(',')).join('\n');

	return new Response(csv, {
		headers: {
			'Content-Type': 'text/csv;charset=utf-8',
			'Content-Disposition': `attachment; filename="posspace-stok-${new Date().toISOString().slice(0, 10)}.csv"`
		}
	});
});