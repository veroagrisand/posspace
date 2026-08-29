import { error, redirect } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured } from './supabase';

export interface AdminContext {
	user: { id: string; email: string };
}

/**
 * Guard akses khusus owner SaaS (platform admin).
 * Keanggotaan diperiksa lewat tabel platform_admins (RLS: hanya baris sendiri).
 * Halaman: redirect ke login. API: error 403.
 */
export async function requirePlatformAdmin(
	url: URL,
	supabase: SupabaseClient,
	mode: 'page' | 'api' = 'page'
): Promise<AdminContext> {
	if (!isSupabaseConfigured) {
		if (mode === 'api') error(503, 'NOT_CONFIGURED');
		redirect(303, '/setup');
	}

	const { data: authData } = await supabase.auth.getUser();
	if (!authData.user) {
		if (mode === 'api') error(401, 'UNAUTHENTICATED');
		redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname)}`);
	}

	const { data: admin } = await supabase
		.from('platform_admins')
		.select('user_id')
		.eq('user_id', authData.user.id)
		.maybeSingle();

	if (!admin) {
		if (mode === 'api') error(403, 'FORBIDDEN');
		redirect(303, `/login?error=not_admin&redirectTo=${encodeURIComponent(url.pathname)}`);
	}

	return { user: { id: authData.user.id, email: authData.user.email ?? '' } };
}