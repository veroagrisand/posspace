import type { Context } from 'hono';
import type { SupabaseClient } from '@supabase/supabase-js';
import './types.js';
import { httpError } from './http.js';
import { userDb, verifyUser, type VerifiedUser } from './db.js';

export interface AuthContext {
	user: VerifiedUser;
	token: string;
	db: SupabaseClient;
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

export interface ApiContext extends AuthContext {
	shop: ShopContext;
}

/**
 * Otentikasi: verifikasi JWT (dengan cache 60 dtk).
 * Melempar 401 jika token tidak valid/absent.
 */
export async function requireAuth(c: Context): Promise<AuthContext> {
	const token = c.get('accessToken') as string | undefined;
	if (!token) httpError(401, 'UNAUTHENTICATED');
	const user = await verifyUser(token as string);
	if (!user) httpError(401, 'UNAUTHENTICATED');
	const db = userDb(token as string);
	c.set('db', db);
	return { user, token: token as string, db };
}

/**
 * Guard API: wajib login → wajib punya toko → wajib subscription aktif.
 * (Versi API dari requireActiveShop lama — error, bukan redirect.)
 */
export async function requireApiAuth(c: Context): Promise<ApiContext> {
	const auth = await requireAuth(c);
	const { user, db } = auth;

	const { data: profile } = await db
		.from('profiles')
		.select('shop_id, role, shops(name, id)')
		.eq('id', user.id)
		.single();

	if (!profile?.shop_id) httpError(403, 'SHOP_REQUIRED');

	const { data: subscription } = await db
		.from('subscriptions')
		.select('status, plan_id, period_end, plans(name)')
		.eq('shop_id', profile.shop_id)
		.in('status', ['pending', 'trialing', 'active'])
		.order('created_at', { ascending: false })
		.limit(1)
		.single();

	if (!subscription) httpError(402, 'SUBSCRIPTION_REQUIRED');
	if (subscription.status === 'pending') httpError(402, 'PAYMENT_REQUIRED');

	const isActive = subscription.status === 'active' || subscription.status === 'trialing';
	const notExpired = !subscription.period_end || new Date(subscription.period_end) > new Date();
	if (!isActive || !notExpired) httpError(402, 'SUBSCRIPTION_EXPIRED');

	return {
		...auth,
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

/** Guard khusus platform admin (owner SaaS). */
export async function requirePlatformAdmin(c: Context): Promise<AuthContext> {
	const auth = await requireAuth(c);

	const { data: admin } = await auth.db
		.from('platform_admins')
		.select('user_id')
		.eq('user_id', auth.user.id)
		.maybeSingle();

	if (!admin) httpError(403, 'FORBIDDEN');

	return auth;
}