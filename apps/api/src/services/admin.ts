import { Hono } from 'hono';
import { json, httpError } from '../http.js';
import { requirePlatformAdmin } from '../guards.js';
import { service } from '../db.js';

/**
 * Service admin — kontrol seluruh SaaS (khusus platform admin):
 * overview, toko, langganan, paket, voucher, monitor & access log.
 */

export const adminService = new Hono();

const ACTIVE_STATUSES = ['active', 'trialing'];

// ============ OVERVIEW ============
/** GET /api/admin/overview — ringkasan seluruh SaaS. */
adminService.get('/overview', async (c) => {
	await requirePlatformAdmin(c);
	const db = service();

	const [shops, subs, plans, profiles, txns, ingredients] = await Promise.all([
		db.from('shops').select('id, name, created_at').order('created_at', { ascending: false }),
		db.from('subscriptions').select('shop_id, plan_id, status, period_end'),
		db.from('plans').select('id, monthly_price, name'),
		db.from('profiles').select('id, shop_id, role'),
		db.from('transactions').select('shop_id, total_amount, paid_at').order('paid_at', { ascending: false }).limit(50000),
		db.from('ingredients').select('id, shop_id, name, stock_quantity, min_stock, unit')
	]);

	if (shops.error) httpError(500, 'FETCH_FAILED');

	const planPrice = new Map((plans.data ?? []).map((p) => [p.id, Number(p.monthly_price ?? 0)]));
	const planName = new Map((plans.data ?? []).map((p) => [p.id, p.name ?? p.id]));

	const now = new Date();
	const byShop = new Map<string, { sub?: { shop_id: string; plan_id: string; status: string; period_end: string | null }; active?: boolean }>();
	for (const s of subs.data ?? []) {
		const active = ACTIVE_STATUSES.includes(s.status) && (!s.period_end || new Date(s.period_end) > now);
		if (!byShop.has(s.shop_id)) byShop.set(s.shop_id, {});
		const prev = byShop.get(s.shop_id)!;
		if (!prev.sub || active) {
			byShop.set(s.shop_id, { sub: s, active });
		}
	}

	const subCounts = { active: 0, trialing: 0, pending: 0, expired: 0, none: 0 };
	let mrr = 0;
	for (const shop of shops.data ?? []) {
		const info = byShop.get(shop.id);
		const sub = info?.sub;
		if (!sub) {
			subCounts.none += 1;
			continue;
		}
		if (info?.active) {
			if (sub.status === 'trialing') subCounts.trialing += 1;
			else subCounts.active += 1;
			if (sub.status === 'active') mrr += planPrice.get(sub.plan_id) ?? 0;
		} else if (sub.status === 'pending') {
			subCounts.pending += 1;
		} else {
			subCounts.expired += 1;
		}
	}

	let totalOmzet = 0;
	let todayOmzet = 0;
	const dayStart = new Date();
	dayStart.setUTCHours(0, 0, 0, 0);
	const dailyMap = new Map<string, { date: string; omzet: number; count: number }>();
	for (const t of txns.data ?? []) {
		totalOmzet += Number(t.total_amount ?? 0);
		const paid = t.paid_at ? new Date(t.paid_at) : null;
		if (paid && paid >= dayStart) todayOmzet += Number(t.total_amount ?? 0);
		if (paid) {
			const day = paid.toISOString().slice(0, 10);
			const d = dailyMap.get(day) ?? { date: day, omzet: 0, count: 0 };
			d.omzet += Number(t.total_amount ?? 0);
			d.count += 1;
			dailyMap.set(day, d);
		}
	}

	const days: string[] = [];
	for (let d = new Date(Date.now() - 13 * 864e5); d <= new Date(); d.setUTCDate(d.getUTCDate() + 1)) {
		days.push(d.toISOString().slice(0, 10));
	}
	const revenue = days.map((date) => dailyMap.get(date) ?? { date, omzet: 0, count: 0 });

	const lowStockCount = (ingredients.data ?? []).filter((i) => Number(i.stock_quantity) <= Number(i.min_stock)).length;

	const recentShops = (shops.data ?? []).slice(0, 8).map((shop) => {
		const info = byShop.get(shop.id);
		const sub = info?.sub;
		return {
			id: shop.id,
			name: shop.name,
			createdAt: shop.created_at,
			subStatus: !sub ? 'none' : info?.active ? sub.status : sub.status === 'pending' ? 'pending' : 'expired',
			planId: sub?.plan_id ?? null,
			planName: sub ? (planName.get(sub.plan_id) ?? sub.plan_id) : null,
			periodEnd: sub?.period_end ?? null
		};
	});

	return json({
		totals: {
			shops: shops.data?.length ?? 0,
			users: profiles.data?.length ?? 0,
			transactions: txns.data?.length ?? 0,
			omzet: totalOmzet,
			todayOmzet,
			lowStockIngredients: lowStockCount
		},
		subscriptions: { ...subCounts, mrr },
		revenue,
		recentShops
	});
});

// ============ SHOPS ============
/** GET /api/admin/shops — daftar semua toko terdaftar di SaaS. */
adminService.get('/shops', async (c) => {
	await requirePlatformAdmin(c);
	const db = service();

	const [shops, subs, plans, profiles, products, txns, ingredients] = await Promise.all([
		db.from('shops').select('id, name, address, phone, currency, created_at').order('created_at', { ascending: false }),
		db.from('subscriptions').select('shop_id, plan_id, status, period_end'),
		db.from('plans').select('id, name'),
		db.from('profiles').select('id, shop_id, role'),
		db.from('products').select('id, shop_id, is_active'),
		db.from('transactions').select('shop_id, total_amount').limit(100000),
		db.from('ingredients').select('id, shop_id, stock_quantity, min_stock')
	]);

	if (shops.error) httpError(500, 'FETCH_FAILED');

	const planName = new Map((plans.data ?? []).map((p) => [p.id, p.name ?? p.id]));
	const now = new Date();
	const activeSub = new Map<string, { plan_id: string; status: string; period_end: string | null }>();
	for (const s of subs.data ?? []) {
		const isActive = ['active', 'trialing'].includes(s.status) && (!s.period_end || new Date(s.period_end) > now);
		if (isActive) {
			const existing = activeSub.get(s.shop_id);
			if (!existing) activeSub.set(s.shop_id, s);
		}
	}

	const membersByShop = new Map<string, { total: number; pemilik: number }>();
	for (const p of profiles.data ?? []) {
		const cur = membersByShop.get(p.shop_id) ?? { total: 0, pemilik: 0 };
		cur.total += 1;
		if (p.role === 'pemilik') cur.pemilik += 1;
		membersByShop.set(p.shop_id, cur);
	}

	const productsByShop = new Map<string, { total: number; active: number }>();
	for (const p of products.data ?? []) {
		const cur = productsByShop.get(p.shop_id) ?? { total: 0, active: 0 };
		cur.total += 1;
		if (p.is_active) cur.active += 1;
		productsByShop.set(p.shop_id, cur);
	}

	const statsByShop = new Map<string, { tx: number; omzet: number }>();
	for (const t of txns.data ?? []) {
		const cur = statsByShop.get(t.shop_id) ?? { tx: 0, omzet: 0 };
		cur.tx += 1;
		cur.omzet += Number(t.total_amount ?? 0);
		statsByShop.set(t.shop_id, cur);
	}

	const lowByShop = new Map<string, number>();
	for (const i of ingredients.data ?? []) {
		if (Number(i.stock_quantity) <= Number(i.min_stock)) {
			lowByShop.set(i.shop_id, (lowByShop.get(i.shop_id) ?? 0) + 1);
		}
	}

	const list = (shops.data ?? []).map((shop) => {
		const sub = activeSub.get(shop.id);
		const stats = statsByShop.get(shop.id) ?? { tx: 0, omzet: 0 };
		const members = membersByShop.get(shop.id) ?? { total: 0, pemilik: 0 };
		const products = productsByShop.get(shop.id) ?? { total: 0, active: 0 };
		return {
			...shop,
			subscription: sub
				? { status: sub.status, planId: sub.plan_id, planName: planName.get(sub.plan_id) ?? sub.plan_id, periodEnd: sub.period_end }
				: null,
			membersCount: members.total,
			productsCount: products.total,
			txCount: stats.tx,
			omzet: stats.omzet,
			lowStockCount: lowByShop.get(shop.id) ?? 0
		};
	});

	return json({ shops: list });
});

/** GET /api/admin/shops/[id] — detail satu toko. */
adminService.get('/shops/:id', async (c) => {
	await requirePlatformAdmin(c);
	const db = service();
	const shopId = c.req.param('id');

	const [shop, subs, plans, profiles, products, variants, ingredients, recipes, txns, shifts] = await Promise.all([
		db.from('shops').select('id, name, address, phone, currency, created_at').eq('id', shopId).maybeSingle(),
		db.from('subscriptions').select('shop_id, plan_id, status, period_start, period_end, created_at').eq('shop_id', shopId).order('created_at', { ascending: false }),
		db.from('plans').select('id, name, monthly_price'),
		db.from('profiles').select('id, full_name, role, created_at').eq('shop_id', shopId),
		db.from('products').select('id, name, category, is_active, created_at').eq('shop_id', shopId).order('created_at', { ascending: false }),
		db.from('product_variants').select('id, product_id, name, price, is_active'),
		db.from('ingredients').select('id, name, unit, stock_quantity, min_stock, cost_per_unit').eq('shop_id', shopId).order('name', { ascending: true }),
		db.from('recipes').select('variant_id, ingredient_id, quantity_required'),
		db.from('transactions').select('id, receipt_no, total_amount, payment_method, payment_channel, payment_gateway_ref, paid_at, transaction_items(product_name, quantity, line_total)').eq('shop_id', shopId).order('paid_at', { ascending: false }).limit(30),
		db.from('shifts').select('id, profile_id, opened_at, closed_at, opening_cash, expected_cash, actual_cash, status').eq('shop_id', shopId).order('opened_at', { ascending: false }).limit(10)
	]);

	if (shop.error || !shop.data) httpError(404, 'SHOP_NOT_FOUND');

	const planPrice = new Map((plans.data ?? []).map((p) => [p.id, Number(p.monthly_price ?? 0)]));
	const planName = new Map((plans.data ?? []).map((p) => [p.id, p.name ?? p.id]));
	void planPrice;

	const now = new Date();
	const subscription = (subs.data ?? [])
		.map((s) => ({
			...s,
			planName: planName.get(s.plan_id) ?? s.plan_id,
			active: ['active', 'trialing'].includes(s.status) && (!s.period_end || new Date(s.period_end) > now)
		}))
		.sort((a, b) => Number(b.active) - Number(a.active))[0] ?? null;

	const variantByProduct = new Map<string, number>();
	for (const v of variants.data ?? []) {
		variantByProduct.set(v.product_id, (variantByProduct.get(v.product_id) ?? 0) + 1);
	}
	const productsList = (products.data ?? []).map((p) => ({
		...p,
		variantsCount: variantByProduct.get(p.id) ?? 0
	}));

	const costMap = new Map<string, number>((ingredients.data ?? []).map((i) => [i.id, Number(i.cost_per_unit ?? 0)]));
	const recipeCost = new Map<string, number>();
	for (const r of recipes.data ?? []) {
		recipeCost.set(r.variant_id, (recipeCost.get(r.variant_id) ?? 0) + Number(r.quantity_required) * (costMap.get(r.ingredient_id) ?? 0));
	}

	const transactions = (txns.data ?? []).map((t) => ({
		...t,
		hpp: (t.transaction_items ?? []).reduce((sum: number, it: any) => sum + (it.variant_id ? (recipeCost.get(it.variant_id) ?? 0) : 0) * Number(it.quantity ?? 0), 0)
	}));

	let omzet = 0;
	let txCount = 0;
	const dailyMap = new Map<string, { date: string; omzet: number; count: number }>();
	for (const t of transactions) {
		omzet += Number(t.total_amount ?? 0);
		txCount += 1;
		if (t.paid_at) {
			const day = t.paid_at.slice(0, 10);
			const d = dailyMap.get(day) ?? { date: day, omzet: 0, count: 0 };
			d.omzet += Number(t.total_amount ?? 0);
			d.count += 1;
			dailyMap.set(day, d);
		}
	}
	const days: string[] = [];
	for (let d = new Date(Date.now() - 13 * 864e5); d <= new Date(); d.setUTCDate(d.getUTCDate() + 1)) {
		days.push(d.toISOString().slice(0, 10));
	}
	const revenue = days.map((date) => dailyMap.get(date) ?? { date, omzet: 0, count: 0 });

	return json({
		shop: shop.data,
		subscription,
		members: profiles.data ?? [],
		products: productsList,
		ingredients: (ingredients.data ?? []).map((i) => ({
			...i,
			lowStock: Number(i.stock_quantity) <= Number(i.min_stock)
		})),
		transactions,
		shifts: shifts.data ?? [],
		stats: { omzet, txCount, lowStockCount: (ingredients.data ?? []).filter((i) => Number(i.stock_quantity) <= Number(i.min_stock)).length },
		revenue
	});
});

/** PATCH /api/admin/shops/[id] — perbarui profil toko. */
adminService.patch('/shops/:id', async (c) => {
	await requirePlatformAdmin(c);

	const body = (await c.req.json().catch(() => ({}))) as {
		name?: string;
		address?: string;
		phone?: string;
		currency?: string;
	};

	const patch: Record<string, unknown> = {};
	if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim();
	if (typeof body.address === 'string') patch.address = body.address.trim();
	if (typeof body.phone === 'string') patch.phone = body.phone.trim();
	if (typeof body.currency === 'string' && /^[A-Z]{3}$/.test(body.currency.trim())) patch.currency = body.currency.trim().toUpperCase();

	if (Object.keys(patch).length === 0) httpError(400, 'NO_CHANGES');

	const db = service();
	const { data: shop, error: updateError } = await db
		.from('shops')
		.update(patch)
		.eq('id', c.req.param('id'))
		.select('id, name, address, phone, currency')
		.single();

	if (updateError || !shop) httpError(500, 'UPDATE_FAILED');
	return json({ ok: true, shop });
});

/** DELETE /api/admin/shops/[id] — hapus toko (tanpa transaksi lunas). */
adminService.delete('/shops/:id', async (c) => {
	await requirePlatformAdmin(c);
	const db = service();
	const shopId = c.req.param('id');

	const { data: paidTx } = await db
		.from('transactions')
		.select('id')
		.eq('shop_id', shopId)
		.eq('payment_status', 'paid')
		.limit(1)
		.maybeSingle();
	if (paidTx) httpError(409, 'SHOP_HAS_PAID_TRANSACTIONS');

	const { data: shop, error: deleteError } = await db
		.from('shops')
		.delete()
		.eq('id', shopId)
		.select('id, name')
		.single();

	if (deleteError || !shop) httpError(500, 'DELETE_FAILED');
	return json({ ok: true, deleted: shop });
});

// ============ SUBSCRIPTIONS ============
/** GET /api/admin/subscriptions — daftar langganan semua toko. */
adminService.get('/subscriptions', async (c) => {
	await requirePlatformAdmin(c);
	const db = service();

	const [shops, subs, plans, invoices] = await Promise.all([
		db.from('shops').select('id, name, created_at').order('created_at', { ascending: false }),
		db.from('subscriptions').select('shop_id, plan_id, status, period_start, period_end, created_at').order('created_at', { ascending: false }),
		db.from('plans').select('id, name, monthly_price'),
		db.from('invoices').select('shop_id, status, amount, paid_at, created_at, merchant_order_id').order('created_at', { ascending: false })
	]);

	if (shops.error) httpError(500, 'FETCH_FAILED');

	const planName = new Map((plans.data ?? []).map((p) => [p.id, p.name ?? p.id]));
	const planPrice = new Map((plans.data ?? []).map((p) => [p.id, Number(p.monthly_price ?? 0)]));
	const now = new Date();

	const latestSub = new Map<string, { plan_id: string; status: string; period_start: string | null; period_end: string | null }>();
	for (const s of subs.data ?? []) {
		if (!latestSub.has(s.shop_id)) latestSub.set(s.shop_id, s);
	}

	const lastPaid = new Map<string, { status: string; amount: number; paid_at: string | null; merchant_order_id: string }>();
	for (const i of invoices.data ?? []) {
		const cur = lastPaid.get(i.shop_id);
		if (!cur || (i.status === 'paid' && cur.status !== 'paid')) lastPaid.set(i.shop_id, i);
	}

	const list = (shops.data ?? []).map((shop) => {
		const sub = latestSub.get(shop.id) ?? null;
		const paid = lastPaid.get(shop.id) ?? null;
		const active = !!sub && ['active', 'trialing'].includes(sub.status) && (!sub.period_end || new Date(sub.period_end) > now);

		return {
			shopId: shop.id,
			shopName: shop.name,
			createdAt: shop.created_at,
			subscription: sub
				? {
						planId: sub.plan_id,
						planName: planName.get(sub.plan_id) ?? sub.plan_id,
						monthlyPrice: planPrice.get(sub.plan_id) ?? 0,
						status: sub.status,
						periodStart: sub.period_start,
						periodEnd: sub.period_end,
						active
					}
				: null,
			lastInvoice: paid
				? { status: paid.status, amount: Number(paid.amount ?? 0), paidAt: paid.paid_at, merchantOrderId: paid.merchant_order_id }
				: null
		};
	});

	return json({ subscriptions: list });
});

/** POST /api/admin/subscriptions/[shopId]/activate — aktivasi/perpanjang langganan. */
adminService.post('/subscriptions/:shopId/activate', async (c) => {
	await requirePlatformAdmin(c);
	const db = service();
	const shopId = c.req.param('shopId');

	const body = (await c.req.json().catch(() => ({}))) as { months?: number; planId?: string };
	const months = Math.min(24, Math.max(1, Number(body.months ?? 1)));
	const planId = body.planId ?? 'starter';

	const { data: shop } = await db.from('shops').select('id').eq('id', shopId).maybeSingle();
	if (!shop) httpError(404, 'SHOP_NOT_FOUND');

	const { data: plans } = await db.from('plans').select('id').eq('id', planId).maybeSingle();
	if (!plans) httpError(400, 'INVALID_PLAN');

	const { data: existing } = await db
		.from('subscriptions')
		.select('id, status, period_start, period_end, plan_id')
		.eq('shop_id', shopId)
		.order('created_at', { ascending: false })
		.limit(1)
		.maybeSingle();

	const now = new Date();
	const isActive = existing && ['active', 'trialing'].includes(existing.status);
	const start = existing?.period_start && isActive && new Date(existing.period_start) <= now ? new Date(existing.period_start) : new Date(now);

	let end: Date;
	if (existing && isActive && existing.period_end && new Date(existing.period_end) > now) {
		end = new Date(existing.period_end);
	} else {
		end = new Date(now);
	}
	end.setMonth(end.getMonth() + months);

	let subscriptionId: string;
	if (existing) {
		subscriptionId = existing.id;
		const { error: updateError } = await db
			.from('subscriptions')
			.update({
				status: 'active',
				plan_id: planId,
				period_start: start.toISOString(),
				period_end: end.toISOString()
			})
			.eq('id', existing.id);
		if (updateError) httpError(500, 'SUBSCRIPTION_UPDATE_FAILED');
	} else {
		const { data: created, error: insertError } = await db
			.from('subscriptions')
			.insert({
				shop_id: shopId,
				plan_id: planId,
				status: 'active',
				period_start: start.toISOString(),
				period_end: end.toISOString()
			})
			.select('id')
			.single();
		if (insertError || !created) httpError(500, 'SUBSCRIPTION_CREATE_FAILED');
		subscriptionId = created.id;
	}

	const { data: pendingInvoice } = await db
		.from('invoices')
		.select('id, subscription_id')
		.eq('shop_id', shopId)
		.eq('status', 'pending')
		.order('created_at', { ascending: false })
		.limit(1)
		.maybeSingle();
	if (pendingInvoice) {
		await db
			.from('invoices')
			.update({ status: 'paid', paid_at: now.toISOString() })
			.eq('id', pendingInvoice.id);
		if (pendingInvoice.subscription_id !== subscriptionId) {
			await db.from('subscriptions').update({ plan_id: planId }).eq('id', pendingInvoice.subscription_id);
		}
	}

	return json({
		ok: true,
		subscription: { id: subscriptionId, shopId, planId, status: 'active', periodStart: start.toISOString(), periodEnd: end.toISOString() }
	});
});

/** POST /api/admin/subscriptions/[shopId]/cancel — batalkan langganan. */
adminService.post('/subscriptions/:shopId/cancel', async (c) => {
	await requirePlatformAdmin(c);
	const db = service();
	const shopId = c.req.param('shopId');

	const { data: existing } = await db
		.from('subscriptions')
		.select('id, status')
		.eq('shop_id', shopId)
		.order('created_at', { ascending: false })
		.limit(1)
		.maybeSingle();

	if (!existing) httpError(404, 'NO_SUBSCRIPTION');
	if (existing.status === 'cancelled') return json({ ok: true, alreadyCancelled: true });

	const { error: updateError } = await db
		.from('subscriptions')
		.update({ status: 'cancelled' })
		.eq('id', existing.id);
	if (updateError) httpError(500, 'CANCEL_FAILED');

	return json({ ok: true });
});

// ============ PLANS ============
/** GET /api/admin/plans — daftar paket. */
adminService.get('/plans', async (c) => {
	await requirePlatformAdmin(c);
	const db = service();
	const { data: plans } = await db.from('plans').select('*').order('monthly_price');
	return json({ plans: plans ?? [] });
});

/** PUT /api/admin/plans — perbarui harga/nama/status paket. */
adminService.put('/plans', async (c) => {
	await requirePlatformAdmin(c);

	const body = (await c.req.json().catch(() => ({}))) as {
		plans?: { id: string; name?: string; monthly_price?: number; annual_price?: number; is_active?: boolean }[];
	};
	const plans = body.plans ?? [];
	if (!Array.isArray(plans) || plans.length === 0) httpError(400, 'INVALID_PLANS');

	const db = service();
	const updates: unknown[] = [];

	for (const p of plans) {
		if (!p.id) httpError(400, 'PLAN_ID_REQUIRED');
		const patch: Record<string, unknown> = {};
		if (typeof p.name === 'string' && p.name.trim()) patch.name = p.name.trim();
		if (typeof p.monthly_price === 'number' && Number.isFinite(p.monthly_price) && p.monthly_price >= 0)
			patch.monthly_price = p.monthly_price;
		if (typeof p.annual_price === 'number' && Number.isFinite(p.annual_price) && p.annual_price >= 0)
			patch.annual_price = p.annual_price;
		if (typeof p.is_active === 'boolean') patch.is_active = p.is_active;
		if (Object.keys(patch).length === 0) continue;
		updates.push(db.from('plans').update(patch).eq('id', p.id));
	}

	const results = (await Promise.all(updates)) as { error: Error | null }[];
	if (results.some((r) => r.error)) httpError(500, 'UPDATE_FAILED');

	return json({ ok: true });
});

// ============ VOUCHERS ============
const ALLOWED = ['percent', 'fixed'];

/** GET /api/admin/vouchers — daftar voucher. */
adminService.get('/vouchers', async (c) => {
	await requirePlatformAdmin(c);
	const db = service();
	const { data } = await db.from('vouchers').select('*').order('created_at', { ascending: false });
	return json({ vouchers: data ?? [] });
});

/** POST /api/admin/vouchers — buat voucher baru. */
adminService.post('/vouchers', async (c) => {
	await requirePlatformAdmin(c);

	const body = (await c.req.json().catch(() => ({}))) as {
		code?: string;
		label?: string;
		type?: string;
		value?: number;
		max_uses?: number;
		valid_from?: string | null;
		valid_until?: string | null;
	};

	const code = (body.code ?? '').trim().toUpperCase().replace(/\s+/g, '');
	const label = (body.label ?? '').trim();
	const type = body.type ?? '';
	const value = Number(body.value ?? 0);

	if (!code || code.length < 3) httpError(400, 'INVALID_CODE');
	if (!label) httpError(400, 'LABEL_REQUIRED');
	if (!ALLOWED.includes(type)) httpError(400, 'INVALID_TYPE');
	if (!Number.isFinite(value) || value <= 0) httpError(400, 'INVALID_VALUE');

	const db = service();
	const { data: existing } = await db.from('vouchers').select('id').eq('code', code).maybeSingle();
	if (existing) httpError(409, 'CODE_TAKEN');

	const { data: created, error: createError } = await db
		.from('vouchers')
		.insert({
			code,
			label,
			type,
			value,
			max_uses: Number.isFinite(body.max_uses) && Number(body.max_uses) >= 0 ? Math.floor(Number(body.max_uses)) : 0,
			valid_from: body.valid_from || null,
			valid_until: body.valid_until || null,
			is_active: true
		})
		.select('*')
		.single();

	if (createError || !created) httpError(500, 'CREATE_FAILED');
	return json({ ok: true, voucher: created });
});

/** PATCH /api/admin/vouchers/[id] — ubah voucher. */
adminService.patch('/vouchers/:id', async (c) => {
	await requirePlatformAdmin(c);

	const body = (await c.req.json().catch(() => ({}))) as {
		label?: string;
		type?: string;
		value?: number;
		max_uses?: number;
		valid_from?: string | null;
		valid_until?: string | null;
		is_active?: boolean;
	};

	const patch: Record<string, unknown> = {};
	if (typeof body.label === 'string' && body.label.trim()) patch.label = body.label.trim();
	if (typeof body.type === 'string' && ALLOWED.includes(body.type)) patch.type = body.type;
	if (typeof body.value === 'number' && Number.isFinite(body.value) && body.value > 0) patch.value = body.value;
	if (typeof body.max_uses === 'number' && Number.isFinite(body.max_uses) && body.max_uses >= 0)
		patch.max_uses = Math.floor(body.max_uses);
	if (typeof body.is_active === 'boolean') patch.is_active = body.is_active;
	if ('valid_from' in body) patch.valid_from = body.valid_from ?? null;
	if ('valid_until' in body) patch.valid_until = body.valid_until ?? null;

	if (Object.keys(patch).length === 0) httpError(400, 'NO_CHANGES');

	const db = service();
	const { error: updateError } = await db.from('vouchers').update(patch).eq('id', c.req.param('id'));
	if (updateError) httpError(500, 'UPDATE_FAILED');

	return json({ ok: true });
});

/** DELETE /api/admin/vouchers/[id] — hapus voucher. */
adminService.delete('/vouchers/:id', async (c) => {
	await requirePlatformAdmin(c);
	const db = service();

	const { data: used } = await db.from('invoices').select('id').eq('voucher_id', c.req.param('id')).limit(1).maybeSingle();
	if (used) httpError(409, 'VOUCHER_IN_USE');

	const { error: deleteError } = await db.from('vouchers').delete().eq('id', c.req.param('id'));
	if (deleteError) httpError(500, 'DELETE_FAILED');

	return json({ ok: true });
});

// ============ MONITOR ============
/** GET /api/admin/monitor — ringkasan monitoring (RPC monitor_summary, validasi admin di DB). */
adminService.get('/monitor', async (c) => {
	await requirePlatformAdmin(c);

	const { data, error: rpcError } = await c.get('db')!.rpc('monitor_summary');
	if (rpcError) {
		console.error('[monitor] monitor_summary gagal:', rpcError.message);
		httpError(500, 'FETCH_FAILED');
	}
	return json(data);
});

const MAX_LIMIT = 200;

/** GET /api/admin/monitor/logs — daftar access log terfilter + pagination. */
adminService.get('/monitor/logs', async (c) => {
	await requirePlatformAdmin(c);
	const db = service();

	const rawLimit = Number(c.req.query('limit') ?? 50);
	const limit = Math.min(Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : 50, MAX_LIMIT);
	const rawPage = Number(c.req.query('page') ?? 1);
	const page = Math.max(1, Number.isFinite(rawPage) ? Math.floor(rawPage) : 1);
	const from = (page - 1) * limit;
	const to = from + limit - 1;

	const statusParam = c.req.query('status') ?? '';
	const pathParam = (c.req.query('path') ?? '').trim();
	const ipParam = (c.req.query('ip') ?? '').trim();

	let query = db
		.from('access_logs')
		.select('id, method, path, status, duration_ms, user_id, ip, user_agent, referer, error_msg, created_at', {
			count: 'exact'
		})
		.order('created_at', { ascending: false })
		.range(from, to);

	if (statusParam === '2xx') query = query.gte('status', 200).lt('status', 300);
	else if (statusParam === '3xx') query = query.gte('status', 300).lt('status', 400);
	else if (statusParam === '4xx') query = query.gte('status', 400).lt('status', 500);
	else if (statusParam === '5xx') query = query.gte('status', 500).lt('status', 600);
	else if (/^\d{3}$/.test(statusParam)) query = query.eq('status', Number(statusParam));

	if (pathParam) query = query.ilike('path', `%${pathParam}%`);
	if (ipParam) query = query.ilike('ip', `%${ipParam}%`);

	const { data, count, error: qError } = await query;
	if (qError) httpError(500, 'FETCH_FAILED');

	const logs = (data ?? []).map((l) => ({
		...l,
		path: l.path.length > 160 ? `${l.path.slice(0, 160)}…` : l.path
	}));

	const userIds = [...new Set((data ?? []).map((l) => l.user_id).filter(Boolean))];
	let identityMap: Record<string, { fullName: string; shopName: string }> = {};
	if (userIds.length > 0) {
		const [profiles, shops] = await Promise.all([
			db.from('profiles').select('id, full_name, shop_id').in('id', userIds),
			db.from('shops').select('id, name')
		]);
		const shopName = new Map((shops.data ?? []).map((s) => [s.id, s.name]));
		identityMap = Object.fromEntries(
			(profiles.data ?? []).map((p) => [p.id, { fullName: p.full_name, shopName: shopName.get(p.shop_id) ?? '' }])
		);
	}

	return json({ logs, total: count ?? 0, page, limit, users: identityMap });
});

/** POST /api/admin/monitor/logs — purge log lebih tua dari N hari. */
adminService.post('/monitor/logs', async (c) => {
	await requirePlatformAdmin(c);

	const body = (await c.req.json().catch(() => ({}))) as { days?: number };
	const days = Number(body.days ?? 30);
	if (!Number.isFinite(days) || days < 1 || days > 3650) {
		httpError(400, 'INVALID_DAYS');
	}

	const { data: deleted, error: rpcError } = await c.get('db')!.rpc('purge_access_logs', { p_days: days });
	if (rpcError) {
		console.error('[monitor] purge_access_logs gagal:', rpcError.message);
		httpError(500, 'PURGE_FAILED');
	}

	return json({ deleted: deleted ?? 0, days });
});

const CSV_COLS = [
	'timestamp',
	'method',
	'path',
	'status',
	'duration_ms',
	'user_id',
	'user_name',
	'shop_name',
	'ip',
	'user_agent',
	'referer',
	'error_msg'
];

const MAX_ROWS = 100000;

function csvCell(v: unknown): string {
	const s = v === null || v === undefined ? '' : String(v);
	return `"${s.replace(/"/g, '""')}"`;
}

/** GET /api/admin/monitor/export — unduh access log CSV untuk analisis. */
adminService.get('/monitor/export', async (c) => {
	await requirePlatformAdmin(c);
	const db = service();

	const statusParam = c.req.query('status') ?? '';
	const pathParam = (c.req.query('path') ?? '').trim();
	const ipParam = (c.req.query('ip') ?? '').trim();
	const rawDays = Number(c.req.query('days') ?? '');
	const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.floor(rawDays) : 0;

	let query = db
		.from('access_logs')
		.select('id, method, path, status, duration_ms, user_id, ip, user_agent, referer, error_msg, created_at')
		.order('created_at', { ascending: false })
		.limit(MAX_ROWS);

	if (statusParam === '2xx') query = query.gte('status', 200).lt('status', 300);
	else if (statusParam === '3xx') query = query.gte('status', 300).lt('status', 400);
	else if (statusParam === '4xx') query = query.gte('status', 400).lt('status', 500);
	else if (statusParam === '5xx') query = query.gte('status', 500).lt('status', 600);
	else if (/^\d{3}$/.test(statusParam)) query = query.eq('status', Number(statusParam));

	if (pathParam) query = query.ilike('path', `%${pathParam}%`);
	if (ipParam) query = query.ilike('ip', `%${ipParam}%`);
	if (days > 0) query = query.gte('created_at', new Date(Date.now() - days * 864e5).toISOString());

	const { data, error: qError } = await query;
	if (qError) httpError(500, 'FETCH_FAILED');

	const rows = data ?? [];

	const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
	let userMap: Record<string, { fullName: string; shopName: string }> = {};
	if (userIds.length > 0) {
		const [profiles, shops] = await Promise.all([
			db.from('profiles').select('id, full_name, shop_id').in('id', userIds),
			db.from('shops').select('id, name')
		]);
		const shopName = new Map((shops.data ?? []).map((s) => [s.id, s.name]));
		userMap = Object.fromEntries(
			(profiles.data ?? []).map((p) => [p.id, { fullName: p.full_name, shopName: shopName.get(p.shop_id) ?? '' }])
		);
	}

	const lines = [CSV_COLS.map(csvCell).join(',')];
	for (const r of rows) {
		const u = r.user_id ? userMap[r.user_id] : null;
		lines.push(
			[
				r.created_at,
				r.method,
				r.path,
				r.status,
				r.duration_ms,
				r.user_id ?? '',
				u?.fullName ?? '',
				u?.shopName ?? '',
				r.ip,
				r.user_agent,
				r.referer,
				r.error_msg
			]
				.map(csvCell)
				.join(',')
		);
	}

	const csv = '\uFEFF' + lines.join('\r\n') + '\r\n';
	const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
	return new Response(csv, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="posspace-access-logs-${stamp}.csv"`
		}
	});
});