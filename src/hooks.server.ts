import { createServiceClient, createSsbSupabase, isSupabaseConfigured } from '$lib/server/supabase';
import type { Handle, RequestEvent } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

const isProd = env.NODE_ENV === 'production';
const serviceDb = isSupabaseConfigured ? createServiceClient() : null;

/** CSP pragmatis: tetap mengizinkan gaya inline (SvelteKit) + koneksi Supabase/Realtime/Midtrans. */
function buildCsp(): string {
	const supabaseUrl = (publicEnv.PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
	const supabaseWs = supabaseUrl.replace(/^https?/, 'wss');
	const midtrans = (env.MIDTRANS_ENV === 'production' ? 'https://app.midtrans.com' : 'https://app.sandbox.midtrans.com').replace(/\/$/, '');
	const midtransApi = (env.MIDTRANS_ENV === 'production' ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com').replace(/\/$/, '');
	const connect = [
		"'self'",
		supabaseUrl,
		supabaseWs,
		midtrans,
		midtransApi
	]
		.filter(Boolean)
		.join(' ');

	return [
		"default-src 'self'",
		"script-src 'self' 'unsafe-inline' 'unsafe-eval'",
		"style-src 'self' 'unsafe-inline'",
		`img-src 'self' data: blob:`,
		`connect-src ${connect}`,
		"font-src 'self' data:",
		"frame-ancestors 'none'",
		"base-uri 'self'",
		"form-action 'self'"
	].join('; ');
}

/** Path aset statis/tidak penting — dilewati agar log tidak penuh noise. */
function shouldLogRequest(path: string): boolean {
	if (path.startsWith('/_app/')) return false;
	if (/\.(png|jpg|jpeg|gif|svg|webp|ico|css|js|map|woff2?|ttf|txt|json|xml|webmanifest)$/i.test(path)) return false;
	return true;
}

/**
 * IP klien yang sebenarnya. Saat aplikasi berada di belakang proxy (Nginx,
 * Hostinger, Cloudflare), getClientAddress() hanya melihat socket proxy —
 * jadi header proxy diutamakan dulu, baru fallback ke socket.
 * getClientAddress() juga bisa melempar di dev tanpa socket; dibungkus try/catch
 * agar request tidak pernah gagal hanya karena logging.
 */
function getClientIp(event: RequestEvent): string {
	const forwarded = event.request.headers.get('x-forwarded-for');
	if (forwarded) return forwarded.split(',')[0].trim();
	const real = event.request.headers.get('x-real-ip');
	if (real) return real.trim();
	const cf = event.request.headers.get('cf-connecting-ip');
	if (cf) return cf.trim();
	try {
		return event.getClientAddress();
	} catch {
		return '';
	}
}

/**
 * Catat request ke tabel access_logs (fire-and-forget, tidak memblokir respons).
 * Pakai klien service role karena log_access hanya boleh dipanggil server.
 */
async function logRequest(
	db: ReturnType<typeof createServiceClient> | null,
	entry: {
		method: string;
		path: string;
		status: number;
		durationMs: number;
		userId: string | null;
		ip: string;
		userAgent: string;
		referer: string;
		errorMsg?: string;
	}
) {
	if (!db) return;
	try {
		const { error } = await db.rpc('log_access', {
			p_method: entry.method,
			p_path: entry.path,
			p_status: entry.status,
			p_duration_ms: entry.durationMs,
			p_user_id: entry.userId,
			p_ip: entry.ip,
			p_user_agent: entry.userAgent,
			p_referer: entry.referer,
			p_error_msg: entry.errorMsg ?? null
		});
		if (error) console.warn('[access-log] gagal menulis log:', error.message);
	} catch (e) {
		console.warn('[access-log] gagal menulis log:', e);
	}
}

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.supabase = isSupabaseConfigured ? createSsbSupabase(event.cookies) : null;
	event.locals.demoMode = !isSupabaseConfigured && env.ALLOW_DEMO_MODE === 'true';
	event.locals.accessToken = null;

	const startedAt = performance.now();
	let userId: string | null = null;

	// Muat sesi SECARA EAGER sebelum resolve(). Saat createServerClient dibuat,
	// auth-js memulai task background (fire-and-forget) yang memuat sesi dari
	// cookie dan bisa memicu token refresh. Tanpa await di sini, refresh yang
	// selesai SETELAH respons dibuat akan menulis cookie terlambat dan SvelteKit
	// melempar "Cannot use cookies.set(...) after the response has been generated"
	// (race token refresh saat SSR, supabase/ssr#131). Dengan await getSession()
	// di sini, refresh (jika ada) selalu selesai sebelum respons di-generate.
	if (event.locals.supabase) {
		const { data } = await event.locals.supabase.auth.getSession();
		// Catatan: user dari getSession() berasal dari cookie dan TIDAK dipakai
		// untuk otorisasi di sisi web (guard selalu memakai getUser()/auth.uid()).
		// Di sini hanya untuk atribusi access log halaman.
		event.locals.accessToken = data.session?.access_token ?? null;
		userId = data.session?.user?.id ?? null;
	}

	let response: Response;
	let thrownError: unknown = null;
	try {
		response = await resolve(event, {
			// Forward header Supabase (content-range) pada sub-request SSR agar
			// respons data tidak memotong metadata yang dibutuhkan klien.
			filterSerializedResponseHeaders(name) {
				return name === 'content-range' || name === 'x-supabase-api-version';
			}
		});
	} catch (err) {
		thrownError = err;
		// Buat respons 500 tiruan agar error tetap tercatat di access log,
		// lalu biarkan error asli diteruskan ke error handler SvelteKit.
		response = new Response('Internal Server Error', { status: 500 });
	}

	// ===== Access log halaman (API /api/* dicatat oleh gateway — tidak double) =====
	if (!event.url.pathname.startsWith('/api/') && shouldLogRequest(event.url.pathname)) {
		void logRequest(serviceDb, {
			method: event.request.method,
			path: `${event.url.pathname}${event.url.search}`,
			status: response.status,
			durationMs: Math.round(performance.now() - startedAt),
			userId,
			ip: getClientIp(event),
			userAgent: event.request.headers.get('user-agent') ?? '',
			referer: event.request.headers.get('referer') ?? '',
			errorMsg: thrownError instanceof Error ? thrownError.message : undefined
		});
	}

	if (thrownError !== null) {
		throw thrownError;
	}

	// ===== Security headers (best practice) =====
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
	response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
	response.headers.set('Content-Security-Policy', buildCsp());
	if (isProd) {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}

	return response;
};
