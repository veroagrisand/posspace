import { Hono } from 'hono';
import { json, httpError } from '../http.js';
import { requireApiAuth, requireAuth } from '../guards.js';
import { service } from '../db.js';
import { createShopSubscription, payPendingInvoice, redeemVoucherToPendingInvoice } from '../subscription.js';

/**
 * Service shop — profil toko, manajemen anggota, voucher langganan.
 */

export const shopService = new Hono();
export const subscriptionService = new Hono();

/** GET /api/shop — profil toko + anggota + subscription (untuk halaman Pengaturan). */
shopService.get('/', async (c) => {
	const ctx = await requireApiAuth(c);

	const { data: shop } = await ctx.db
		.from('shops')
		.select('id, name, address, phone, currency')
		.eq('id', ctx.shop.shopId)
		.single();

	const { data: profiles } = await ctx.db
		.from('profiles')
		.select('id, full_name, role')
		.eq('shop_id', ctx.shop.shopId);

	const { data: subscription } = await ctx.db
		.from('subscriptions')
		.select('status, plan_id, period_end, plans(name)')
		.eq('shop_id', ctx.shop.shopId)
		.in('status', ['pending', 'trialing', 'active'])
		.order('created_at', { ascending: false })
		.limit(1)
		.single();

	return json({ shop, profiles, subscription });
});

/** PATCH /api/shop — ubah profil toko (nama, alamat, telepon, mata uang). */
shopService.patch('/', async (c) => {
	const ctx = await requireApiAuth(c);

	const body = (await c.req.json().catch(() => ({}))) as {
		name?: string;
		address?: string;
		phone?: string;
		currency?: string;
	};

	const { data, error: updateError } = await ctx.db
		.from('shops')
		.update({
			name: body.name ?? undefined,
			address: body.address ?? undefined,
			phone: body.phone ?? undefined,
			currency: body.currency ?? undefined
		})
		.eq('id', ctx.shop.shopId)
		.select('*')
		.single();

	if (updateError || !data) httpError(500, 'UPDATE_FAILED');
	return json({ shop: data });
});

// ============ MEMBERS ============
/** POST /api/shop/members — undang anggota baru (pemilik toko). */
shopService.post('/members', async (c) => {
	const ctx = await requireApiAuth(c);
	if (ctx.shop.profileRole !== 'pemilik') {
		httpError(403, 'OWNER_ONLY');
	}

	const body = (await c.req.json().catch(() => ({}))) as { name?: string; email?: string; role?: string };
	if (!body.name?.trim() || !body.email?.trim()) httpError(400, 'INVALID_INPUT');
	if (!['kasir', 'admin_gudang', 'pemilik'].includes(body.role ?? '')) httpError(400, 'INVALID_ROLE');

	const db = service();
	const tempPassword = `PS-${Math.random().toString(36).slice(2, 10)}`;

	const { data: created, error: createError } = await db.auth.admin.createUser({
		email: body.email.trim(),
		password: tempPassword,
		email_confirm: true,
		user_metadata: { full_name: body.name.trim() }
	});
	if (createError || !created.user) {
		if (String(createError?.message ?? '').toLowerCase().includes('already')) httpError(409, 'EMAIL_EXISTS');
		httpError(500, 'CREATE_FAILED');
	}

	const { error: linkError } = await db
		.from('profiles')
		.update({ shop_id: ctx.shop.shopId, role: body.role })
		.eq('id', created.user.id);
	if (linkError) httpError(500, 'LINK_FAILED');

	return json({ ok: true, tempPassword });
});

/** PATCH /api/shop/members/[id] — ubah peran anggota (pemilik toko). */
shopService.patch('/members/:id', async (c) => {
	const ctx = await requireApiAuth(c);
	const profileId = c.req.param('id');

	if (ctx.shop.profileRole !== 'pemilik') {
		httpError(403, 'OWNER_ONLY');
	}

	const body = (await c.req.json().catch(() => ({}))) as { role?: string };
	if (!['kasir', 'admin_gudang', 'pemilik'].includes(body.role ?? '')) {
		httpError(400, 'INVALID_ROLE');
	}

	const db = service();
	const { data: member } = await db
		.from('profiles')
		.select('id, shop_id, role')
		.eq('id', profileId)
		.single();

	if (!member || member.shop_id !== ctx.shop.shopId) {
		httpError(404, 'NOT_FOUND');
	}
	if (member.role === 'pemilik' && body.role !== 'pemilik') {
		httpError(400, 'LAST_OWNER');
	}

	const { error: updateError } = await db.from('profiles').update({ role: body.role }).eq('id', profileId);
	if (updateError) httpError(500, 'UPDATE_FAILED');

	return json({ ok: true });
});

// ============ SUBSCRIPTION ============
/**
 * POST /api/subscription/create — buat langganan baru untuk pengguna yang login
 * (dipakai halaman /subscribe via SSR action yang memanggil gateway).
 * Body: { planId, billingPeriod }
 */
subscriptionService.post('/create', async (c) => {
	const auth = await requireAuth(c);

	const body = (await c.req.json().catch(() => ({}))) as { planId?: string; billingPeriod?: string };

	// Ambil nama toko & nama pemilik dari metadata profil (diset saat register).
	const { data: profile } = await auth.db.from('profiles').select('shop_id, full_name').eq('id', auth.user.id).single();

	const result = await createShopSubscription({
		user: {
			id: auth.user.id,
			email: auth.user.email,
			user_metadata: {
				full_name: profile?.full_name ?? '',
				shop_name: ''
			}
		},
		planId: body.planId ?? 'pro',
		billingPeriod: body.billingPeriod === 'annual' ? 'annual' : 'monthly',
		c
	});

	return json({ ok: true, ...result });
});

// ============ VOUCHER ============
/** POST /api/subscription/voucher — pakai voucher diskon untuk invoice PENDING. */
subscriptionService.post('/voucher', async (c) => {
	const body = (await c.req.json().catch(() => ({}))) as { code?: string };
	const code = (body.code ?? '').trim();
	if (!code) httpError(400, 'CODE_REQUIRED');

	const auth = await requireAuth(c);

	const { data: profile } = await auth.db
		.from('profiles')
		.select('shop_id')
		.eq('id', auth.user.id)
		.single();
	if (!profile?.shop_id) httpError(409, 'NO_SHOP');

	try {
		const result = await redeemVoucherToPendingInvoice({ shopId: profile.shop_id, code, c });
		return json({ ok: true, ...result });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'VOUCHER_FAILED';
		httpError(400, message);
	}
});

// ============ PAY ============
/** POST /api/subscription/pay — buat/ulang instruksi pembayaran Snap untuk invoice PENDING. */
subscriptionService.post('/pay', async (c) => {
	const auth = await requireAuth(c);

	const { data: profile } = await auth.db
		.from('profiles')
		.select('shop_id')
		.eq('id', auth.user.id)
		.single();
	if (!profile?.shop_id) httpError(409, 'NO_SHOP');

	try {
		const result = await payPendingInvoice({ shopId: profile.shop_id, c });
		return json({ ok: true, ...result });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'PAYMENT_FAILED';
		httpError(400, message);
	}
});