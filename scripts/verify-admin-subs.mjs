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
	const email = `sub-${crypto.randomBytes(4).toString('hex')}@test.posspace.id`;
	const { data } = await SERVICE.auth.admin.createUser({ email, password: 'Test1234!', email_confirm: true, user_metadata: { full_name: name } });
	if (asAdmin) await SERVICE.from('platform_admins').insert({ user_id: data.user.id });
	const client = createClient(URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
	const { data: sess } = await client.auth.signInWithPassword({ email, password: 'Test1234!' });
	const cookie = `sb-${REF}-auth-token=base64-${Buffer.from(JSON.stringify(sess.session)).toString('base64url')}`;
	return { user: data.user, cookie };
}
const cleanup = async (u) => { try { await SERVICE.auth.admin.deleteUser(u.id); } catch {} };
const call = async (path, cookie, method = 'GET', body) => {
	const res = await fetch(BASE + path, { method, headers: { Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
	return { status: res.status, body: await res.json().catch(() => ({})) };
};

const admin = await makeUser('Sub Admin', true);
const owner = await makeUser('Toko Owner', false);

// toko dengan subscription PENDING (seperti hasil registrasi)
const { data: shop } = await SERVICE.from('shops').insert({ name: 'Kopi Pending' }).select('id').single();
await SERVICE.from('profiles').update({ shop_id: shop.id, role: 'pemilik' }).eq('id', owner.user.id);
const { data: sub } = await SERVICE.from('subscriptions').insert({ shop_id: shop.id, plan_id: 'pro', status: 'pending' }).select('id').single();
await SERVICE.from('invoices').insert({ subscription_id: sub.id, shop_id: shop.id, plan_id: 'pro', amount: 349000, merchant_order_id: `PS-SUB-TEST-${Date.now()}`, status: 'pending' });

console.log('\n[1] Daftar langganan (superadmin)');
const list = await call('/api/admin/subscriptions', admin.cookie);
ok('GET list → 200 + array', list.status === 200 && Array.isArray(list.body.subscriptions));
const row = list.body.subscriptions?.find((s) => s.shopId === shop.id);
ok('toko tampil dengan status pending', row?.subscription?.status === 'pending', row?.subscription?.status);
ok('invoice pending ikut tampil', row?.lastInvoice?.status === 'pending');

console.log('\n[2] Aktivasi manual oleh superadmin');
const act = await call(`/api/admin/subscriptions/${shop.id}/activate`, admin.cookie, 'POST', { months: 1, planId: 'pro' });
ok('activate → 200 + active', act.status === 200 && act.body.subscription?.status === 'active', JSON.stringify(act.body.subscription ?? act.body));
const list2 = await call('/api/admin/subscriptions', admin.cookie);
const row2 = list2.body.subscriptions?.find((s) => s.shopId === shop.id);
ok('status berubah aktif + periode ~1 bulan', row2?.subscription?.active === true && row2?.subscription?.periodEnd);
const periodMs = new Date(row2?.subscription?.periodEnd) - new Date(row2?.subscription?.periodStart);
ok('periode ±30 hari', Math.abs(periodMs - 30 * 864e5) <= 2 * 864e5, `${Math.round(periodMs / 864e5)} hari`);
ok('invoice pending ditandai lunas', row2?.lastInvoice?.status === 'paid');

console.log('\n[3] Perpanjang +3 bulan (berlanjut dari akhir periode)');
const ext = await call(`/api/admin/subscriptions/${shop.id}/activate`, admin.cookie, 'POST', { months: 3 });
const list3 = await call('/api/admin/subscriptions', admin.cookie);
const row3 = list3.body.subscriptions?.find((s) => s.shopId === shop.id);
const period2Ms = new Date(row3?.subscription?.periodEnd) - new Date(row3?.subscription?.periodStart);
ok('periode menjadi ±4 bulan total', Math.round(period2Ms / 864e5) >= 118 && Math.round(period2Ms / 864e5) <= 123, `${Math.round(period2Ms / 864e5)} hari`);

console.log('\n[4] Batalkan langganan');
const cancel = await call(`/api/admin/subscriptions/${shop.id}/cancel`, admin.cookie, 'POST');
ok('cancel → 200', cancel.status === 200, JSON.stringify(cancel.body));
const list4 = await call('/api/admin/subscriptions', admin.cookie);
const row4 = list4.body.subscriptions?.find((s) => s.shopId === shop.id);
ok('status cancelled & tidak aktif', row4?.subscription?.status === 'cancelled' && row4?.subscription?.active === false);

console.log('\n[5] Keamanan: pemilik toko & user biasa TIDAK bisa');
const ownerAct = await call(`/api/admin/subscriptions/${shop.id}/activate`, owner.cookie, 'POST', { months: 1 });
ok('pemilik toko → ditolak (bukan 200)', ownerAct.status !== 200, `status ${ownerAct.status}`);
const denied = await call('/api/admin/subscriptions', owner.cookie);
ok('pemilik toko tidak bisa baca daftar', denied.status === 403, `status ${denied.status}`);

await cleanup(admin.user);
await cleanup(owner.user);
console.log(`\n================ HASIL: ${pass} lulus, ${fail} gagal ================`);
process.exit(fail > 0 ? 1 : 0);
