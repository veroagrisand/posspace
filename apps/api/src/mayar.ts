import { env } from './env.js';

/**
 * Mayar.id — payment gateway Indonesia (QRIS, VA, e-wallet, outlet).
 *   - Buat pembayaran:  POST /hl/v2/payments/create → { data: { id, transactionId, link } }
 *   - Detail transaksi: GET  /hl/v2/transactions/{id}      → { data: { status: 'paid'|'created'|'expired'|... } }
 *   - Webhook:          POST event payment.received → { event, data: { transactionId, amount, ... } }
 * Sandbox: api.mayar.io  |  Produksi: api.mayar.id
 */

export const isMayarConfigured = Boolean(env.MAYAR_TOKEN);

const mayarToken = env.MAYAR_TOKEN ?? '';
const isProduction = env.MAYAR_ENV !== 'sandbox';
const apiBase = isProduction ? 'https://api.mayar.id/hl/v2' : 'https://api.mayar.io/hl/v2';

export class MayarError extends Error {
	constructor(
		message: string,
		public httpStatus: number
	) {
		super(message);
	}
}

async function mayarRequest<T>(path: string, body?: unknown, method: 'POST' | 'GET' = 'POST'): Promise<T> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 15_000);
	const res = await fetch(`${apiBase}${path}`, {
		method,
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json',
			Authorization: `Bearer ${mayarToken}`
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

	if ((res.status < 200 || res.status >= 300) || json === null) {
		throw new MayarError(`Mayar ${path} HTTP ${res.status}: ${text.slice(0, 300)}`, res.status);
	}
	return json as T;
}

/**
 * Buat permintaan pembayaran Mayar. Pelanggan memilih channel
 * (QRIS/VA/e-wallet) di halaman Mayar, lalu di-redirect kembali.
 */
export async function createMayarPayment(input: {
	orderId: string;
	amount: number;
	product: string;
	buyerName?: string;
	buyerEmail?: string;
	expiredMinutes?: number;
}): Promise<{ transactionId: string; paymentUrl: string }> {
	const amount = Math.round(input.amount);
	const expiredAt = new Date(Date.now() + (input.expiredMinutes ?? 30) * 60_000).toISOString();
	const body: Record<string, unknown> = {
		name: input.product.slice(0, 100),
		amount,
		description: `Langganan posspace ${input.orderId}`,
		expiredAt,
		// Bawa order_id kita agar webhook/status bisa dikorelasikan.
		extraData: { orderId: input.orderId }
	};
	const email = (input.buyerEmail ?? '').trim();
	if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) body.email = email.slice(0, 100);

	const json = await mayarRequest<{ data?: { id?: string; transactionId?: string; link?: string } }>('/payments/create', body);
	const transactionId = json?.data?.transactionId ?? json?.data?.id ?? '';
	const paymentUrl = json?.data?.link ?? '';
	if (!transactionId || !paymentUrl) {
		throw new MayarError('Mayar create payment gagal: tidak ada transactionId/link', 0);
	}
	return { transactionId, paymentUrl };
}

export type MayarTxStatus = 'paid' | 'settled' | 'created' | 'expired' | 'unpaid' | 'unknown';

/** Cek status transaksi Mayar berdasarkan transactionId. */
export async function checkMayarStatus(transactionId: string): Promise<{
	status: MayarTxStatus;
	amount?: number;
}> {
	const json = await mayarRequest<{ data?: { status?: string; amount?: number } }>(
		`/transactions/${encodeURIComponent(transactionId)}`,
		undefined,
		'GET'
	);
	return {
		status: (json?.data?.status as MayarTxStatus) ?? 'unknown',
		amount: json?.data?.amount
	};
}

/** Apakah transaksi sudah lunas. */
export function isMayarPaid(status: string): boolean {
	return status === 'paid' || status === 'settled';
}

/**
 * Ambil informasi dari payload webhook Mayar (event payment.received).
 * Mayar.id tidak menyediakan signature — korelasi via transactionId + cek nominal.
 */
export function parseMayarWebhook(raw: Record<string, unknown>): {
	event: string;
	transactionId: string;
	amount?: number;
	status?: string;
	paid: boolean;
} | null {
	const data = (raw.data ?? {}) as Record<string, unknown>;
	const event = String(raw.event ?? '');
	const transactionId = String(data.transactionId ?? data.id ?? '').trim();
	if (!transactionId) return null;

	const amount = data.amount != null ? Number(data.amount) : undefined;
	const status = String(data.transactionStatus ?? '').trim() || (data.status === true ? 'paid' : '');
	const paid = isMayarPaid(status) || data.status === true;
	return { event, transactionId, amount, status: status || undefined, paid };
}