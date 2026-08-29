import { redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured } from './supabase';

export interface SessionUser {
	id: string;
	email: string;
}

export interface ShopContext {
	shopId: string;
	shopName: string;
	profileRole: string;
	subscription: {
		status: string;
		planId: string;
		planName: string;
		periodEnd: string | null;
	} | null;
}

/** Klien supabase server dijamin non-null setelah konfigurasi; selain itu redirect ke /setup. */
export function ssb(locals: App.Locals): SupabaseClient {
	if (!locals.supabase) {
		redirect(303, '/setup');
	}
	return locals.supabase;
}

/**
 * Guard berlapis (server-side):
 * 1. Wajib login (Supabase session).
 * 2. Wajib punya toko (shop).
 * 3. Wajib subscription aktif — jika pending/expired, diarahkan ke halaman langganan/payment.
 */
export async function requireActiveShop(url: URL, supabase: SupabaseClient): Promise<{ user: SessionUser; shop: ShopContext }> {
	if (!isSupabaseConfigured) {
		redirect(303, '/setup');
	}

	const { data: authData, error: authError } = await supabase.auth.getUser();
	if (authError || !authData.user) {
		redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname)}`);
	}
	const user: SessionUser = { id: authData.user.id, email: authData.user.email ?? '' };

	const { data: profile } = await supabase
		.from('profiles')
		.select('shop_id, role, shops(name, id)')
		.eq('id', user.id)
		.single();

	if (!profile?.shop_id) {
		redirect(303, '/subscribe?new=1');
	}

	const { data: subscription } = await supabase
		.from('subscriptions')
		.select('status, plan_id, period_end, plans(name)')
		.eq('shop_id', profile.shop_id)
		.in('status', ['pending', 'trialing', 'active'])
		.order('created_at', { ascending: false })
		.limit(1)
		.single();

	if (!subscription) {
		redirect(303, `/subscribe?shop=${profile.shop_id}`);
	}

	if (subscription.status === 'pending') {
		// sudah membuat invoice tapi belum bayar → arahkan langsung ke halaman bayar
		const { data: invoice } = await supabase
			.from('invoices')
			.select('id, payment_url, status')
			.eq('shop_id', profile.shop_id)
			.eq('status', 'pending')
			.order('created_at', { ascending: false })
			.limit(1)
			.single();
		redirect(303, invoice?.payment_url ?? `/subscribe?invoice=${invoice?.id ?? ''}&shop=${profile.shop_id}`);
	}

	const isActive = subscription.status === 'active' || subscription.status === 'trialing';
	const notExpired = !subscription.period_end || new Date(subscription.period_end) > new Date();
	if (!isActive || !notExpired) {
		redirect(303, `/subscribe?shop=${profile.shop_id}&status=${subscription.status}`);
	}

	return {
		user,
		shop: {
			shopId: profile.shop_id,
			shopName: (profile.shops as unknown as { name?: string })?.name ?? 'Toko',
			profileRole: profile.role,
			subscription: {
				status: subscription.status,
				planId: subscription.plan_id,
				planName: (subscription.plans as unknown as { name?: string })?.name ?? subscription.plan_id,
				periodEnd: subscription.period_end
			}
		}
	};
}