import type { Context } from 'hono';

/** Public base URL aplikasi (untuk callback/return URL gateway) — memakai host asli dari web. */
export function publicBaseUrl(c: Context): string {
	const forwarded = c.req.header('x-forwarded-host');
	if (forwarded) return `https://${forwarded.split(',')[0].trim()}`;
	const proto = c.req.header('x-forwarded-proto') ?? 'http';
	return `${proto}//${c.req.header('host') ?? 'localhost'}`;
}