import { Hono } from 'hono';
import { randomBytes } from 'node:crypto';
import { json, httpError } from '../http.js';
import { requireApiAuth, requireAuth, type ApiContext } from '../guards.js';
import { service } from '../db.js';
import { createShopSubscription, payPendingInvoice, redeemVoucherToPendingInvoice } from '../subscription.js';
import { sendMail, isSmtpConfigured } from '../mail.js';
import { publicBaseUrl } from '../url.js';
import { rateLimit, clientIp } from '../rateLimit.js';

/**
 * Service shop — profil toko, manajemen anggota, voucher langganan.
 */

export const shopService = new Hono();
export const subscriptionService = new Hono();

/** GET /api/shop/printer — pengaturan printer struk toko (null jika belum disetup). */
shopService.get('/printer', async (c) => {
	const ctx = await requireApiAuth(c);

	const { data } = await ctx.db
		.from('shop_printer_settings')
		.select('printer_type, paper_width, agent_url, enabled')
		.eq('shop_id', ctx.shop.shopId)
		.maybeSingle();

	return json({ printerSettings: data ?? null });
});

/** PUT /api/shop/printer — simpan pengaturan printer (khusus pemilik). */
shopService.put('/printer', async (c) => {
	const ctx = await requireApiAuth(c);
	if (ctx.shop.profileRole !== 'pemilik') httpError(403, 'FORBIDDEN');

	const body = (await c.req.json().catch(() => ({}))) as {
		printerType?: string;
		paperWidth?: string;
		agentUrl?: string;
		enabled?: boolean;
	};

	const enabled = body.enabled !== false;
	const printerType = body.printerType ?? 'browser';
	if (!['webusb', 'browser', 'agent'].includes(printerType)) httpError(400, 'INVALID_PRINTER_TYPE');
	const paperWidth = body.paperWidth === '58' ? '58' : '80';
	const agentUrl = printerType === 'agent' ? String(body.agentUrl ?? '').trim().replace(/\/+$/, '') : null;

	const { error } = await ctx.db
		.from('shop_printer_settings')
		.upsert(
			{ shop_id: ctx.shop.shopId, printer_type: printerType, paper_width: paperWidth, agent_url: agentUrl, enabled, updated_at: new Date().toISOString() },
			{ onConflict: 'shop_id' }
		)
		.eq('shop_id', ctx.shop.shopId);

	if (error) httpError(500, 'UPDATE_FAILED');

	return json({ ok: true, printerSettings: { printer_type: printerType, paper_width: paperWidth, agent_url: agentUrl, enabled } });
});

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
	if (body.role === 'kasir') {
		await assertCashierQuota(ctx, db);
	}
	const tempPassword = randomBytes(6).toString('base64url');

	const { data: created, error: createError } = await db.auth.admin.createUser({
		email: body.email.trim(),
		password: tempPassword,
		// email_confirm=true → akun LANGSUNG AKTIF (seperti webhook aktivasi),
		// tanpa perlu klik tautan verifikasi email dari Supabase.
		// must_change_password → anggota wajib ganti password saat login pertama.
		email_confirm: true,
		user_metadata: { full_name: body.name.trim(), must_change_password: true }
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

	// Kirim email notifikasi aktivasi: akun langsung aktif, tinggal login
	// dengan password sementara lalu ganti password saat pertama masuk.
	const email = body.email.trim();
	const roleLabel = body.role === 'pemilik' ? 'Pemilik / Manajer' : body.role === 'admin_gudang' ? 'Admin Gudang' : 'Kasir / Barista';
	const loginUrl = `${publicBaseUrl(c)}/login`;
	let emailSent = false;
	if (isSmtpConfigured) {
		try {
			await sendMail({
				to: email,
				subject: `Akun posspace aktif — ${ctx.shop.shopName}`,
				html: `
					<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #e7e9e4;border-radius:16px">
						<h2 style="color:#1c2721;margin:0 0 8px">Akun Anda sudah aktif</h2>
						<p style="color:#4f5e55;font-size:14px;line-height:1.6">Pemilik <strong>${escapeHtml(ctx.shop.shopName)}</strong> telah menambahkan Anda sebagai <strong>${roleLabel}</strong>. Akun langsung aktif — tidak perlu verifikasi email lagi.</p>
						<div style="background:#f5f5f1;border-radius:12px;padding:16px;margin:16px 0">
							<p style="color:#718078;font-size:12px;margin:0 0 6px">Password sementara Anda:</p>
							<div style="font-size:24px;font-weight:700;letter-spacing:2px;color:#1c2721">${tempPassword}</div>
						</div>
						<ol style="color:#4f5e55;font-size:13px;line-height:1.8;margin:0 0 16px;padding-left:20px">
							<li>Login di <a href="${loginUrl}" style="color:#d29a3b;font-weight:700">${loginUrl}</a> menggunakan email &amp; password sementara di atas.</li>
							<li>Sistem akan meminta Anda memasukkan kata sandi baru pada login pertama.</li>
							<li>Setelah itu, mulai gunakan aplikasi sesuai peran Anda.</li>
						</ol>
						<p style="color:#849088;font-size:12px">Jangan bagikan password ini kepada siapa pun. — posspace</p>
					</div>
				`,
				text: `Akun posspace Anda untuk ${ctx.shop.shopName} sudah aktif (peran: ${roleLabel}).\nPassword sementara: ${tempPassword}\n1) Login di ${loginUrl} dengan email & password di atas.\n2) Ganti kata sandi saat diminta pada login pertama.\n3) Mulai gunakan aplikasi.`
			});
			emailSent = true;
		} catch {
			// Email gagal terkirim — owner tetap bisa membagikan password sementara via dialog.
			emailSent = false;
		}
	}

	return json({ ok: true, tempPassword, emailSent });
});

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string);
}

/**
 * Batas jumlah kasir per paket langganan (RBAC per paket):
 * starter = 1 kasir, pro = 3 kasir, tumbuh = tanpa batas (null).
 */
export function maxCashiersForPlan(planId: string | null | undefined): number | null {
	if (planId === 'tumbuh') return null;
	if (planId === 'pro') return 3;
	return 1;
}

/** Hitung kasir aktif toko + cek kuota paket; lempar error bila melebihi. */
async function assertCashierQuota(ctx: ApiContext, db: ReturnType<typeof service>, extraCount = 0): Promise<void> {
	const limit = maxCashiersForPlan(ctx.shop.subscription?.planId);
	if (limit === null) return;

	const { count } = await db
		.from('profiles')
		.select('id', { count: 'exact', head: true })
		.eq('shop_id', ctx.shop.shopId)
		.eq('role', 'kasir');

	const current = Number(count ?? 0);
	if (current + extraCount > limit) {
		httpError(403, `KASIR_LIMIT_REACHED: paket ${ctx.shop.subscription?.planName ?? ctx.shop.subscription?.planId ?? 'starter'} maksimal ${limit} kasir`);
	}
}

/** PATCH /api/shop/members/[id] — ubah nama & peran anggota (pemilik toko). */
shopService.patch('/members/:id', async (c) => {
	const ctx = await requireApiAuth(c);
	const profileId = c.req.param('id');

	if (ctx.shop.profileRole !== 'pemilik') {
		httpError(403, 'OWNER_ONLY');
	}

	const body = (await c.req.json().catch(() => ({}))) as { name?: string; role?: string };
	if (body.role !== undefined && !['kasir', 'admin_gudang', 'pemilik'].includes(body.role)) {
		httpError(400, 'INVALID_ROLE');
	}
	if (body.name !== undefined && !String(body.name).trim()) {
		httpError(400, 'NAME_REQUIRED');
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
	// Pemilik terakhir tidak boleh diturunkan perannya.
	if (member.role === 'pemilik' && body.role !== undefined && body.role !== 'pemilik') {
		httpError(400, 'LAST_OWNER');
	}
	// Naikkan peran menjadi kasir wajib lolos kuota paket (selain kasir yang sudah ada).
	if (body.role === 'kasir' && member.role !== 'kasir') {
		await assertCashierQuota(ctx, db, 1);
	}

	const patch: Record<string, unknown> = {};
	if (body.role !== undefined) patch.role = body.role;
	if (body.name !== undefined) patch.full_name = String(body.name).trim();

	const { error: updateError } = await db.from('profiles').update(patch).eq('id', profileId);
	if (updateError) httpError(500, 'UPDATE_FAILED');

	return json({ ok: true });
});

/** DELETE /api/shop/members/[id] — keluarkan anggota dari toko (pemilik toko). */
shopService.delete('/members/:id', async (c) => {
	const ctx = await requireApiAuth(c);
	const profileId = c.req.param('id');

	if (ctx.shop.profileRole !== 'pemilik') {
		httpError(403, 'OWNER_ONLY');
	}
	if (profileId === ctx.user.id) {
		httpError(400, 'CANNOT_REMOVE_SELF');
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

	// Pemilik terakhir toko tidak boleh dihapus.
	if (member.role === 'pemilik') {
		const { count } = await db
			.from('profiles')
			.select('id', { count: 'exact', head: true })
			.eq('shop_id', ctx.shop.shopId)
			.eq('role', 'pemilik');
		if (Number(count ?? 0) <= 1) {
			httpError(400, 'LAST_OWNER');
		}
	}

	// Keluarkan anggota dari toko (akun tetap ada, tapi tak lagi punya akses toko ini).
	const { error: unlinkError } = await db.from('profiles').update({ shop_id: null }).eq('id', profileId);
	if (unlinkError) httpError(500, 'REMOVE_FAILED');

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
	const ip = clientIp(c.req.raw.headers);
	if (!rateLimit(`voucher:ip:${ip}`, 20, 60 * 60 * 1000)) httpError(429, 'VOUCHER_RATE_LIMITED');
	if (!rateLimit(`voucher:code:${ip}`, 5, 10 * 60 * 1000)) httpError(429, 'VOUCHER_RATE_LIMITED');

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