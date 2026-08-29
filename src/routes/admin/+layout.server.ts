import { requirePlatformAdmin } from '$lib/server/admin.js';
import { ssb } from '$lib/server/guards.js';

/** Guard server: hanya platform admin (owner SaaS) yang bisa membuka /admin. */
export async function load({ locals, url }) {
	const admin = await requirePlatformAdmin(url, ssb(locals), 'page');
	return { admin };
}