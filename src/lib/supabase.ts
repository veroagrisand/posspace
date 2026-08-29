import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

/** Apakah kredensial Supabase sudah dikonfigurasi via .env */
export const isSupabaseConfigured: boolean = Boolean(PUBLIC_SUPABASE_URL && PUBLIC_SUPABASE_ANON_KEY);

let browserClient: SupabaseClient | null | undefined;

/**
 * Klien Supabase browser (cookie SSR shared dengan server) — dibuat lazy,
 * hanya dipakai di sisi client untuk BACA data & auth flow.
 * Semua mutasi lewat API server yang dilindungi guard + RLS agar tidak bisa di-bypass.
 */
export function getBrowserClient(): SupabaseClient | null {
	if (!isSupabaseConfigured) return null;
	if (browserClient === undefined) {
		browserClient = createBrowserClient(PUBLIC_SUPABASE_URL as string, PUBLIC_SUPABASE_ANON_KEY as string);
	}
	return browserClient;
}