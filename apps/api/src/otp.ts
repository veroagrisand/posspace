import { createHash, randomInt } from 'node:crypto';
import { env } from './env.js';
import { service } from './db.js';
import { sendMail, isSmtpConfigured } from './mail.js';

/**
 * OTP via email (Hostinger SMTP).
 * 6 digit, berlaku 10 menit, maksimal 5 percobaan, min. 60 detik antar kirim.
 * Simpan hanya hash — kode asli tidak pernah disimpan di database.
 */

const TTL_MS = Number(env.OTP_TTL_MINUTES ?? 10) * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;

export const ALLOW_OTP_DEBUG = env.ALLOW_OTP_DEBUG === 'true';

function codeHash(code: string, email: string): string {
	return createHash('sha256').update(`${code}:${email.toLowerCase()}`).digest('hex');
}

interface OtpRow {
	id: string;
	code_hash: string;
	expires_at: string;
	attempts: number;
	used: boolean;
}

/** Kirim OTP ke email. Melempar error ber-kode untuk ditangkap route. */
export async function requestOtp(email: string, purpose = 'register'): Promise<{ debugCode?: string }> {
	const db = service();
	const normalized = email.trim().toLowerCase();

	// Cooldown: jangan kirim ulang < 60 detik untuk email yang sama
	const { data: last } = await db
		.from('otp_codes')
		.select('created_at')
		.eq('email', normalized)
		.eq('purpose', purpose)
		.order('created_at', { ascending: false })
		.limit(1)
		.maybeSingle();
	if (last && Date.now() - Date.parse(last.created_at) < RESEND_COOLDOWN_MS) {
		throw new Error('OTP_TOO_SOON');
	}

	const code = String(randomInt(0, 1_000_000)).padStart(6, '0');

	const { error } = await db.from('otp_codes').insert({
		email: normalized,
		purpose,
		code_hash: codeHash(code, normalized),
		expires_at: new Date(Date.now() + TTL_MS).toISOString()
	});
	if (error) throw new Error('OTP_STORE_FAILED');

	if (!isSmtpConfigured) {
		if (ALLOW_OTP_DEBUG) return { debugCode: code };
		throw new Error('SMTP_NOT_CONFIGURED');
	}

	await sendMail({
		to: normalized,
		subject: 'Kode verifikasi posspace',
		html: `
			<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e7e9e4;border-radius:16px">
				<h2 style="color:#1c2721;margin:0 0 8px">Kode verifikasi posspace</h2>
				<p style="color:#4f5e55;font-size:14px;line-height:1.6">Gunakan kode berikut untuk menyelesaikan pendaftaran. Kode berlaku
					<strong>${Math.round(TTL_MS / 60_000)} menit</strong>.</p>
				<div style="font-size:30px;font-weight:700;letter-spacing:8px;color:#1c2721;background:#f5f5f1;border-radius:12px;padding:18px;text-align:center;margin:16px 0">${code}</div>
				<p style="color:#849088;font-size:12px">Jika Anda tidak meminta kode ini, abaikan email ini. — posspace</p>
			</div>
		`,
		text: `Kode verifikasi posspace: ${code} (berlaku ${Math.round(TTL_MS / 60_000)} menit)`
	});

	return {};
}

/**
 * Verifikasi OTP: cocokkan hash, cek masa berlaku & percobaan.
 * Sukses → tandai verified; kode yang sama tidak bisa dipakai ulang.
 */
export async function verifyOtp(email: string, code: string, purpose = 'register'): Promise<boolean> {
	const db = service();
	const normalized = email.trim().toLowerCase();

	const { data: rows } = await db
		.from('otp_codes')
		.select('id, code_hash, expires_at, attempts, used')
		.eq('email', normalized)
		.eq('purpose', purpose)
		.eq('used', false)
		.order('created_at', { ascending: false })
		.limit(5);

	const candidate = (rows ?? []).find((r: OtpRow) => !r.used && Date.parse(r.expires_at) > Date.now());

	if (!candidate) throw new Error('OTP_INVALID_OR_EXPIRED');
	if (candidate.attempts >= MAX_ATTEMPTS) throw new Error('OTP_MAX_ATTEMPTS');

	const valid = candidate.code_hash === codeHash(code, normalized);
	if (!valid) {
		await db.from('otp_codes').update({ attempts: candidate.attempts + 1 }).eq('id', candidate.id);
		throw new Error('OTP_INVALID_OR_EXPIRED');
	}

	await db.from('otp_codes').update({ used: true, verified_at: new Date().toISOString() }).eq('id', candidate.id);
	return true;
}

/** Cek bahwa email sudah lolos verifikasi OTP dalam 10 menit terakhir. */
export async function isOtpVerified(email: string, purpose = 'register'): Promise<boolean> {
	const db = service();
	const normalized = email.trim().toLowerCase();

	const { data } = await db
		.from('otp_codes')
		.select('verified_at')
		.eq('email', normalized)
		.eq('purpose', purpose)
		.eq('used', true)
		.order('verified_at', { ascending: false })
		.limit(1)
		.maybeSingle();

	return Boolean(data?.verified_at && Date.now() - Date.parse(data.verified_at) < TTL_MS);
}

/**
 * Cek email sudah terdaftar di Supabase Auth (admin API GoTrue).
 * Tidak memakai parameter `filter` (case-sensitive/substring di sebagian
 * versi GoTrue) — enumerasi user lalu cocokkan persis, abaikan besar/kecil.
 */
export async function isEmailRegistered(email: string): Promise<boolean> {
	const needle = email.trim().toLowerCase();
	let page = 1;
	while (true) {
		const { data, error } = await service().auth.admin.listUsers({ page, perPage: 200 });
		if (error) throw new Error(`AUTH_ADMIN_UNAVAILABLE: ${error.message}`);
		for (const u of data?.users ?? []) {
			if ((u.email ?? '').toLowerCase() === needle) return true;
		}
		if ((data?.users?.length ?? 0) === 0 || page * 200 >= (data?.total ?? 0)) break;
		page += 1;
	}
	return false;
}