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

const call = async (path, cookie, method = 'GET') => {
	const res = await fetch(BASE + path, { method, headers: { Cookie: cookie } });
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

// Regresi: toko dengan transaksi berbayar tetap boleh dihapus oleh platform admin.
let deletionShopId = '';
try {
	const { data: deletionShop, error: deletionShopError } = await SERVICE
		.from('shops')
		.insert({ name: `Smoke Delete ${Date.now()}` })
		.select('id')
		.single();
	deletionShopId = deletionShop?.id ?? '';
	if (deletionShopError || !deletionShopId) {
		ok('setup toko transaksi berbayar', false, deletionShopError?.message ?? 'toko tidak dibuat');
	} else {
		const { error: paidTxnError } = await SERVICE.from('transactions').insert({
			shop_id: deletionShopId,
			profile_id: admin.user.id,
			receipt_no: `SMOKE-DELETE-${Date.now()}`,
			total_amount: 1000,
			payment_method: 'cash',
			payment_status: 'paid',
			paid_at: new Date().toISOString(),
			status: 'completed'
		});
		if (paidTxnError) {
			ok('setup transaksi berbayar', false, paidTxnError.message);
		} else {
			const deletion = await call(`/api/admin/shops/${deletionShopId}`, admin.cookie, 'DELETE');
			ok('hapus toko dengan transaksi berbayar → 200', deletion.status === 200, `status ${deletion.status}`);
			const { data: remainingShop } = await SERVICE.from('shops').select('id').eq('id', deletionShopId).maybeSingle();
			ok('toko dan data terkait terhapus', !remainingShop);
		}
	}
} finally {
	if (deletionShopId) {
		await SERVICE.from('transactions').delete().eq('shop_id', deletionShopId);
		await SERVICE.from('shops').delete().eq('id', deletionShopId);
	}
}

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
