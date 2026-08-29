import { Hono } from 'hono';
import { json, httpError } from '../http.js';
import { requireApiAuth, requireAuth } from '../guards.js';
import { service } from '../db.js';
import { isSupabaseConfigured } from '../env.js';
import { createIpaymuPayment, checkIpaymuStatus, isIpaymuConfigured, verifyCallbackSignature } from '../ipaymu.js';
import { ALLOW_MOCK_PAYMENT } from '../mock.js';

/**
 * Service payment — iPaymu (VA, QRIS, e-wallet) + mock (dev only).
 * Callback webhook bersifat publik (verifikasi signature), sisanya wajib login.
 */
export const paymentService = new Hono();

// ============ IPAYMU ============
/**
 * POST /api/payments/ipaymu/invoice — buat pembayaran QRIS untuk transaksi POS.
 * Body: { transactionId }
 * Transaksi harus berstatus 'pending' dan milik toko yang sedang login.
 * Menyimpan SessionID (payment_gateway_ref) & instruksi pembayaran di transaksi.
 */
paymentService.post('/ipaymu/invoice', async (c) => {
	const ctx = await requireApiAuth(c);
	if (!isIpaymuConfigured) httpError(503, 'IPAYMU_NOT_CONFIGURED');

	const body = (await c.req.json().catch(() => ({}))) as { transactionId?: string };
	if (!body.transactionId) httpError(400, 'MISSING_TRANSACTION_ID');

	const { data: txn, error: txnError } = await ctx.db
		.from('transactions')
		.select('id, status, total_amount')
		.eq('id', body.transactionId)
		.eq('shop_id', ctx.shop.shopId)
		.maybeSingle();
	if (txnError || !txn) httpError(404, 'NOT_FOUND');
	if (txn.status === 'completed') httpError(409, 'ALREADY_PAID');
	if (txn.status !== 'pending') httpError(422, 'NOT_PENDING');

	const pay = await createIpaymuPayment({
		referenceId: txn.id,
		amount: Number(txn.total_amount),
		product: 'Pembayaran posspace',
		buyerName: ctx.shop.shopName,
		buyerEmail: ctx.user.email,
		// API menerima request internal dari SvelteKit, jadi gunakan host/protokol
		// asli yang diteruskan Nginx agar callback gateway tetap menuju HTTPS publik.
		notifyUrl: (() => {
			const requestUrl = new URL(c.req.url);
			const protocol = c.req.header('x-forwarded-proto')?.split(',')[0]?.trim() ?? requestUrl.protocol.replace(':', '');
			const host = c.req.header('x-forwarded-host') ?? c.req.header('host') ?? requestUrl.host;
			return `${protocol}://${host}/api/payments/ipaymu/callback`;
		})(),
		returnUrl: '',
		cancelUrl: '',
		paymentMethod: 'qris',
		expiredMinutes: 30
	});

	const { error: updateError } = await ctx.db
		.from('transactions')
		.update({
			payment_gateway_ref: pay.SessionID ?? null,
			qr_string: pay.QrString ?? null,
			payment_url: pay.Url ?? null,
			payment_channel: 'qris'
		})
		.eq('id', txn.id);
	if (updateError) httpError(500, 'UPDATE_FAILED');

	return json({
		ok: true,
		qrContent: pay.QrString ?? null,
		paymentUrl: pay.Url ?? null,
		referenceId: pay.SessionID ?? txn.id,
		expiresInMinutes: 30
	});
});

/**
 * GET /api/payments/ipaymu/status?merchantOrderId=... | transactionId=...
 * Polling status pembayaran: cek database dulu (diperbarui webhook),
 * lalu fallback ke API iPaymu (check transaction by referenceId).
 */
paymentService.get('/ipaymu/status', async (c) => {
	if (!isSupabaseConfigured) httpError(503, 'NOT_CONFIGURED');

	const auth = await requireAuth(c);
	const merchantOrderId = c.req.query('merchantOrderId');
	const transactionId = c.req.query('transactionId');

	const { data: profile } = await auth.db
		.from('profiles')
		.select('shop_id')
		.eq('id', auth.user.id)
		.single();
	if (!profile?.shop_id) httpError(403, 'SHOP_REQUIRED');

	const db = service();

	if (merchantOrderId) {
		const { data: invoice } = await db
			.from('invoices')
			.select('id, status, payment_ref, subscription_id, shop_id')
			.eq('merchant_order_id', merchantOrderId)
			.maybeSingle();
		if (!invoice || invoice.shop_id !== profile.shop_id) httpError(404, 'NOT_FOUND');

		if (invoice.status === 'paid') return json({ status: 'paid', alreadyPaid: true });

		// Fallback: tanya iPaymu (referensi = merchant order id)
		if (isIpaymuConfigured && invoice.payment_ref) {
			const result = await checkIpaymuStatus({ referenceId: merchantOrderId }).catch(() => null);
			if (result?.status === 'berhasil' && invoice.status !== 'paid') {
				await activateInvoice(db, invoice);
				return json({ status: 'paid' });
			}
		}
		return json({ status: 'pending' });
	}

	if (transactionId) {
		const { data: txn } = await db
			.from('transactions')
			.select('id, shop_id, status, payment_gateway_ref')
			.eq('id', transactionId)
			.maybeSingle();
		if (!txn || txn.shop_id !== profile.shop_id) httpError(404, 'NOT_FOUND');

		if (txn.status === 'completed') return json({ status: 'paid', alreadyPaid: true });

		if (isIpaymuConfigured && txn.payment_gateway_ref) {
			const result = await checkIpaymuStatus({ referenceId: txn.id }).catch(() => null);
			if (result?.status === 'berhasil' && txn.status !== 'completed') {
				const { data: owner } = await db
					.from('profiles')
					.select('id')
					.eq('shop_id', txn.shop_id)
					.eq('role', 'pemilik')
					.limit(1)
					.maybeSingle();
				if (owner) {
					await db.rpc('confirm_payment_as_owner', { p_transaction_id: txn.id, p_owner_id: owner.id });
				}
				return json({ status: 'paid' });
			}
		}
		return json({ status: 'pending' });
	}

	httpError(400, 'MISSING_ID');
});

/**
 * POST /api/payments/ipaymu/callback — webhook iPaymu (publik, verifikasi X-Signature).
 * Mendukung body x-www-form-urlencoded (default) maupun application/json.
 * reference_id = merchant_order_id (invoice) atau transaction id (POS).
 * Idempoten: callback ganda tidak menggandakan potongan stok / aktivasi.
 */
paymentService.post('/ipaymu/callback', async (c) => {
	const contentType = c.req.header('content-type') ?? '';
	const xSignature = c.req.header('x-signature') ?? '';

	let raw: Record<string, unknown>;
	if (contentType.includes('application/json')) {
		const jsonBody = await c.req.json().catch(() => null);
		if (!jsonBody || typeof jsonBody !== 'object' || Array.isArray(jsonBody)) {
			return new Response('FAILED: invalid json', { status: 400 });
		}
		raw = jsonBody as Record<string, unknown>;
	} else {
		const form = await c.req.formData();
		raw = {};
		for (const [key, value] of form.entries()) {
			raw[key] = String(value);
		}
	}

	if (!verifyCallbackSignature(raw, xSignature)) {
		return new Response('FAILED: invalid signature', { status: 400 });
	}

	const referenceId = String(raw.reference_id ?? raw.referenceId ?? '');
	const status = String(raw.status ?? '');
	if (!referenceId) {
		return new Response('FAILED: missing reference_id', { status: 400 });
	}
	if (status !== 'berhasil' && Number(raw.status_code) !== 1) {
		// Belum lunas — balas SUCCESS agar iPaymu tidak retry terus.
		return new Response('SUCCESS');
	}

	const db = service();

	// 1) Invoice langganan?
	const { data: invoice } = await db
		.from('invoices')
		.select('id, subscription_id, status')
		.eq('merchant_order_id', referenceId)
		.maybeSingle();

	if (invoice) {
		if (invoice.status === 'paid') return new Response('SUCCESS');

		const { error: invoiceError } = await db
			.from('invoices')
			.update({
				status: 'paid',
				paid_at: new Date().toISOString(),
				payment_ref: String(raw.sid ?? raw.trx_id ?? '') || undefined,
				payment_channel: String(raw.via ?? '') || undefined
			})
			.eq('id', invoice.id);
		if (invoiceError) return new Response('FAILED: invoice update', { status: 500 });

		const nowIso = new Date().toISOString();
		const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
		const { error: subError } = await db
			.from('subscriptions')
			.update({ status: 'active', period_start: nowIso, period_end: periodEnd })
			.eq('id', invoice.subscription_id);
		if (subError) return new Response('FAILED: subscription update', { status: 500 });

		return new Response('SUCCESS');
	}

	// 2) Transaksi POS (pending payment)?
	const { data: txn } = await db
		.from('transactions')
		.select('id, shop_id, status')
		.eq('id', referenceId)
		.maybeSingle();
	if (!txn || txn.status === 'completed') return new Response('SUCCESS');

	const { data: profile } = await db
		.from('profiles')
		.select('id')
		.eq('shop_id', txn.shop_id)
		.eq('role', 'pemilik')
		.limit(1)
		.maybeSingle();

	if (!profile) return new Response('FAILED: no owner', { status: 500 });

	const { error: confirmError } = await db.rpc('confirm_payment_as_owner', {
		p_transaction_id: txn.id,
		p_owner_id: profile.id
	});
	if (confirmError) return new Response(`FAILED: confirm ${confirmError.message}`, { status: 500 });

	return new Response('SUCCESS');
});

// ============ MOCK (DEV ONLY) ============
/** POST /api/payments/mock — simulasi pembayaran sukses (dev only). */
paymentService.post('/mock', async (c) => {
	if (!ALLOW_MOCK_PAYMENT) {
		httpError(403, 'MOCK_PAYMENT_DISABLED');
	}
	if (!isSupabaseConfigured) {
		httpError(503, 'NOT_CONFIGURED');
	}

	const auth = await requireAuth(c);

	const body = (await c.req.json().catch(() => ({}))) as { merchantOrderId?: string };
	if (!body.merchantOrderId) httpError(400, 'MISSING_ORDER_ID');

	// hanya bisa membayar invoice milik toko sendiri (diverifikasi eksplisit)
	const { data: profile } = await auth.db
		.from('profiles')
		.select('shop_id')
		.eq('id', auth.user.id)
		.single();

	const db = service();
	const { data: invoice } = await db
		.from('invoices')
		.select('id, subscription_id, status, shop_id')
		.eq('merchant_order_id', body.merchantOrderId)
		.single();

	if (!invoice || invoice.shop_id !== profile?.shop_id) {
		httpError(404, 'NOT_FOUND');
	}
	if (invoice.status === 'paid') {
		return json({ ok: true, alreadyPaid: true });
	}

	await db.from('invoices').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', invoice.id);

	const nowIso = new Date().toISOString();
	const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
	await db
		.from('subscriptions')
		.update({ status: 'active', period_start: nowIso, period_end: periodEnd })
		.eq('id', invoice.subscription_id);

	return json({ ok: true });
});

async function activateInvoice(db: ReturnType<typeof service>, invoice: { id: string; subscription_id: string }) {
	await db.from('invoices').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', invoice.id);
	const nowIso = new Date().toISOString();
	const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
	await db
		.from('subscriptions')
		.update({ status: 'active', period_start: nowIso, period_end: periodEnd })
		.eq('id', invoice.subscription_id);
}
