import type { Context, Next } from 'hono';
import { service, verifyUser } from './db.js';
import { HttpError } from './http.js';

/**
 * Middleware global:
 * 1) auth — baca Authorization: Bearer, verifikasi JWT (cache), simpan di context.
 * 2) accessLog — catat setiap request API ke access_logs (fire-and-forget).
 */

const SKIP_LOG_PATHS = new Set(['/health', '/favicon.ico']);

export async function auth(c: Context, next: Next) {
	const header = c.req.header('authorization') ?? '';
	const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
	c.set('accessToken', token || undefined);
	if (token) {
		// Sudah di-cache 60 dtk — murah, dan dipakai untuk atribusi access log.
		const user = await verifyUser(token).catch(() => null);
		c.set('userId', user?.id);
	}
	await next();
}

function clientIp(c: Context): string {
	const fwd = c.req.header('x-forwarded-for');
	if (fwd) return fwd.split(',')[0].trim();
	return c.req.header('x-real-ip') ?? '';
}

export async function accessLog(c: Context, next: Next) {
	const startedAt = performance.now();
	await next();
	const path = c.req.path;

	if (SKIP_LOG_PATHS.has(path) || /\.(png|jpg|jpeg|gif|svg|webp|ico|css|js|map|woff2?|ttf|txt|json|xml|webmanifest)$/i.test(path)) {
		return;
	}

	const token = c.get('accessToken') as string | undefined;
	const userId = c.get('userId') as string | undefined;

	void (async () => {
		try {
			const { error } = await service().rpc('log_access', {
				p_method: c.req.method,
				p_path: `${c.req.path}${c.req.url.includes('?') ? `?${c.req.url.split('?')[1]}` : ''}`,
				p_status: c.res.status,
				p_duration_ms: Math.round(performance.now() - startedAt),
				p_user_id: userId ?? null,
				p_ip: clientIp(c),
				p_user_agent: c.req.header('user-agent') ?? '',
				p_referer: c.req.header('referer') ?? '',
				p_error_msg: null
			});
			if (error) console.warn('[access-log] gagal menulis log:', error.message);
		} catch (e) {
			console.warn('[access-log] gagal menulis log:', e);
		}
	})();
}

/** Error handler terpusat — konsisten dengan format error() SvelteKit. */
export function onError(err: Error, c: Context): Response {
	if (err instanceof HttpError) {
		return Response.json({ message: err.code }, { status: err.status });
	}
	console.error('[api] unhandled error:', err);
	return Response.json({ message: 'INTERNAL_ERROR' }, { status: 500 });
}

export function notFound(c: Context): Response {
	return Response.json({ message: 'NOT_FOUND' }, { status: 404 });
}