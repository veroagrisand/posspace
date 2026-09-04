import type { Context } from 'hono';
import { env } from './env.js';
import { service } from './db.js';
import { httpError } from './http.js';
import { createSnapTransaction, isMidtransConfigured } from './midtrans.js';
import { ALLOW_MOCK_PAYMENT } from './mock.js';

/** Bentuk minimal user yang dibutuhkan createShopSubscription. */
export interface SubUser {
	id: string;
	email?: string;
	user_metadata?: { full_name?: string; shop_name?: string };
}

/**
 * Interim tanpa gateway: toko dibuat dengan subscription PENDING.
 * Aktivasi manual HANYA dilakukan oleh platform admin lewat dashboard
 * superadmin (/admin/subscriptions) — pemilik toko TIDAK bisa mengaktifkan sendiri.
 * WAJIB false setelah gateway (Midtrans) aktif di produksi.
 */
export const ALLOW_MANUAL_ACTIVATION = env.ALLOW_MANUAL_ACTIVATION === 'true';

export interface ShopSubscriptionResult {
	invoiceId: string;
	merchantOrderId: string;
	paymentUrl?: string;
	gateway?: 'midtrans' | 'mock' | 'manual';
	mock?: boolean;
	manual?: boolean;
}

/**
 * Alur "setiap toko wajib berlangganan dulu":
 * buat toko → kaitkan profil pemilik → subscription PENDING → invoice Midtrans Snap (redirect).
 */
export async function createShopSubscription(input: {
	user: SubUser;
	planId: string;
	billingPeriod: 'monthly' | 'annual';
	c: Context;
}): Promise<ShopSubscriptionResult> {
	const planId = input.planId;
	if (!['starter', 'pro', 'tumbuh'].includes(planId)) {
		httpError(400, 'INVALID_PLAN');
	}

	const db = service();

	// Profil yang sudah punya toko tidak boleh buat lagi
	const { data: profile } = await db
		.from('profiles')
		.select('shop_id, role')
		.eq('id', input.user.id)
		.single();
	if (profile?.shop_id) {
		httpError(409, 'SHOP_ALREADY_EXISTS');
	}

	const shopName = (input.user.user_metadata?.shop_name as string) || `${input.user.email?.split('@')[0]} Coffee`;

	const { data: shop, error: shopError } = await db.from('shops').insert({ name: shopName }).select('id').single();
	if (shopError || !shop) httpError(500, 'SHOP_CREATE_FAILED');

	const { error: profileError } = await db
		.from('profiles')
		.update({ shop_id: shop.id, role: 'pemilik' })
		.eq('id', input.user.id);
	if (profileError) httpError(500, 'PROFILE_LINK_FAILED');

	const { data: plan } = await db.from('plans').select('*').eq('id', planId).single();
	if (!plan) httpError(500, 'PLAN_NOT_FOUND');
	const amount = input.billingPeriod === 'annual' ? plan.annual_price : plan.monthly_price;

	const { data: subscription, error: subError } = await db
		.from('subscriptions')
		.insert({ shop_id: shop.id, plan_id: planId, status: 'pending' })
		.select('id')
		.single();
	if (subError || !subscription) httpError(500, 'SUBSCRIPTION_CREATE_FAILED');

	const merchantOrderId = `PS-SUB-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
	const { data: invoice, error: invoiceError } = await db
		.from('invoices')
		.insert({
			subscription_id: subscription.id,
			shop_id: shop.id,
			plan_id: planId,
			amount,
			billing_period: input.billingPeriod,
			merchant_order_id: merchantOrderId,
			status: 'pending'
		})
		.select('id')
		.single();
	if (invoiceError || !invoice) httpError(500, 'INVOICE_CREATE_FAILED');

	if (isMidtransConfigured) {
		// Midtrans Snap — pelanggan memilih channel (QRIS/VA/e-wallet/kartu) di halaman Midtrans.
		const snap = await createSnapTransaction({
			orderId: merchantOrderId,
			amount: Number(amount),
			product: `Langganan posspace ${plan.name} (${input.billingPeriod})`,
			buyerName: (input.user.user_metadata?.full_name as string) || 'Pelanggan',
			buyerEmail: input.user.email ?? '',
			expiredMinutes: 30
		});

		await db
			.from('invoices')
			.update({
				payment_url: snap.redirectUrl,
				payment_ref: null,
				payment_channel: 'midtrans'
			})
			.eq('id', invoice.id);

		return { invoiceId: invoice.id, merchantOrderId, paymentUrl: snap.redirectUrl, gateway: 'midtrans' };
	}

	if (ALLOW_MOCK_PAYMENT) {
		return { invoiceId: invoice.id, merchantOrderId, mock: true, gateway: 'mock' };
	}

	if (ALLOW_MANUAL_ACTIVATION) {
		return { invoiceId: invoice.id, merchantOrderId, manual: true, gateway: 'manual' };
	}

	httpError(503, 'PAYMENT_NOT_CONFIGURED');
}

export interface VoucherRedeemResult {
	invoiceId: string;
	merchantOrderId: string;
	originalAmount: number;
	amount: number;
	discount: number;
	voucherCode: string;
	paymentUrl?: string | null;
	gateway: string;
}

/**
 * Pakai voucher diskon untuk invoice PENDING milik toko.
 * Menghitung diskon (persen/fixed), memperbarui invoice, lalu membuat ulang
 * instruksi pembayaran Midtrans Snap dengan nominal baru. Melempar error ber-kode.
 */
export async function redeemVoucherToPendingInvoice(input: {
	shopId: string;
	code: string;
	c: Context;
}): Promise<VoucherRedeemResult> {
	const db = service();
	const code = input.code.trim().toUpperCase();

	const { data: voucher } = await db.from('vouchers').select('*').eq('code', code).maybeSingle();
	if (!voucher) throw new Error('VOUCHER_NOT_FOUND');
	if (!voucher.is_active) throw new Error('VOUCHER_INACTIVE');
	if (voucher.valid_from && Date.parse(voucher.valid_from) > Date.now()) throw new Error('VOUCHER_NOT_YET_VALID');
	if (voucher.valid_until && Date.parse(voucher.valid_until) < Date.now()) throw new Error('VOUCHER_EXPIRED');
	if (voucher.max_uses > 0 && Number(voucher.used_count) >= Number(voucher.max_uses)) throw new Error('VOUCHER_USED_UP');

	const { data: invoice } = await db
		.from('invoices')
		.select('id, amount, discount_amount, voucher_id, merchant_order_id, payment_url, status')
		.eq('shop_id', input.shopId)
		.eq('status', 'pending')
		.order('created_at', { ascending: false })
		.limit(1)
		.single();

	if (!invoice) throw new Error('NO_PENDING_INVOICE');
	if (invoice.voucher_id) throw new Error('VOUCHER_ALREADY_APPLIED');

	const original = Number(invoice.amount ?? 0);
	const discount =
		voucher.type === 'percent'
			? Math.round((original * Number(voucher.value)) / 100)
			: Math.min(Number(voucher.value), original);
	if (discount <= 0) throw new Error('VOUCHER_NO_DISCOUNT');
	const amount = original - discount;

	// Regenerasi instruksi pembayaran Midtrans Snap dengan nominal baru (jika gateway aktif).
	let paymentUrl: string | null = null;
	let gateway = 'manual';

	if (isMidtransConfigured) {
		const snap = await createSnapTransaction({
			orderId: invoice.merchant_order_id,
			amount,
			product: 'Langganan posspace (diskon voucher)',
			buyerName: 'Pelanggan posspace',
			expiredMinutes: 30
		}).catch(() => null);
		if (!snap) throw new Error('PAYMENT_REGENERATE_FAILED');
		paymentUrl = snap.redirectUrl;
		gateway = 'midtrans';
	}

	const { error: updateError } = await db
		.from('invoices')
		.update({
			amount,
			discount_amount: discount,
			voucher_id: voucher.id,
			payment_url: paymentUrl,
			payment_ref: null,
			payment_channel: gateway === 'midtrans' ? 'midtrans' : null
		})
		.eq('id', invoice.id);

	if (updateError) throw new Error('INVOICE_UPDATE_FAILED');

	// Klaim kuota voucher secara atomik (CAS): jika dua permintaan memakai
	// voucher yang sama bersamaan, hanya satu yang berhasil meng-increment.
	if (voucher.max_uses > 0) {
		const { data: claimed } = await db
			.from('vouchers')
			.update({ used_count: Number(voucher.used_count) + 1 })
			.eq('id', voucher.id)
			.eq('used_count', Number(voucher.used_count))
			.select('id')
			.maybeSingle();
		if (!claimed) throw new Error('VOUCHER_USED_UP');
	} else {
		await db.from('vouchers').update({ used_count: Number(voucher.used_count) + 1 }).eq('id', voucher.id);
	}

	return {
		invoiceId: invoice.id,
		merchantOrderId: invoice.merchant_order_id,
		originalAmount: original,
		amount,
		discount,
		voucherCode: code,
		paymentUrl,
		gateway
	};
}