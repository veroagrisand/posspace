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
const SERVICE = createClient(URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let pass = 0;
let fail = 0;

function ok(name, cond, extra = '') {
	if (cond) {
		pass++;
		console.log(`  ✅ ${name} ${extra}`);
	} else {
		fail++;
		console.log(`  ❌ ${name} ${extra}`);
	}
}

async function makeUser(name) {
	const email = `e2e-${crypto.randomBytes(4).toString('hex')}@test.posspace.id`;
	const { data } = await SERVICE.auth.admin.createUser({
		email,
		password: 'Test1234!',
		email_confirm: true,
		user_metadata: { full_name: name, shop_name: `Toko ${name}` }
	});
	const client = createClient(URL, env.SUPABASE_ANON_KEY, {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
	});
	await client.auth.signInWithPassword({ email, password: 'Test1234!' });
	return { email, user: data.user, client };
}

async function cleanup(user) {
	try {
		await SERVICE.auth.admin.deleteUser(user.id);
	} catch {
		/* ignore */
	}
}

const { email, user, client } = await makeUser('Utama');
console.log('\n[1] Registrasi user + trigger profil');
ok('user dibuat', !!user, email);
const { data: profile } = await client.from('profiles').select('id, full_name, role, shop_id').eq('id', user.id).single();
ok('trigger membuat profil pemilik', !!profile && profile.role === 'pemilik' && profile.shop_id === null);

console.log('\n[2] Subscribe (toko + subscription pending + invoice)');
const { data: shop } = await SERVICE.from('shops').insert({ name: 'Toko Utama' }).select('id').single();
ok('toko dibuat', !!shop);
await SERVICE.from('profiles').update({ shop_id: shop.id, role: 'pemilik' }).eq('id', user.id);
const merchantOrderId = `PS-SUB-TEST-${Date.now()}`;
const { data: sub } = await SERVICE.from('subscriptions').insert({ shop_id: shop.id, plan_id: 'pro', status: 'pending' }).select('id').single();
ok('subscription pending', !!sub);
const { data: invoice } = await SERVICE
	.from('invoices')
	.insert({ subscription_id: sub.id, shop_id: shop.id, plan_id: 'pro', amount: 349000, merchant_order_id: merchantOrderId, status: 'pending' })
	.select('id')
	.single();
ok('invoice dibuat', !!invoice);

const { error: deniedErr } = await client.rpc('process_transaction', {
	p_shift_id: null,
	p_payment_method: 'cash',
	p_items: [{ variantId: '00000000-0000-0000-0000-000000000000', qty: 1 }]
});
ok('transaksi DITOLAK tanpa subscription aktif', String(deniedErr?.message ?? '').includes('NO_ACTIVE_SUBSCRIPTION'), deniedErr?.message ?? '');

console.log('\n[3] Aktivasi langganan (manual)');
await SERVICE.from('invoices').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', invoice.id);
await SERVICE
	.from('subscriptions')
	.update({ status: 'active', period_start: new Date().toISOString(), period_end: new Date(Date.now() + 30 * 864e5).toISOString() })
	.eq('id', sub.id);
const { data: subCheck } = await client.from('subscriptions').select('status').eq('shop_id', shop.id).single();
ok('subscription terlihat & aktif oleh pemilik', subCheck?.status === 'active');

console.log('\n[4] Bahan & menu (RLS)');
const { data: ing1 } = await client.from('ingredients').insert({ shop_id: shop.id, name: 'Biji kopi test', unit: 'gram', stock_quantity: 500, min_stock: 100 }).select('id').single();
const { data: ing2 } = await client.from('ingredients').insert({ shop_id: shop.id, name: 'Susu test', unit: 'ml', stock_quantity: 1000, min_stock: 200 }).select('id').single();
ok('2 bahan dibuat', !!ing1 && !!ing2);
const { data: product } = await client.from('products').insert({ shop_id: shop.id, name: 'Kopi Test', category: 'Kopi' }).select('id').single();
const { data: variant } = await client.from('product_variants').insert({ product_id: product.id, name: 'Reguler', price: 20000 }).select('id').single();
await client.from('recipes').insert([
	{ variant_id: variant.id, ingredient_id: ing1.id, quantity_required: 10 },
	{ variant_id: variant.id, ingredient_id: ing2.id, quantity_required: 100 }
]);
ok('produk + varian + resep BOM dibuat', !!product && !!variant);

console.log('\n[5] Transaksi & potong stok otomatis (atomik)');
const { data: txn, error: txnErr } = await client.rpc('process_transaction', {
	p_shift_id: null,
	p_payment_method: 'cash',
	p_cash_received: 50000,
	p_items: [{ variantId: variant.id, qty: 2 }]
});
ok('transaksi berhasil', !txnErr && !!txn?.receiptNo, txnErr ? String(txnErr.message) : `stuk ${txn.receiptNo} total ${txn.total}`);
const { data: stock1 } = await client.from('ingredients').select('stock_quantity').eq('id', ing1.id).single();
const { data: stock2 } = await client.from('ingredients').select('stock_quantity').eq('id', ing2.id).single();
ok('stok kopi terpotong 2×10g', Number(stock1?.stock_quantity) === 480, `${stock1?.stock_quantity}`);
ok('stok susu terpotong 2×100ml', Number(stock2?.stock_quantity) === 800, `${stock2?.stock_quantity}`);
const { data: moves } = await client.from('stock_movements').select('movement_type, quantity_change, note').eq('ingredient_id', ing1.id);
ok('riwayat pergerakan "sale" tercatat', (moves ?? []).some((m) => m.movement_type === 'sale' && Number(m.quantity_change) === -20));

console.log('\n[6] Stok menipis → peringatan');
const { data: low } = await client.from('ingredients').select('id, stock_quantity').lte('stock_quantity', 100);
ok('query low stock berjalan (RLS)', Array.isArray(low));

console.log('\n[7] Opname & koreksi selisih');
const { data: opname } = await client
	.from('stock_opnames')
	.insert({ ingredient_id: ing2.id, system_quantity: 800, actual_quantity: 780, difference: -20, status: 'draft' })
	.select('id')
	.single();
const { data: opRes, error: opErr } = await client.rpc('approve_opname', { p_opname_id: opname.id, p_reason: 'Tumpah saat shift' });
ok('opname disetujui & stok dikoreksi', !opErr && opRes?.ok === true, opErr ? String(opErr.message) : `selisih ${opRes?.difference}`);

console.log('\n[8] Isolasi RLS antar toko');
const { user: user2, client: other } = await makeUser('Lain');
const { data: shop2 } = await SERVICE.from('shops').insert({ name: 'Toko Lain' }).select('id').single();
await SERVICE.from('profiles').update({ shop_id: shop2.id }).eq('id', user2.id);
const { data: foreignProducts } = await other.from('products').select('id').eq('shop_id', shop.id);
ok('user toko lain TIDAK bisa baca produk toko ini', (foreignProducts ?? []).length === 0);
const { data: foreignIng } = await other.from('ingredients').select('id').eq('shop_id', shop.id);
ok('user toko lain TIDAK bisa baca bahan toko ini', (foreignIng ?? []).length === 0);
const { error: foreignTxnErr } = await other.rpc('process_transaction', {
	p_shift_id: null,
	p_payment_method: 'cash',
	p_items: [{ variantId: variant.id, qty: 1 }]
});
const foreignMsg = String(foreignTxnErr?.message ?? '');
ok(
	'transaksi pakai varian toko lain DITOLAK (tanpa sub: NO_ACTIVE_SUBSCRIPTION, atau INVALID_VARIANT)',
	foreignMsg.includes('NO_ACTIVE_SUBSCRIPTION') || foreignMsg.includes('INVALID_VARIANT'),
	foreignMsg
);

await cleanup(user);
await cleanup(user2);

console.log(`\n================ HASIL: ${pass} lulus, ${fail} gagal ================`);
process.exit(fail > 0 ? 1 : 0);