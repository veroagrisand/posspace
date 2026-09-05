import { Hono } from 'hono';
import { json, httpError } from '../http.js';
import { requestOtp, verifyOtp, isOtpVerified, isEmailRegistered } from '../otp.js';
import { rateLimit, clientIp } from '../rateLimit.js';
import { service } from '../db.js';
import { isSupabaseConfigured } from '../env.js';
import { createShopSubscription } from '../subscription.js';

/**
 * Service auth — mikroservice terpisah:
 * - POST /api/auth/otp/request  → kirim kode OTP ke email (cooldown + rate limit)
 * - POST /api/auth/otp/verify   → verifikasi kode OTP
 * - POST /api/auth/register     → buat akun + toko + subscription pending
 */
export const authService = new Hono();

authService.post('/otp/request', async (c) => {
	const body = (await c.req.json().catch(() => ({}))) as { email?: string };
	const email = (body.email ?? '').trim().toLowerCase();
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) httpError(400, 'INVALID_EMAIL');

	const ip = clientIp(c.req.raw.headers);
	if (!rateLimit(`otp-req:email:${email}`, 5, 60 * 60 * 1000)) httpError(429, 'OTP_RATE_LIMITED');
	if (!rateLimit(`otp-req:ip:${ip}`, 10, 60 * 60 * 1000)) httpError(429, 'OTP_RATE_LIMITED');

	const registered = await isEmailRegistered(email).catch(() => null);
	if (registered === true) httpError(409, 'EMAIL_TAKEN');
	if (registered === null) httpError(503, 'AUTH_ADMIN_UNAVAILABLE');

	try {
		const result = await requestOtp(email);
		return json({ ok: true, ...result });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'OTP_FAILED';
		if (message === 'OTP_TOO_SOON') httpError(429, 'OTP_TOO_SOON');
		if (message === 'SMTP_NOT_CONFIGURED') httpError(503, 'SMTP_NOT_CONFIGURED');
		httpError(500, message);
	}
});

authService.post('/otp/verify', async (c) => {
	const body = (await c.req.json().catch(() => ({}))) as { email?: string; code?: string };
	const email = (body.email ?? '').trim().toLowerCase();
	const code = (body.code ?? '').trim();

	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) httpError(400, 'INVALID_EMAIL');
	if (!/^\d{6}$/.test(code)) httpError(400, 'INVALID_CODE');

	const ip = clientIp(c.req.raw.headers);
	if (!rateLimit(`otp-ver:email:${email}`, 15, 10 * 60 * 1000)) httpError(429, 'OTP_RATE_LIMITED');
	if (!rateLimit(`otp-ver:ip:${ip}`, 30, 60 * 60 * 1000)) httpError(429, 'OTP_RATE_LIMITED');

	try {
		await verifyOtp(email, code);
		return json({ ok: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'OTP_FAILED';
		if (message === 'OTP_MAX_ATTEMPTS') httpError(429, 'OTP_MAX_ATTEMPTS');
		httpError(400, 'OTP_INVALID_OR_EXPIRED');
	}
});

/**
 * POST /api/auth/register
 * Pendaftaran divalidasi OTP email (6 digit, 10 menit).
 * 1) Pastikan email sudah lolos verifikasi OTP dalam 10 menit terakhir
 * 2) buat user auth (server-side, email langsung aktif)
 * 3) buat toko + subscription PENDING + invoice pembayaran.
 */
authService.post('/register', async (c) => {
	if (!isSupabaseConfigured) httpError(503, 'PAYMENT_NOT_CONFIGURED');

	const body = (await c.req.json().catch(() => ({}))) as {
		email?: string;
		password?: string;
		confirmPassword?: string;
		fullName?: string;
		shopName?: string;
		planId?: string;
		billingPeriod?: string;
	};

	const email = (body.email ?? '').trim().toLowerCase();
	const password = body.password ?? '';
	const confirmPassword = body.confirmPassword ?? '';
	const fullName = (body.fullName ?? '').trim();
	const shopName = (body.shopName ?? '').trim();

	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) httpError(400, 'INVALID_EMAIL');
	if (password.length < 8) httpError(400, 'PASSWORD_TOO_SHORT');
	if (password !== confirmPassword) httpError(400, 'PASSWORD_MISMATCH');
	if (!fullName) httpError(400, 'NAME_REQUIRED');
	if (!shopName) httpError(400, 'SHOP_NAME_REQUIRED');

	const ip = clientIp(c.req.raw.headers);
	if (!rateLimit(`reg:ip:${ip}`, 10, 60 * 60 * 1000)) httpError(429, 'REGISTER_RATE_LIMITED');
	if (!rateLimit(`reg:email:${email}`, 5, 60 * 60 * 1000)) httpError(429, 'REGISTER_RATE_LIMITED');

	const verified = await isOtpVerified(email).catch(() => false);
	if (!verified) {
		httpError(400, 'OTP_EXPIRED');
	}

	const db = service();

	// Cek email terdaftar via admin API GoTrue (pencocokan persis).
	if (await isEmailRegistered(email).catch(() => true)) {
		httpError(409, 'EMAIL_TAKEN');
	}

	const { data: created, error: createError } = await db.auth.admin.createUser({
		email,
		password,
		email_confirm: true,
		user_metadata: { full_name: fullName, shop_name: shopName }
	});
	if (createError || !created?.user) {
		// GoTrue menolak email yang sudah dipakai (termasuk beda besar/kecil) —
		// jangan bocorkan sebagai 500; beri 409 EMAIL_TAKEN.
		const message = createError?.message ?? '';
		if (/already registered|already been registered|duplicate key|already exists|in use/i.test(message)) {
			httpError(409, 'EMAIL_TAKEN');
		}
		httpError(500, 'USER_CREATE_FAILED');
	}

	const result = await createShopSubscription({
		user: created.user,
		planId: body.planId ?? 'pro',
		billingPeriod: body.billingPeriod === 'annual' ? 'annual' : 'monthly',
		c
	});

	return json({ ok: true, ...result });
});