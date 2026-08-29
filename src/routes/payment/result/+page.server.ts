import { redirect } from '@sveltejs/kit';
import { isSupabaseConfigured } from '$lib/server/supabase.js';
import { ssb } from '$lib/server/guards.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!isSupabaseConfigured) {
		redirect(303, '/setup');
	}
	const { data: userData } = await ssb(locals).auth.getUser();
	if (!userData.user) {
		redirect(303, '/login?redirectTo=/payment/result');
	}

	return {
		merchantOrderId: url.searchParams.get('merchantOrderId') ?? '',
		mock: url.searchParams.get('mock') === '1',
		manual: url.searchParams.get('manual') === '1'
	};
};