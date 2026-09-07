import type { Context } from 'hono';
import { env } from './env.js';

/**
 * Host yang diizinkan untuk membangun URL publik (callback/return URL gateway,
 * tautan email). Daftar dipisahkan koma di env ALLOWED_HOSTS. Header
 * x-forwarded-host/host dari klien TIDAK dipercaya tanpa whitelist, karena bisa
 * dipakai menyuntikkan tautan phishing ke email yang berisi data sensitif.
 * Jika ALLOWED_HOSTS kosong, semua host ditolak kecuali localhost.
 */
const allowedHosts = new Set(
	(env.ALLOWED_HOSTS ?? '')
		.split(',')
		.map((h) => h.trim().toLowerCase().replace(/:\d+$/, ''))
		.filter(Boolean)
);

export function isHostAllowed(host: string): boolean {
	const normalized = host.toLowerCase().replace(/:\d+$/, '');
	if (allowedHosts.has('*')) return true;
	if (allowedHosts.size === 0) return normalized === 'localhost' || normalized === '127.0.0.1';
	return allowedHosts.has(normalized);
}

/** Public base URL aplikasi — hanya host yang lolos whitelist yang dipakai. */
export function publicBaseUrl(c: Context): string {
	const proto = c.req.header('x-forwarded-proto') ?? 'http';
	const forwarded = c.req.header('x-forwarded-host');
	const candidate = forwarded ? forwarded.split(',')[0].trim() : (c.req.header('host') ?? '');
	if (isHostAllowed(candidate)) return `${proto}//${candidate}`;
	const fallback = [...allowedHosts].find((h) => h !== '*');
	return fallback ? `https://${fallback}` : 'http://localhost';
}