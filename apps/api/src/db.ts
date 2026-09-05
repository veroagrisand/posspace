import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, isSupabaseConfigured } from './env.js';

export type { SupabaseClient };

/**
 * Klien Supabase terpusat — kunci optimasi latensi:
 * 1) SATU instance service-role dibagi seluruh request (bukan dibuat per-request),
 *    sehingga koneksi & session HTTP ke Supabase di-pool oleh undici.
 * 2) Klien per-token (user-scoped, RLS aktif) di-cache 60 detik per token.
 * 3) Verifikasi JWT di-cache 60 detik — menghindari round-trip ke GoTrue tiap request.
 */

let serviceClient: SupabaseClient | null = null;

export function service(): SupabaseClient {
	if (!isSupabaseConfigured) throw new Error('SUPABASE_NOT_CONFIGURED');
	if (!serviceClient) {
		serviceClient = createClient(env.SUPABASE_URL as string, env.SUPABASE_SERVICE_ROLE_KEY as string, {
			auth: { persistSession: false }
		});
	}
	return serviceClient;
}

const TOKEN_CLIENT_TTL_MS = 60_000;
const TOKEN_CLIENT_MAX = 200;
const tokenClients = new Map<string, { at: number; client: SupabaseClient }>();

/** Klien yang bertindak sebagai pengguna (token JWT) — RLS tetap aktif. */
export function userDb(accessToken: string): SupabaseClient {
	const hit = tokenClients.get(accessToken);
	if (hit && Date.now() - hit.at < TOKEN_CLIENT_TTL_MS) return hit.client;

	const client = createClient(env.SUPABASE_URL as string, env.SUPABASE_ANON_KEY as string, {
		auth: { persistSession: false },
		global: { headers: { Authorization: `Bearer ${accessToken}` } }
	});
	tokenClients.set(accessToken, { at: Date.now(), client });

	if (tokenClients.size > TOKEN_CLIENT_MAX) {
		const now = Date.now();
		for (const [k, v] of tokenClients) {
			if (now - v.at > TOKEN_CLIENT_TTL_MS) tokenClients.delete(k);
		}
	}
	return client;
}

export interface VerifiedUser {
	id: string;
	email: string;
}

const USER_CACHE_TTL_MS = 60_000;
const USER_CACHE_MAX = 500;
const userCache = new Map<string, { at: number; user: VerifiedUser | null }>();

/** Verifikasi JWT ke Supabase Auth dengan cache — null jika token tidak valid. */
export async function verifyUser(accessToken: string): Promise<VerifiedUser | null> {
	const hit = userCache.get(accessToken);
	if (hit && Date.now() - hit.at < USER_CACHE_TTL_MS) return hit.user;

	const { data } = await service().auth.getUser(accessToken);
	const user: VerifiedUser | null = data.user
		? { id: data.user.id, email: data.user.email ?? '' }
		: null;
	userCache.set(accessToken, { at: Date.now(), user });

	if (userCache.size > USER_CACHE_MAX) {
		const now = Date.now();
		for (const [k, v] of userCache) {
			if (now - v.at > USER_CACHE_TTL_MS) userCache.delete(k);
		}
	}
	return user;
}