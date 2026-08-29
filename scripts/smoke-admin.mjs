import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';

const env = Object.fromEntries(
	readFileSync('.env', 'utf8').split('\n')
		.filter((l) => l && !l.startsWith('#') && l.includes('='))
		.map((l) => [l.split('=')[0].trim(), l.split('=').slice(1).join('=').trim()])
);
const URL = env.SUPABASE_URL;
const REF = URL.replace('https://', '').split('.')[0];
const SERVICE = createClient(URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const BASE = 'http://localhost:5173';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`  ${cond ? '✅' : '❌'} ${name} ${extra}`); };

async function makeUser(name, asAdmin) {
	const email = `smoke-${crypto.randomBytes(4).toString('hex')}@test.posspace.id`;
	const { data } = await SERVICE.auth.admin.createUser({ email, password: 'Test1234!', email_confirm: true, user_metadata: { full_name: name } });
	if (asAdmin) await SERVICE.from('platform_admins').insert({ user_id: data.user.id });
	const client = createClient(URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
	const { data: sess } = await client.auth.signInWithPassword({ email, password: 'Test1234!' });
	const cookie = `sb-${REF}-auth-token=base64-${Buffer.from(JSON.stringify(sess.session)).toString("base64url")}`;
	return { user: data.user, cookie };
}
const cleanup = async (u) => { try { await SERVICE.auth.admin.deleteUser(u.id); } catch {} };

const call = async (path, cookie) => {
	const res = await fetch(BASE + path, { headers: { Cookie: cookie } });
	const body = await res.json().catch(() => ({}));
	return { status: res.status, body };
};

const admin = await makeUser('Smoke Admin', true);
const normal = await makeUser('Smoke Normal', false);

const ov = await call('/api/admin/overview', admin.cookie);
ok('GET /api/admin/overview → 200', ov.status === 200, `status ${ov.status}`);
ok('overview punya totals', ov.body.totals?.shops != null && typeof ov.body.subscriptions?.mrr === 'number');
ok('overview punya revenue 14 hari', Array.isArray(ov.body.revenue) && ov.body.revenue.length === 14);

const list = await call('/api/admin/shops', admin.cookie);
ok('GET /api/admin/shops → 200 + array', list.status === 200 && Array.isArray(list.body.shops));

const shopId = list.body.shops?.[0]?.id;
if (shopId) {
	const detail = await call(`/api/admin/shops/${shopId}`, admin.cookie);
	ok(`GET /api/admin/shops/${shopId} → 200`, detail.status === 200);
	ok('detail punya ingredients & stats', Array.isArray(detail.body.ingredients) && detail.body.stats?.txCount != null);
} else {
	console.log('  ⚠️  tidak ada toko untuk diuji detail — dilewati');
}

const denied = await call('/api/admin/overview', normal.cookie);
ok('user biasa → 403 FORBIDDEN', denied.status === 403, `status ${denied.status}`);
const deniedShops = await call('/api/admin/shops', normal.cookie);
ok('user biasa → shops 403', deniedShops.status === 403);

const pageRes = await fetch(BASE + '/admin', { redirect: 'manual' });
ok('halaman /admin tanpa sesi → redirect', [301, 302, 303].includes(pageRes.status), `status ${pageRes.status} → ${pageRes.headers.get('location')}`);

await cleanup(admin.user);
await cleanup(normal.user);

console.log(`\n================ HASIL: ${pass} lulus, ${fail} gagal ================`);
process.exit(fail > 0 ? 1 : 0);
