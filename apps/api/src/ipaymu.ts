import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { env } from './env.js';

/**
 * iPaymu — payment gateway Indonesia (VA, QRIS, e-wallet, convenience store, COD).
 * API v2: signature HMAC-SHA256, header va/signature/timestamp.
 *   - Buat pembayaran:  POST /api/v2/payment        (redirect ke halaman iPaymu)
 *                       POST /api/v2/payment/direct (channel tertentu, mis. qris)
 *   - Cek transaksi:    POST /api/v2/transaction
 *   - Callback:         POST ke notifyUrl (form-urlencoded / JSON) + verifikasi X-Signature
 */

export const isIpaymuConfigured = Boolean(env.IPAYMU_VA && env.IPAYMU_API_KEY);

const va = env.IPAYMU_VA ?? '';
const apiKey = env.IPAYMU_API_KEY ?? '';
const baseUrl = (env.IPAYMU_BASE_URL ?? 'https://sandbox.ipaymu.com').replace(/\/+$/, '');

function timestamp(): string {
	const d = new Date();
	const p = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function sign(body: Record<string, unknown>): string {
	// StringToSign = METHOD:VA:SHA256(jsonBody):APIKey → Signature = HMAC-SHA256(StringToSign, APIKey)
	const jsonBody = JSON.stringify(body);
	const bodyHash = createHash('sha256').update(jsonBody).digest('hex').toLowerCase();
	const stringToSign = `POST:${va}:${bodyHash}:${apiKey}`;
	return createHmac('sha256', apiKey).update(stringToSign).digest('hex').toLowerCase();
}

async function ipaymuRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
	const res = await fetch(`${baseUrl}${path}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json',
			va,
			signature: sign(body),
			timestamp: timestamp()
		},
		body: JSON.stringify(body)
	});

	const text = await res.text().catch(() => '');
	if (!res.ok) {
		throw new Error(`iPaymu ${path} HTTP ${res.status}: ${text.slice(0, 300)}`);
	}

	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		throw new Error(`iPaymu ${path} invalid json: ${text.slice(0, 300)}`);
	}

	const data = json as { Status?: number | string; Message?: string; Data?: unknown };
	if (String(data.Status) !== '200') {
		throw new Error(`iPaymu ${path} ${data.Message ?? 'error'}: ${text.slice(0, 300)}`);
	}
	return data.Data as T;
}

export interface IpaymuPaymentData {
	SessionID: string;
	Url?: string;
	QrString?: string;
	PaymentNo?: string;
	PaymentMethod?: string;
	PaymentName?: string;
	TransactionId?: number;
	[_: string]: unknown;
}

/**
 * Buat pembayaran iPaymu.
 * Jika paymentMethod diberikan (mis. 'qris') → direct; selain itu redirect
 * (pelanggan memilih channel di halaman iPaymu).
 */
export async function createIpaymuPayment(input: {
	referenceId: string;
	amount: number;
	product: string;
	buyerName?: string;
	buyerEmail?: string;
	buyerPhone?: string;
	notifyUrl: string;
	returnUrl: string;
	cancelUrl: string;
	paymentMethod?: string;
	expiredMinutes?: number;
}): Promise<IpaymuPaymentData> {
	const body: Record<string, unknown> = {
		product: [input.product],
		qty: ['1'],
		price: [String(Math.round(input.amount))],
		returnUrl: input.returnUrl,
		cancelUrl: input.cancelUrl,
		notifyUrl: input.notifyUrl,
		referenceId: input.referenceId,
		buyerName: input.buyerName ?? 'Pelanggan posspace',
		buyerEmail: input.buyerEmail ?? '',
		buyerPhone: input.buyerPhone ?? ''
	};
	if (input.paymentMethod) body.paymentMethod = input.paymentMethod;
	if (input.expiredMinutes) body.expiredTime = String(input.expiredMinutes);

	const path = input.paymentMethod ? '/api/v2/payment/direct' : '/api/v2/payment';
	return ipaymuRequest<IpaymuPaymentData>(path, body);
}

export type IpaymuTxStatus = 'berhasil' | 'pending' | 'expired' | 'unknown';

/** Cek status transaksi di iPaymu (by iPaymu TransactionId atau referenceId kita). */
export async function checkIpaymuStatus(input: { transactionId?: string; referenceId?: string }): Promise<{
	status: IpaymuTxStatus;
	transactionId?: number;
	referenceId?: string;
	paidAt?: string;
}> {
	const body: Record<string, unknown> = {};
	if (input.transactionId) body.transactionId = String(input.transactionId);
	else if (input.referenceId) body.referenceId = input.referenceId;
	else return { status: 'unknown' };

	const data = await ipaymuRequest<{
		transactionId?: number;
		referenceId?: string;
		status?: string;
		statusDesc?: string;
		successDate?: string;
		[_: string]: unknown;
	}>('/api/v2/transaction', body);

	const status: IpaymuTxStatus =
		data.status === 'berhasil' ? 'berhasil' : data.status === 'expired' ? 'expired' : data.status === 'pending' ? 'pending' : 'unknown';

	return {
		status,
		transactionId: data.transactionId,
		referenceId: data.referenceId,
		paidAt: data.successDate
	};
}

/**
 * Verifikasi signature callback iPaymu (HMAC-SHA256, secret = VA merchant).
 * Flow: normalisasi tipe data → urutkan key A-Z (localeCompare) →
 * JSON.stringify dengan escape slash → HMAC-SHA256 dengan secret VA.
 */
export function verifyCallbackSignature(raw: Record<string, unknown>, xSignature: string | undefined): boolean {
	if (!xSignature || !va) return false;

	function normalize(v: unknown, key: string): unknown {
		if (v === '[]' && key === 'additional_info') return [];
		if (['trx_id', 'status_code', 'transaction_status_code', 'paid_off'].includes(key) && v !== null && v !== undefined) {
			return Number(v);
		}
		if (v === 'true') return true;
		if (v === 'false') return false;
		return String(v);
	}

	const normalized: Record<string, unknown> = {};
	for (const key of Object.keys(raw)) {
		if (key === 'signature') continue;
		normalized[key] = normalize(raw[key], key);
	}
	if (!('additional_info' in normalized)) normalized.additional_info = [];

	const sorted: Record<string, unknown> = {};
	for (const key of Object.keys(normalized).sort((a, b) => a.localeCompare(b))) {
		sorted[key] = normalized[key];
	}

	let jsonBody = JSON.stringify(sorted);
	jsonBody = jsonBody.replace(/\//g, '\\/');

	const expected = createHmac('sha256', va).update(jsonBody).digest('hex');
	const a = Buffer.from(expected, 'hex');
	const b = Buffer.from(xSignature, 'hex');
	return a.length === b.length && timingSafeEqual(a, b);
}