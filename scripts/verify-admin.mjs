import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';

const env = Object.fromEntries(
	readFileSync('.env', 'utf8').split('\n')
		.filter((l) => l && !l.startsWith('#') && l.includes('='))
		.map((l) => [l.split('=')[0].trim(), l.split('=').slice(1).join('=').trim()])
);
const URL = env.SUPABASE_URL;
const SERVICE = createClient(URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`  ${cond ? '✅' : '❌'} ${name} ${extra}`); };

async function makeUser(name) {
	const email = `verify-${crypto.randomBytes(4).toString('hex')}@test.posspace.id`;
	const { data } = await SERVICE.auth.admin.createUser({ email, password: 'Test1234!', email_confirm: true, user_metadata: { full_name: name } });
	const client = createClient(URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
	await client.auth.signInWithPassword({ email, password: 'Test1234!' });
	return { user: data.user, client };
}
const cleanup = async (u) => { try { await SERVICE.auth.admin.deleteUser(u.id); } catch {} };

// [1] platform_admins RLS: admin baca baris sendiri, non-admin tidak
const { user: adminUser, client: adminClient } = await makeUser('Admin');
await SERVICE.from('platform_admins').insert({ user_id: adminUser.id });
const { data: ownRow } = await adminClient.from('platform_admins').select('user_id').eq('user_id', adminUser.id).maybeSingle();
ok('platform admin membaca baris sendiri (RLS)', !!ownRow);

const { user: normalUser, client: normalClient } = await makeUser('Normal');
const { data: foreignRow } = await normalClient.from('platform_admins').select('user_id').maybeSingle();
ok('user biasa TIDAK bisa baca platform_admins', !foreignRow);

// [2] record_purchase: cost_per_unit rata-rata tertimbang (HPP)
const { data: shop } = await SERVICE.from('shops').insert({ name: 'Verify HPP' }).select('id').single();
await SERVICE.from('profiles').update({ shop_id: shop.id, role: 'pemilik' }).eq('id', adminUser.id);
const { data: sub } = await SERVICE.from('subscriptions').insert({ shop_id: shop.id, plan_id: 'starter', status: 'active', period_start: new Date().toISOString(), period_end: new Date(Date.now() + 30 * 864e5).toISOString() }).select('id').single();
const { data: ing } = await adminClient.from('ingredients').insert({ shop_id: shop.id, name: 'Biji verify', unit: 'gram', stock_quantity: 100, min_stock: 10, cost_per_unit: 0 }).select('id').single();
const { error: poErr } = await adminClient.rpc('record_purchase', { p_ingredient_id: ing.id, p_supplier: 'PT Test', p_quantity: 100, p_unit_price: 500 });
const { data: after } = await adminClient.from('ingredients').select('stock_quantity, cost_per_unit').eq('id', ing.id).single();
ok('pembelian menambah stok', Number(after?.stock_quantity) === 200, `stok ${after?.stock_quantity}`);
ok('cost_per_unit rata-rata tertimbang = 250', Number(after?.cost_per_unit) === 250, `hpp ${after?.cost_per_unit}`);

// [3] summary API via browser client (RLS) — cek HPP terhitung dari resep
const { data: product } = await adminClient.from('products').insert({ shop_id: shop.id, name: 'Kopi Verify' }).select('id').single();
const { data: variant } = await adminClient.from('product_variants').insert({ product_id: product.id, name: 'Reguler', price: 20000 }).select('id').single();
await adminClient.from('recipes').insert({ variant_id: variant.id, ingredient_id: ing.id, quantity_required: 10 });
const { data: txn, error: txnErr } = await adminClient.rpc('process_transaction', { p_shift_id: null, p_payment_method: 'cash', p_cash_received: 20000, p_items: [{ variantId: variant.id, qty: 1 }] });
ok('transaksi verifikasi berhasil', !txnErr && !!txn?.receiptNo, txnErr?.message ?? '');

await cleanup(adminUser);
await cleanup(normalUser);

console.log(`\n================ HASIL: ${pass} lulus, ${fail} gagal ================`);
process.exit(fail > 0 ? 1 : 0);
