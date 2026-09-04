import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from './env.js';

/**
 * Midtrans — payment gateway Indonesia (Snap: QRIS, VA, e-wallet, kartu kredit, convenience store).
 *   - Snap (redirect): POST /snap/v1/transactions  → { token, redirect_url }
 *   - QRIS langsung:   POST /v1/charge (payment_type=qris) → actions.generate-qr-code (data URL PNG)
 *   - Cek status:      GET  /v2/{order_id}/status
 *   - Notifikasi:      POST ke notificationUrl, signature_key = HMAC-SHA512(serverKey, order_id+status_code+gross_amount)
 */

export const isMidtransConfigured = Boolean(env.MIDTRANS_SERVER_KEY && env.MIDTRANS_CLIENT_KEY);

const serverKey = env.MIDTRANS_SERVER_KEY ?? '';
const isProduction = env.MIDTRANS_ENV === 'production';
const apiBase = isProduction ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com';
const snapBase = isProduction ? 'https://app.midtrans.com' : 'https://app.sandbox.midtrans.com';

export class MidtransError extends Error {
	constructor(
		message: string,
		public httpStatus: number
	) {
		super(message);
	}
}

function authHeader(): string {
	return `Basic ${Buffer.from(`${serverKey}:`).toString('base64')}`;
}

async function midtransRequest<T>(url: string, body?: unknown, method: 'POST' | 'GET' = 'POST'): Promise<T> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 15_000);
	const res = await fetch(url, {
		method,
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json',
			Authorization: authHeader()
		},
		...(body !== undefined ? { body: JSON.stringify(body) } : {}),
		signal: controller.signal
	}).finally(() => clearTimeout(timer));

	const text = await res.text().catch(() => '');
	let json: unknown = null;
	try {
		json = JSON.parse(text);
	} catch {
		/* respons non-JSON */
	}

	if (!res.ok || json === null) {
		throw new MidtransError(`Midtrans ${url} HTTP ${res.status}: ${text.slice(0, 300)}`, res.status);
	}
	return json as T;
}

/** Waktu mulai berlaku Snap harus dalam zona WIB (+07:00). */
function wibStartTime(): string {
	return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 19).replace('T', ' ') + ' +0700';
}

/**
 * Buat pembayaran Snap — pelanggan memilih channel (QRIS/VA/e-wallet/kartu)
 * di halaman Midtrans, lalu di-redirect kembali.
 */
export async function createSnapTransaction(input: {
	orderId: string;
	amount: number;
	product: string;
	buyerName?: string;
	buyerEmail?: string;
	expiredMinutes?: number;
}): Promise<{ token: string; redirectUrl: string }> {
	const amount = Math.round(input.amount);
	const email = (input.buyerEmail ?? '').trim();
	const customerDetails: Record<string, unknown> = {
		first_name: (input.buyerName ?? 'Pelanggan').slice(0, 60)
	};
	// Midtrans menolak email kosong/format tidak valid — kirim hanya jika valid.
	if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		customerDetails.email = email.slice(0, 100);
	}
	const body: Record<string, unknown> = {
		transaction_details: { order_id: input.orderId, gross_amount: amount },
		item_details: [{ id: input.orderId, price: amount, quantity: 1, name: input.product.slice(0, 50) }],
		customer_details: customerDetails,
		expiry: {
			start_time: wibStartTime(),
			unit: 'minutes',
			duration: input.expiredMinutes ?? 30
		},
		credit_card: { secure: true }
	};

	const data = await midtransRequest<{ token?: string; redirect_url?: string; status_message?: string }>(`${snapBase}/snap/v1/transactions`, body);
	if (!data.token || !data.redirect_url) {
		throw new MidtransError(`Midtrans Snap gagal: ${data.status_message ?? 'tidak ada token'}`, 0);
	}
	return { token: data.token, redirectUrl: data.redirect_url };
}

/**
 * Charge QRIS langsung (tanpa Snap) — cocok untuk kasir: QR ditampilkan
 * di layar. Membutuhkan akun merchant dengan kanal QRIS aktif.
 */
export async function createQrisCharge(input: {
	orderId: string;
	amount: number;
	buyerName?: string;
	buyerEmail?: string;
}): Promise<{ transactionId: string; qrDataUrl: string }> {
	const amount = Math.round(input.amount);
	const email = (input.buyerEmail ?? '').trim();
	const customerDetails: Record<string, unknown> = {
		first_name: (input.buyerName ?? 'Pelanggan').slice(0, 60)
	};
	if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		customerDetails.email = email.slice(0, 100);
	}
	const body: Record<string, unknown> = {
		payment_type: 'qris',
		transaction_details: { order_id: input.orderId, gross_amount: amount },
		item_details: [{ id: input.orderId, price: amount, quantity: 1, name: 'Pembayaran posspace' }],
		customer_details: customerDetails,
		qris: { acquirer: 'gopay' }
	};

	const data = await midtransRequest<{ transaction_id?: string; actions?: { name?: string; url?: string }[]; status_message?: string }>(
		`${apiBase}/v1/charge`,
		body
	);
	const qrAction = (data.actions ?? []).find((a) => a.name === 'generate-qr-code');
	if (!data.transaction_id || !qrAction?.url) {
		throw new MidtransError(`Midtrans QRIS gagal: ${data.status_message ?? 'QR tidak tersedia'}`, 0);
	}
	return { transactionId: data.transaction_id, qrDataUrl: qrAction.url };
}

export type MidtransTxStatus = 'settlement' | 'capture' | 'pending' | 'expire' | 'cancel' | 'deny' | 'unknown';

/** Cek status transaksi Midtrans berdasarkan order_id. */
export async function checkMidtransStatus(orderId: string): Promise<{
	status: MidtransTxStatus;
	fraudStatus?: string;
	settlementTime?: string;
	grossAmount?: number;
	transactionId?: string;
}> {
	const data = await midtransRequest<{
		transaction_status?: string;
		fraud_status?: string;
		settlement_time?: string;
		gross_amount?: string;
		transaction_id?: string;
	}>(`${apiBase}/v2/${encodeURIComponent(orderId)}/status`, undefined, 'GET');

	return {
		status: (data.transaction_status as MidtransTxStatus) ?? 'unknown',
		fraudStatus: data.fraud_status,
		settlementTime: data.settlement_time,
		grossAmount: data.gross_amount ? Number(data.gross_amount) : undefined,
		transactionId: data.transaction_id
	};
}

/** Apakah transaksi sudah lunas (settlement / capture dengan fraud accepted). */
export function isMidtransPaid(status: MidtransTxStatus, fraudStatus?: string): boolean {
	if (status === 'settlement') return true;
	if (status === 'capture' && fraudStatus === 'accept') return true;
	return false;
}

/**
 * Verifikasi signature notifikasi Midtrans:
 * signature_key = HMAC-SHA512(serverKey, order_id + status_code + gross_amount)
 */
export function verifyNotificationSignature(body: Record<string, unknown>): boolean {
	const signatureKey = String(body.signature_key ?? '');
	const orderId = String(body.order_id ?? '');
	const statusCode = String(body.status_code ?? '');
	const grossAmount = String(body.gross_amount ?? '');
	if (!signatureKey || !serverKey || !orderId || !statusCode || !grossAmount) return false;

	const expected = createHmac('sha512', serverKey).update(`${orderId}${statusCode}${grossAmount}`).digest('hex');
	const a = Buffer.from(expected, 'hex');
	const b = Buffer.from(signatureKey, 'hex');
	return a.length === b.length && timingSafeEqual(a, b);
}