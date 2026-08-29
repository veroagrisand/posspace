import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';

const env = Object.fromEntries(
	readFileSync('.env', 'utf8')
		.split('\n')
		.filter((l) => l && !l.startsWith('#') && l.includes('='))
		.map((l) => [l.split('=')[0].trim(), l.split('=').slice(1).join('=').trim()])
);
const URL = env.SUPABASE_URL;
const BASE = process.env.BASE_URL ?? 'http://localhost:5186';
const REF = 'iibqyqcmckjxpixoypjx';

const SERVICE = createClient(URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = `flow-${crypto.randomBytes(4).toString('hex')}@test.posspace.id`;
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? (pass++, console.log(`  ✅ ${name} ${extra}`)) : (fail++, console.log(`  ❌ ${name} ${extra}`)); };

// 1) buat + konfirmasi user
const { data: u } = await SERVICE.auth.admin.createUser({ email, password: 'Test1234!', email_confirm: true, user_metadata: { full_name: 'Flow Tester', shop_name: 'Toko Flow' } });

// 2) login password → token
const tokenRes = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
	method: 'POST',
	headers: { 'Content-Type': 'application/json', apikey: env.SUPABASE_ANON_KEY },
	body: JSON.stringify({ email, password: 'Test1234!' })
});
const tokens = await tokenRes.json();
const cookieVal = 'base64-' + Buffer.from(JSON.stringify({ access_token: tokens.access_token, refresh_token: tokens.refresh_token, expires_at: tokens.expires_at })).toString('base64url');
const cookie = `${REF}-auth-token=${cookieVal}; Path=/; HttpOnly; SameSite=Lax`;
const cookies = [`sb-${cookie}`];

async function get(path) {
	const res = await fetch(BASE + path, { headers: { cookie: cookies.join('; ') }, redirect: 'manual' });
	return { status: res.status, location: res.headers.get('location') ?? '', body: await res.text().catch(() => '') };
}
async function post(path, body) {
	const res = await fetch(BASE + path, {
		method: 'POST',
		headers: { cookie: cookies.join('; '), 'Content-Type': 'application/json' },
		redirect: 'manual',
		body: JSON.stringify(body ?? {})
	});
	return { status: res.status, location: res.headers.get('location') ?? '', body: await res.text().catch(() => '') };
}

console.log('\n[1] Guard: /app tanpa toko → redirect /subscribe');
const r1 = await get('/app');
ok('/app redirect 303', r1.status === 303 && r1.location.includes('/subscribe'), `${r1.status} ${r1.location}`);

console.log('\n[2] Register: buat toko + subscription + invoice (manual, tanpa Duitku)');
const r2 = await post('/api/auth/register', { planId: 'pro' });
const j2 = JSON.parse(r2.body || '{}');
ok('register ok + manual flag', r2.status === 200 && j2.ok === true && j2.manual === true, `merchantOrderId=${j2.merchantOrderId}`);
const merchantOrderId = j2.merchantOrderId;

console.log('\n[3] Guard: /app dengan sub PENDING → redirect payment/subscribe');
const r3 = await get('/app');
ok('/app redirect (pending → payment/subscribe)', r3.status === 303 && (r3.location.includes('/payment/result') || r3.location.includes('/subscribe?invoice=')), `${r3.status} ${r3.location}`);

console.log('\n[4] Aktivasi langganan manual (pemilik)');
const r4 = await post('/api/subscription/activate', { merchantOrderId });
ok('aktivasi ok', r4.status === 200 && JSON.parse(r4.body || '{}').ok === true, r4.status);

console.log('\n[5] Guard: /app dengan sub AKTIF → 200');
const r5 = await get('/app');
ok('/app 200 (subscription aktif)', r5.status === 200, r5.status);

console.log('\n[6] Data endpoint terproteksi');
const r6 = await get('/api/shop');
const j6 = JSON.parse(r6.body || '{}');
ok('/api/shop mengembalikan toko', r6.status === 200 && !!j6.shop, j6.shop?.name ?? '');
ok('profiles + subscription ikut', Array.isArray(j6.profiles) && j6.subscription?.status === 'active');

const r6b = await post('/api/transactions', { items: [] });
ok('/api/transactions tolak items kosong (guard aktif)', r6b.status === 400, r6b.status);

console.log('\n[7] Rute publik tetap 200');
for (const p of ['/', '/login', '/register', '/setup']) {
	const res = await get(p);
	ok(`${p} → ${res.status}`, res.status === 200);
}

await SERVICE.auth.admin.deleteUser(u.user.id).catch(() => {});
console.log(`\n================ HASIL FLOW: ${pass} lulus, ${fail} gagal ================`);
process.exit(fail > 0 ? 1 : 0);