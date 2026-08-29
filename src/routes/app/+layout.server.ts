import { redirect } from '@sveltejs/kit';
import { isSupabaseConfigured } from '$lib/server/supabase.js';
import { ssb } from '$lib/server/guards.js';
import { requireActiveShop } from '$lib/server/guards.js';
import type { LayoutServerLoad } from './$types';

/**
 * Guard server: tidak bisa di-bypass dari browser.
 * - Mode backend: wajib login → wajib toko → wajib subscription aktif.
 *   Subscription pending/expired → redirect ke /subscribe (atau paymentUrl iPaymu).
 * - Mode demo: hanya aktif jika ALLOW_DEMO_MODE=true dan Supabase belum dikonfigurasi.
 */
export const load: LayoutServerLoad = async (event) => {
	if (event.locals.demoMode) {
		return { demo: true };
	}

	if (!isSupabaseConfigured) {
		redirect(303, '/setup');
	}

	const { user, shop } = await requireActiveShop(event.url, ssb(event.locals));

	return {
		demo: false,
		user,
		shop
	};
};