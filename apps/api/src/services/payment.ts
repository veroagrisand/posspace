import { Hono } from 'hono';
import { json, httpError } from '../http.js';
import { requireApiAuth, requireAuth } from '../guards.js';
import { service } from '../db.js';
import { isSupabaseConfigured } from '../env.js';
import { checkMayarStatus, isMayarConfigured, isMayarPaid, parseMayarWebhook } from '../mayar.js';
import { ALLOW_MOCK_PAYMENT } from '../mock.js';

/**
 * Service payment — Mayar untuk invoice langganan + mock (dev only).
 * Pembayaran QRIS di kasir TIDAK memakai gateway — dicatat langsung sebagai
 * metode pembayaran (QRIS statis milik toko) untuk laporan keuangan.
 */

export const paymentService = new Hono();

// ============ MAYAR (langganan) ============
/**
 * GET /api/payments/mayar/status?merchantOrderId=...
 * Polling status pembayaran invoice langganan: cek database dulu (diperbarui
 * webhook), lalu fallback ke API Mayar.
 */
paymentService.get('/mayar/status', async (c) => {
	const auth = await requireAuth(c);
	const merchantOrderId = c.req.query('merchantOrderId');
	if (!merchantOrderId) httpError(400, 'MISSING_ID');

	const { data: profile } = await auth.db
		.from('profiles')
		.select('shop_id')
		.eq('id', auth.user.id)
		.single();
	if (!profile?.shop_id) httpError(403, 'SHOP_REQUIRED');

	const db = service();
	const { data: invoice } = await db
		.from('invoices')
		.select('id, status, payment_ref, subscription_id, shop_id, billing_period, amount')
		.eq('merchant_order_id', merchantOrderId)
		.maybeSingle();
	if (!invoice || invoice.shop_id !== profile.shop_id) httpError(404, 'NOT_FOUND');

	if (invoice.status === 'paid') return json({ status: 'paid', alreadyPaid: true });

	// Fallback: tanya Mayar (payment_ref = transactionId Mayar).
	if (isMayarConfigured && invoice.payment_ref) {
		const result = await checkMayarStatus(invoice.payment_ref).catch(() => null);
		if (result && isMayarPaid(result.status) && invoice.status !== 'paid') {
			await activateInvoice(db, invoice, invoice.payment_ref, 'mayar');
			return json({ status: 'paid' });
		}
	}
	return json({ status: 'pending' });
});

/**
 * POST /api/payments/mayar/webhook — webhook Mayar (publik).
 * Payload: { event: 'payment.received', data: { transactionId, amount, ... } }.
 * Mayar tidak menyediakan signature — korelasi via transactionId lalu verifikasi
 * ulang nominal/status ke API Mayar. Idempoten.
 */
paymentService.post('/mayar/webhook', async (c) => {
	const raw = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return new Response('FAILED: invalid json', { status: 400 });
	}

	const parsed = parseMayarWebhook(raw);
	if (!parsed || !parsed.paid) {
		// Bukan pembayaran lunas — akui saja.
		return new Response('ok');
	}

	const db = service();
	const { data: invoice } = await db
		.from('invoices')
		.select('id, status, amount, subscription_id, billing_period, payment_ref')
		.eq('payment_ref', parsed.transactionId)
		.maybeSingle();

	if (!invoice || invoice.status === 'paid') return new Response('ok');

	// Verifikasi ulang ke API Mayar (status & nominal) sebelum aktivasi.
	const verified = await checkMayarStatus(parsed.transactionId).catch(() => null);
	if (!verified || !isMayarPaid(verified.status)) return new Response('ok');
	if (verified.amount != null && Math.abs(Number(verified.amount) - Number(invoice.amount ?? 0)) > 1) {
		return new Response('FAILED: amount mismatch', { status: 400 });
	}

	const result = await activateInvoice(db, invoice, parsed.transactionId, 'mayar');
	if (result?.error) return new Response(`FAILED: invoice update ${String((result.error as { message?: unknown })?.message ?? result.error)}`, { status: 500 });
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