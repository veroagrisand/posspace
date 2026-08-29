import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import type { Cookies } from '@sveltejs/kit';

export const isSupabaseConfigured = Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * Klien Supabase sisi server yang memakai cookie sesi pengguna.
 * RLS tetap aktif — seluruh akses dibatasi peran & toko.
 * Cookie: sameSite=lax (anti-CSRF), secure=true di produksi.
 * httpOnly sengaja false karena klien browser (createBrowserClient)
 * juga membaca sesi dari cookie ini (kebutuhan arsitektur @supabase/ssr).
 */
export function createSsbSupabase(cookies: Pick<Cookies, 'getAll' | 'set'>) {
	const secure = env.NODE_ENV === 'production';
	return createServerClient(env.SUPABASE_URL as string, env.SUPABASE_ANON_KEY as string, {
		cookies: {
			getAll() {
				return cookies.getAll();
			},
setAll(cookiesToSet) {
			try {
				cookiesToSet.forEach(({ name, value, options }) =>
					cookies.set(name, value, {
						...options,
						path: '/',
						sameSite: 'lax',
						secure
					} as unknown as Parameters<Cookies['set']>[2])
				);
			} catch (error) {
				// Refresh token yang selesai SETELAH respons dibuat (mis. race
				// token refresh saat SSR) akan membuat SvelteKit melempar
				// "Cannot use cookies.set(...) after the response has been
				// generated". Cookie sesi sudah lebih dulu ditulis oleh klien
				// browser, jadi write yang terlambat ini aman diabaikan.
				console.warn('[supabase:ssr] cookie setAll gagal (respons sudah dikirim):', error);
			}
		}
		}
	});
}

/** Klien service role — HANYA untuk operasi sistem. Tidak pernah dipakai di route pengguna. */
export function createServiceClient() {
	return createClient(env.SUPABASE_URL as string, env.SUPABASE_SERVICE_ROLE_KEY as string, {
		auth: { persistSession: false }
	});
}