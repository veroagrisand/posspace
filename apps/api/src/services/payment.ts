import { Hono } from 'hono';
import { json, httpError } from '../http.js';
import { requireApiAuth, requireAuth } from '../guards.js';
import { service } from '../db.js';
import { isSupabaseConfigured } from '../env.js';
import {
	createQrisCharge,
	createSnapTransaction,
	checkMidtransStatus,
	isMidtransConfigured,
	isMidtransPaid,
	MidtransError,
	MidtransTxStatus,
	verifyNotificationSignature
} from '../midtrans.js';
import { ALLOW_MOCK_PAYMENT } from '../mock.js';
import { publicBaseUrl } from '../url.js';

/**
 * Service payment — Midtrans (Snap untuk langganan, QRIS charge untuk kasir) + mock (dev only).
 * Notifikasi webhook bersifat publik (verifikasi signature key), sisanya wajib login.
 */
export const paymentService = new Hono();

// ============ MIDTRANS ============
/**
 * POST /api/payments/midtrans/invoice — buat pembayaran QRIS untuk transaksi POS.
 * Body: { transactionId }
 * Transaksi harus berstatus 'pending' dan milik toko yang sedang login.
 * QRIS langsung (charge) → QR tampil di layar; fallback Snap redirect jika QR tidak tersedia.
 */
paymentService.post('/midtrans/invoice', async (c) => {
	const ctx = await requireApiAuth(c);
	if (!isMidtransConfigured) httpError(503, 'MIDTRANS_NOT_CONFIGURED');

	const body = (await c.req.json().catch(() => ({}))) as { transactionId?: string };
	if (!body.transactionId) httpError(400, 'MISSING_TRANSACTION_ID');

	const { data: txn, error: txnError } = await ctx.db
		.from('transactions')
		.select('id, status, total_amount, qr_string, payment_url, payment_gateway_ref, payment_channel')
		.eq('id', body.transactionId)
		.eq('shop_id', ctx.shop.shopId)
		.maybeSingle();
	if (txnError || !txn) httpError(404, 'NOT_FOUND');
	if (txn.status === 'completed') httpError(409, 'ALREADY_PAID');
	if (txn.status !== 'pending') httpError(422, 'NOT_PENDING');

	// Instruksi pembayaran sudah pernah dibuat → kembalikan apa adanya (idempoten).
	if (txn.qr_string) {
		return json({ ok: true, qrContent: txn.qr_string, paymentUrl: null, referenceId: txn.payment_gateway_ref ?? txn.id, alreadyCreated: true });
	}
	if (txn.payment_url) {
		return json({ ok: true, qrContent: null, paymentUrl: txn.payment_url, referenceId: txn.id, alreadyCreated: true });
	}

	const amount = Number(txn.total_amount);
	let qrDataUrl: string | null = null;
	let paymentUrl: string | null = null;
	let gatewayRef: string | null = null;

	try {
		const qris = await createQrisCharge({
			orderId: txn.id,
			amount,
			buyerName: ctx.shop.shopName,
			buyerEmail: ctx.user.email
		});
		qrDataUrl = qris.qrDataUrl;
		gatewayRef = qris.transactionId;
	} catch (err) {
		if (err instanceof MidtransError && (err.httpStatus === 406 || err.httpStatus === 410)) {
			// Order id sudah pernah dipakai — cek status, jangan buat duplikat.
			const existing = await checkMidtransStatus(txn.id).catch(() => null);
			if (existing && isMidtransPaid(existing.status, existing.fraudStatus)) {
				await confirmDigitalTransaction(ctx.db, ctx.shop.shopId, txn.id);
				return json({ ok: true, status: 'paid', referenceId: existing.transactionId ?? txn.id });
			}
			httpError(409, 'MIDTRANS_ORDER_EXISTS');
		}
		// Fallback: Snap redirect (pelanggan pilih channel di halaman Midtrans).
		const snap = await createSnapTransaction({
			orderId: txn.id,
			amount,
			product: 'Pembayaran posspace',
			buyerName: ctx.shop.shopName,
			buyerEmail: ctx.user.email
		}).catch(() => null);
		if (!snap) httpError(502, 'MIDTRANS_UNAVAILABLE');
		paymentUrl = snap.redirectUrl;
	}

	const { error: updateError } = await ctx.db
		.from('transactions')
		.update({
			payment_gateway_ref: gatewayRef,
			qr_string: qrDataUrl,
			payment_url: paymentUrl,
			payment_channel: qrDataUrl ? 'qris' : paymentUrl ? 'midtrans' : null
		})
		.eq('id', txn.id);
	if (updateError) httpError(500, 'UPDATE_FAILED');

	return json({
		ok: true,
		qrContent: qrDataUrl,
		paymentUrl,
		referenceId: gatewayRef ?? txn.id,
		expiresInMinutes: 30
	});
});

/**
 * GET /api/payments/midtrans/status?merchantOrderId=... | transactionId=...
 * Polling status pembayaran: cek database dulu (diperbarui webhook),
 * lalu fallback ke API Midtrans (status by order_id).
 */
paymentService.get('/midtrans/status', async (c) => {
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
			.select('id, status, payment_ref, subscription_id, shop_id, billing_period')
			.eq('merchant_order_id', merchantOrderId)
			.maybeSingle();
		if (!invoice || invoice.shop_id !== profile.shop_id) httpError(404, 'NOT_FOUND');

		if (invoice.status === 'paid') return json({ status: 'paid', alreadyPaid: true });

		// Fallback: tanya Midtrans (order id = merchant order id)
		if (isMidtransConfigured) {
			const result = await checkMidtransStatus(merchantOrderId).catch(() => null);
			if (result && isMidtransPaid(result.status, result.fraudStatus) && invoice.status !== 'paid') {
				await activateInvoice(db, invoice, result.transactionId, undefined);
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

		if (isMidtransConfigured) {
			const result = await checkMidtransStatus(txn.id).catch(() => null);
			if (result && isMidtransPaid(result.status, result.fraudStatus) && txn.status !== 'completed') {
				await confirmDigitalTransaction(db, txn.shop_id, txn.id);
				return json({ status: 'paid' });
			}
		}
		return json({ status: 'pending' });
	}

	httpError(400, 'MISSING_ID');
});

/**
 * POST /api/payments/midtrans/notification — webhook Midtrans (publik, verifikasi signature_key).
 * Body JSON: { order_id, status_code, gross_amount, transaction_status, fraud_status, ... }.
 * order_id = merchant_order_id (invoice langganan) atau transaction id (POS).
 * Idempoten: notifikasi ganda tidak menggandakan potongan stok / aktivasi.
 */
paymentService.post('/midtrans/notification', async (c) => {
	const jsonBody = await c.req.json().catch(() => null);
	if (!jsonBody || typeof jsonBody !== 'object' || Array.isArray(jsonBody)) {
		return new Response('FAILED: invalid json', { status: 400 });
	}
	const raw = jsonBody as Record<string, unknown>;

	if (!verifyNotificationSignature(raw)) {
		return new Response('FAILED: invalid signature', { status: 400 });
	}

	const orderId = String(raw.order_id ?? '');
	const transactionStatus = String(raw.transaction_status ?? '');
	const fraudStatus = String(raw.fraud_status ?? '');
	if (!orderId) {
		return new Response('FAILED: missing order_id', { status: 400 });
	}

	// Belum lunas / batal / kedaluwarsa — akui agar Midtrans tidak retry terus.
	if (!isMidtransPaid(transactionStatus as MidtransTxStatus, fraudStatus)) {
		return new Response('ok');
	}

	const db = service();

	// 1) Invoice langganan?
	const { data: invoice } = await db
		.from('invoices')
		.select('id, subscription_id, status, billing_period')
		.eq('merchant_order_id', orderId)
		.maybeSingle();

	if (invoice) {
		if (invoice.status === 'paid') return new Response('ok');
		const result = await activateInvoice(db, invoice, String(raw.transaction_id ?? ''), String(raw.payment_type ?? ''));
		if (result?.error) return new Response(`FAILED: invoice update ${String((result.error as { message?: unknown })?.message ?? result.error)}`, { status: 500 });
		return new Response('ok');
	}

	// 2) Transaksi POS (pending payment)?
	const { data: txn } = await db
		.from('transactions')
		.select('id, shop_id, status')
		.eq('id', orderId)
		.maybeSingle();
	if (!txn || txn.status === 'completed') return new Response('ok');

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

	return new Response('ok');
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
		.select('id, subscription_id, status, shop_id, billing_period')
		.eq('merchant_order_id', body.merchantOrderId)
		.single();

	if (!invoice || invoice.shop_id !== profile?.shop_id) {
		httpError(404, 'NOT_FOUND');
	}
	if (invoice.status === 'paid') {
		return json({ ok: true, alreadyPaid: true });
	}

	await activateInvoice(db, invoice, undefined, 'mock');

	return json({ ok: true });
});

async function confirmDigitalTransaction(db: ReturnType<typeof service>, shopId: string, transactionId: string) {
	const { data: owner } = await db
		.from('profiles')
		.select('id')
		.eq('shop_id', shopId)
		.eq('role', 'pemilik')
		.limit(1)
		.maybeSingle();
	if (!owner) httpError(500, 'NO_OWNER');
	const { error: confirmError } = await db.rpc('confirm_payment_as_owner', {
		p_transaction_id: transactionId,
		p_owner_id: owner.id
	});
	if (confirmError) httpError(500, 'CONFIRM_FAILED');
}

/** Tandai invoice lunas + aktifkan subscription. Mengembalikan error Supabase bila ada. */
async function activateInvoice(
	db: ReturnType<typeof service>,
	invoice: { id: string; subscription_id: string; billing_period?: string },
	transactionId?: string,
	paymentChannel?: string
): Promise<{ error: unknown } | undefined> {
	const { error: invoiceError } = await db
		.from('invoices')
		.update({
			status: 'paid',
			paid_at: new Date().toISOString(),
			...(transactionId ? { payment_ref: transactionId } : {}),
			...(paymentChannel ? { payment_channel: paymentChannel } : {})
		})
		.eq('id', invoice.id);
	if (invoiceError) return { error: invoiceError };

	const nowIso = new Date().toISOString();
	const days = invoice.billing_period === 'annual' ? 365 : 30;
	const { error: subError } = await db
		.from('subscriptions')
		.update({ status: 'active', period_start: nowIso, period_end: new Date(Date.now() + days * 864e5).toISOString() })
		.eq('id', invoice.subscription_id);
	if (subError) return { error: subError };
	return undefined;
}