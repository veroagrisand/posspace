import { Hono } from 'hono';
import { json, httpError } from '../http.js';
import { requireApiAuth, requireAuth } from '../guards.js';
import { service } from '../db.js';
import { createShopSubscription, payPendingInvoice, redeemVoucherToPendingInvoice } from '../subscription.js';
import { sendMail, isSmtpConfigured } from '../mail.js';
import { publicBaseUrl } from '../url.js';

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
	const tempPassword = `PS-${Math.random().toString(36).slice(2, 10)}`;

	const { data: created, error: createError } = await db.auth.admin.createUser({
		email: body.email.trim(),
		password: tempPassword,
		// email_confirm sengaja TIDAK di-set true → anggota wajib verifikasi email
		// (klik tautan konfirmasi dari Supabase) sebelum bisa login. Membutuhkan
		// SMTP Supabase terkonfigurasi di dashboard.
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

	// Kirim email aktivasi ke anggota: berisi password sementara + langkah.
	// Verifikasi email tetap wajib (Supabase mengirim tautan konfirmasi terpisah).
	const email = body.email.trim();
	const roleLabel = body.role === 'pemilik' ? 'Pemilik / Manajer' : body.role === 'admin_gudang' ? 'Admin Gudang' : 'Kasir / Barista';
	const loginUrl = `${publicBaseUrl(c)}/login`;
	let emailSent = false;
	if (isSmtpConfigured) {
		try {
			await sendMail({
				to: email,
				subject: `Aktivasi akun posspace — ${ctx.shop.shopName}`,
				html: `
					<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #e7e9e4;border-radius:16px">
						<h2 style="color:#1c2721;margin:0 0 8px">Selamat datang di ${escapeHtml(ctx.shop.shopName)}</h2>
						<p style="color:#4f5e55;font-size:14px;line-height:1.6">Akun posspace Anda telah dibuat oleh pemilik toko dengan peran <strong>${roleLabel}</strong>.</p>
						<div style="background:#f5f5f1;border-radius:12px;padding:16px;margin:16px 0">
							<p style="color:#718078;font-size:12px;margin:0 0 6px">Password sementara Anda:</p>
							<div style="font-size:24px;font-weight:700;letter-spacing:2px;color:#1c2721">${tempPassword}</div>
						</div>
						<ol style="color:#4f5e55;font-size:13px;line-height:1.8;margin:0 0 16px;padding-left:20px">
							<li>Klik tautan konfirmasi email yang dikirim Supabase (judul: "Confirm your email") untuk memverifikasi alamat email Anda.</li>
							<li>Login di <a href="${loginUrl}" style="color:#d29a3b;font-weight:700">${loginUrl}</a> menggunakan email &amp; password sementara di atas.</li>
							<li>Segera ganti password melalui "Lupa kata sandi?" di halaman login.</li>
						</ol>
						<p style="color:#849088;font-size:12px">Jangan bagikan password ini kepada siapa pun. — posspace</p>
					</div>
				`,
				text: `Akun posspace untuk ${ctx.shop.shopName} telah dibuat (peran: ${roleLabel}).\nPassword sementara: ${tempPassword}\n1) Klik tautan konfirmasi email dari Supabase.\n2) Login di ${loginUrl} dengan email & password di atas.\n3) Ganti password setelah masuk.`
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