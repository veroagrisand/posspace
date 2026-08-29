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

async function makeUser(name, role = 'pemilik') {
	const email = `sec-${crypto.randomBytes(4).toString('hex')}@test.posspace.id`;
	const { data } = await SERVICE.auth.admin.createUser({ email, password: 'Test1234!', email_confirm: true, user_metadata: { full_name: name } });
	const client = createClient(URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
	const { data: sess } = await client.auth.signInWithPassword({ email, password: 'Test1234!' });
	const cookie = `sb-${REF}-auth-token=base64-${Buffer.from(JSON.stringify(sess.session)).toString('base64url')}`;
	return { user: data.user, cookie, client };
}
const cleanup = async (u) => { try { await SERVICE.auth.admin.deleteUser(u.id); } catch {} };
const call = async (path, cookie, method = 'GET', body) => {
	const res = await fetch(BASE + path, { method, headers: { Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
	return { status: res.status, body: await res.json().catch(() => ({})) };
};

const owner = await makeUser('Owner Sekuriti');
const kasir = await makeUser('Kasir Sekuriti');
const intruder = await makeUser('Penyusup');

const { data: shop } = await SERVICE.from('shops').insert({ name: 'Toko Sekuriti' }).select('id').single();
await SERVICE.from('profiles').update({ shop_id: shop.id, role: 'pemilik' }).eq('id', owner.user.id);
await SERVICE.from('profiles').update({ shop_id: shop.id, role: 'kasir' }).eq('id', kasir.user.id);
await SERVICE.from('subscriptions').insert({ shop_id: shop.id, plan_id: 'pro', status: 'active', period_start: new Date().toISOString(), period_end: new Date(Date.now() + 30 * 864e5).toISOString() });
const { data: ing } = await owner.client.from('ingredients').insert({ shop_id: shop.id, name: 'Biji', unit: 'gram', stock_quantity: 500, min_stock: 100 }).select('id').single();
const { data: prod } = await owner.client.from('products').insert({ shop_id: shop.id, name: 'Kopi' }).select('id').single();
const { data: var1 } = await owner.client.from('product_variants').insert({ product_id: prod.id, name: 'Reguler', price: 20000 }).select('id').single();
await owner.client.from('recipes').insert({ variant_id: var1.id, ingredient_id: ing.id, quantity_required: 10 });

console.log('\n[1] Validasi qty negatif & qty 0 di process_transaction');
const neg = await owner.client.rpc('process_transaction', { p_shift_id: null, p_payment_method: 'cash', p_cash_received: 100000, p_items: [{ variantId: var1.id, qty: -2 }] });
ok('qty negatif DITOLAK (stok tidak bisa dinaikkan)', String(neg.error?.message ?? '').includes('INVALID_QUANTITY'), neg.error?.message ?? '');
const zero = await owner.client.rpc('process_transaction', { p_shift_id: null, p_payment_method: 'cash', p_cash_received: 100000, p_items: [{ variantId: var1.id, qty: 0 }] });
ok('qty 0 DITOLAK', String(zero.error?.message ?? '').includes('INVALID_QUANTITY'));
const { data: stockChk } = await owner.client.from('ingredients').select('stock_quantity').eq('id', ing.id).single();
ok('stok tidak berubah', Number(stockChk?.stock_quantity) === 500);

console.log('\n[2] Cash tanpa uang cukup DITOLAK');
const short = await owner.client.rpc('process_transaction', { p_shift_id: null, p_payment_method: 'cash', p_cash_received: 1000, p_items: [{ variantId: var1.id, qty: 1 }] });
ok('cash kurang DITOLAK (INSUFFICIENT_CASH)', String(short.error?.message ?? '').includes('INSUFFICIENT_CASH'), short.error?.message ?? '');

console.log('\n[3] Shift milik toko lain DITOLAK');
const { data: otherShop } = await SERVICE.from('shops').insert({ name: 'Toko Lain' }).select('id').single();
const { data: foreignShift } = await SERVICE.from('shifts').insert({ profile_id: owner.user.id, shop_id: otherShop.id, opening_cash: 0 }).select('id').single();
const badShift = await owner.client.rpc('process_transaction', { p_shift_id: foreignShift.id, p_payment_method: 'cash', p_cash_received: 50000, p_items: [{ variantId: var1.id, qty: 1 }] });
ok('shift toko lain DITOLAK (INVALID_SHIFT)', String(badShift.error?.message ?? '').includes('INVALID_SHIFT'), badShift.error?.message ?? '');

console.log('\n[4] record_purchase oleh KASIR DITOLAK (hanya pemilik/admin_gudang)');
const kasirBuy = await kasir.client.rpc('record_purchase', { p_ingredient_id: ing.id, p_supplier: 'Pemasok', p_quantity: 100, p_unit_price: 500 });
ok('kasir DITOLAK tambah stok (FORBIDDEN)', String(kasirBuy.error?.message ?? '').includes('FORBIDDEN'), kasirBuy.error?.message ?? '');
const kasirBuyNeg = await kasir.client.rpc('record_purchase', { p_ingredient_id: ing.id, p_supplier: 'Pemasok', p_quantity: -50, p_unit_price: 500 });
ok('qty negatif di pembelian DITOLAK', String(kasirBuyNeg.error?.message ?? '').includes('INVALID_QUANTITY') || String(kasirBuyNeg.error?.message ?? '').includes('FORBIDDEN'));
const { data: stockChk2 } = await owner.client.from('ingredients').select('stock_quantity').eq('id', ing.id).single();
ok('stok tetap 500 setelah percobaan', Number(stockChk2?.stock_quantity) === 500);

console.log('\n[5] IDOR nusapay/status: user lain cek invoice/transaksi toko korban');
// invoice korban — pakai toko terpisah (unique partial index sub aktif)
const { data: victimShop } = await SERVICE.from('shops').insert({ name: 'Toko Korban' }).select('id').single();
const { data: subRow } = await SERVICE.from('subscriptions').insert({ shop_id: victimShop.id, plan_id: 'pro', status: 'pending' }).select('id').single();
const { data: invoice } = await SERVICE.from('invoices').insert({ subscription_id: subRow.id, shop_id: victimShop.id, plan_id: 'pro', amount: 349000, merchant_order_id: `PS-SUB-SEC-${Date.now()}`, status: 'pending' }).select('id').single();
const idorInv = await call(`/api/payments/nusapay/status?merchantOrderId=${invoice.merchant_order_id}`, intruder.cookie);
ok('penyusup DITOLAK cek invoice orang lain (404)', idorInv.status === 404, `status ${idorInv.status}`);
// transaksi korban
const { data: txnRow } = await owner.client.rpc('process_transaction', { p_shift_id: null, p_payment_method: 'qris', p_items: [{ variantId: var1.id, qty: 1 }], p_payment_status: 'pending' });
const idorTxn = await call(`/api/payments/nusapay/status?transactionId=${txnRow.id}`, intruder.cookie);
ok('penyusup DITOLAK cek transaksi orang lain (404)', idorTxn.status === 404, `status ${idorTxn.status}`);

console.log('\n[6] Rate limit OTP (tanpa SMTP? SMTP aktif — cek cooldown 429)');
const rl = await call('/api/auth/otp/request', '', 'POST', { email: 'rl-test@test.posspace.id' });
ok('request OTP tanpa login tetap berfungsi (bukan 500)', rl.status !== 500, `status ${rl.status}`);
const rl2 = await call('/api/auth/otp/request', '', 'POST', { email: 'rl-test@test.posspace.id' });
ok('kirim ulang cepat → 429', rl2.status === 429, `status ${rl2.status}`);

console.log('\n[7] Password < 8 karakter DITOLAK');
const shortPw = await call('/api/auth/register', '', 'POST', { email: 'pw@test.posspace.id', password: 'abc123', fullName: 'X', shopName: 'Y' });
ok('password 6 karakter DITOLAK', shortPw.status === 400 && shortPw.body.message === 'PASSWORD_TOO_SHORT', `${shortPw.status} ${shortPw.body.message ?? ''}`);

console.log('\n[8] Buka shift ganda DITOLAK');
const open1 = await call('/api/data/shifts', kasir.cookie, 'POST', { openingCash: 100000 });
ok('buka shift pertama OK', open1.status === 200, `status ${open1.status}`);
const open2 = await call('/api/data/shifts', kasir.cookie, 'POST', { openingCash: 50000 });
ok('buka shift kedua DITOLAK (409)', open2.status === 409, `status ${open2.status}`);
const openNeg = await call('/api/data/shifts', kasir.cookie, 'POST', { openingCash: -1000 });
ok('kas awal negatif DITOLAK (400)', openNeg.status === 400, `status ${openNeg.status}`);

console.log('\n[9] Produk: harga negatif / resep qty <= 0 DITOLAK (API)');
const badPrice = await call('/api/data/products', owner.cookie, 'POST', { name: 'X', price: -5000 });
ok('produk harga negatif DITOLAK', badPrice.status === 400, `status ${badPrice.status}`);
const { data: prod2 } = await owner.client.from('products').insert({ shop_id: shop.id, name: 'Y' }).select('id').single();
const badPut = await call(`/api/data/products/${prod2.id}`, owner.cookie, 'PUT', { variants: [{ name: 'R', price: 10000, recipe: [{ ingredientId: ing.id, qty: -1 }] }] });
ok('resep qty <= 0 DITOLAK (PUT)', badPut.status === 400, `status ${badPut.status}`);

console.log('\n[10] Security headers terpasang');
const res = await fetch(BASE + '/login');
ok('X-Content-Type-Options: nosniff', res.headers.get('x-content-type-options') === 'nosniff');
ok('X-Frame-Options: DENY', res.headers.get('x-frame-options') === 'DENY');
ok('Referrer-Policy ada', !!res.headers.get('referrer-policy'));
ok('CSP ada & mengizinkan koneksi Supabase', (res.headers.get('content-security-policy') ?? '').includes('iibqyqcmckjxpixoypjx.supabase.co'));

await cleanup(owner.user);
await cleanup(kasir.user);
await cleanup(intruder.user);
console.log(`\n================ HASIL: ${pass} lulus, ${fail} gagal ================`);
process.exit(fail > 0 ? 1 : 0);
