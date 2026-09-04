import { redirect, fail } from '@sveltejs/kit';
import { isSupabaseConfigured } from '$lib/server/supabase.js';
import { ssb } from '$lib/server/guards.js';
import { env } from '$env/dynamic/private';
import type { Actions, PageServerLoad } from './$types';

const API_UPSTREAM = (env.API_UPSTREAM ?? 'http://127.0.0.1:3001').replace(/\/+$/, '');

/**
 * Halaman langganan. Semua operasi bisnis dijalankan oleh API Gateway
 * (apps/api) — halaman ini hanya SSR tipis untuk guard + render.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	if (!isSupabaseConfigured) {
		redirect(303, '/setup');
	}

	const { data: userData } = await ssb(locals).auth.getUser();
	if (!userData.user) {
		redirect(303, `/login?redirectTo=/subscribe`);
	}

	const { data: profile } = await ssb(locals)
		.from('profiles')
		.select('shop_id')
		.eq('id', userData.user.id)
		.single();

	const { data: plans } = await ssb(locals).from('plans').select('*').eq('is_active', true).order('monthly_price');

	let pendingInvoice: { id: string; payment_url: string | null; qr_string: string | null; status: string; merchant_order_id: string; amount: number; payment_channel: string | null; discount_amount: number } | null = null;
	let paidInvoice: { merchant_order_id: string; amount: number; paid_at: string | null } | null = null;
	if (profile?.shop_id) {
		const { data: invoice } = await ssb(locals)
			.from('invoices')
			.select('id, payment_url, qr_string, status, merchant_order_id, amount, payment_channel, discount_amount, paid_at')
			.eq('shop_id', profile.shop_id)
			.order('created_at', { ascending: false })
			.limit(1)
			.single();
		if (invoice?.status === 'pending') {
			pendingInvoice = invoice as unknown as typeof pendingInvoice;
		} else if (invoice?.status === 'paid') {
			paidInvoice = { merchant_order_id: invoice.merchant_order_id, amount: invoice.amount, paid_at: invoice.paid_at };
		}
	}

	return {
		hasShop: Boolean(profile?.shop_id),
		shopId: profile?.shop_id ?? null,
		plans: plans ?? [],
		pendingInvoice,
		paidInvoice,
		status: url.searchParams.get('status')
	};
};

export const actions: Actions = {
	subscribe: async ({ request, locals }) => {
		const form = await request.formData();
		const planId = String(form.get('planId') ?? 'pro');
		const billingPeriod = form.get('billing') === 'annual' ? 'annual' : 'monthly';

		const { data: session } = await ssb(locals).auth.getSession();
		const token = session.session?.access_token ?? null;
		if (!token) {
			redirect(303, '/login?redirectTo=/subscribe');
		}

		let result: Record<string, unknown>;
		try {
			const res = await fetch(`${API_UPSTREAM}/api/subscription/create`, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					authorization: `Bearer ${token}`
				},
				body: JSON.stringify({ planId, billingPeriod })
			});
			const json = (await res.json().catch(() => ({}))) as { message?: string };
			if (!res.ok) {
				return fail(res.status === 409 ? 409 : 503, { error: json.message ?? 'PAYMENT_NOT_CONFIGURED' });
			}
			result = json;
		} catch {
			return fail(503, { error: 'PAYMENT_NOT_CONFIGURED' });
		}

		if (result.paymentUrl) {
			redirect(303, String(result.paymentUrl));
		}
		if (result.mock) {
			redirect(303, `/payment/result?merchantOrderId=${result.merchantOrderId}&mock=1`);
		}
		// Manual: tanpa gateway — pemilik TIDAK bisa mengaktifkan sendiri.
		if (result.manual) {
			redirect(303, `/subscribe?status=pending`);
		}
		return fail(503, { error: 'PAYMENT_NOT_CONFIGURED' });
	}
};