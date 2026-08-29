// Verifikasi migration 0004: transaksi pending → confirm_payment (idempoten),
// confirm_payment_as_owner (jalur webhook), RLS otp_codes.
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
const ok = (name, cond, extra = '') => {
	cond ? pass++ : fail++;
	console.log(`  ${cond ? '✅' : '❌'} ${name} ${extra}`);
};

async function makeUser(name) {
	const email = `pay-${crypto.randomBytes(4).toString('hex')}@test.posspace.id`;
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
	return { user: data.user, client };
}
const cleanup = async (u) => {
	try {
		await SERVICE.auth.admin.deleteUser(u.id);
	} catch {
		/* ignore */
	}
};

const { user, client } = await makeUser('Pembayaran');
const { data: shop } = await SERVICE.from('shops').insert({ name: 'Toko Pembayaran' }).select('id').single();
await SERVICE.from('profiles').update({ shop_id: shop.id, role: 'pemilik' }).eq('id', user.id);
const { data: sub } = await SERVICE.from('subscriptions').insert({
	shop_id: shop.id,
	plan_id: 'pro',
	status: 'active',
	period_start: new Date().toISOString(),
	period_end: new Date(Date.now() + 30 * 864e5).toISOString()
}).select('id').single();

const { data: ing } = await client.from('ingredients').insert({ shop_id: shop.id, name: 'Kopi pay', unit: 'gram', stock_quantity: 500, min_stock: 100 }).select('id').single();
const { data: product } = await client.from('products').insert({ shop_id: shop.id, name: 'Kopi Pay' }).select('id').single();
const { data: variant } = await client.from('product_variants').insert({ product_id: product.id, name: 'Reguler', price: 20000 }).select('id').single();
await client.from('recipes').insert({ variant_id: variant.id, ingredient_id: ing.id, quantity_required: 10 });

console.log('\n[1] Transaksi PENDING (pembayaran digital belum lunas)');
const { data: pend, error: pendErr } = await client.rpc('process_transaction', {
	p_shift_id: null,
	p_payment_method: 'qris',
	p_items: [{ variantId: variant.id, qty: 2 }],
	p_payment_status: 'pending'
});
ok('transaksi pending dibuat', !pendErr && pend?.status === 'pending', pendErr?.message ?? pend?.receiptNo);
const { data: stockBefore } = await client.from('ingredients').select('stock_quantity').eq('id', ing.id).single();
ok('stok BELUM dipotong saat pending', Number(stockBefore?.stock_quantity) === 500, `stok ${stockBefore?.stock_quantity}`);

console.log('\n[2] confirm_payment (jalur sesi kasir/pemilik)');
const { data: cf, error: cfErr } = await client.rpc('confirm_payment', { p_transaction_id: pend.id });
ok('confirm sukses', !cfErr && cf?.ok === true, cfErr?.message ?? '');
const { data: stockAfter } = await client.from('ingredients').select('stock_quantity').eq('id', ing.id).single();
ok('stok terpotong 2×10g = 480', Number(stockAfter?.stock_quantity) === 480, `stok ${stockAfter?.stock_quantity}`);
const { data: txnRow } = await client.from('transactions').select('status, payment_status').eq('id', pend.id).single();
ok('status transaksi completed/paid', txnRow?.status === 'completed' && txnRow?.payment_status === 'paid');
const { data: moves } = await client.from('stock_movements').select('quantity_change').eq('ingredient_id', ing.id);
ok('riwayat "sale" tercatat sekali', (moves ?? []).filter((m) => Number(m.quantity_change) === -20).length === 1);

console.log('\n[3] Idempoten: confirm ulang');
const { data: cf2 } = await client.rpc('confirm_payment', { p_transaction_id: pend.id });
const { data: stockAfter2 } = await client.from('ingredients').select('stock_quantity').eq('id', ing.id).single();
ok('confirm kedua → alreadyCompleted, stok tidak dobel', cf2?.alreadyCompleted === true && Number(stockAfter2?.stock_quantity) === 480);

console.log('\n[4] confirm_payment_as_owner (jalur webhook Nusapay, service role)');
const { data: pend2 } = await client.rpc('process_transaction', {
	p_shift_id: null,
	p_payment_method: 'qris',
	p_items: [{ variantId: variant.id, qty: 1 }],
	p_payment_status: 'pending'
});
const { data: webhookRes, error: webhookErr } = await SERVICE.rpc('confirm_payment_as_owner', {
	p_transaction_id: pend2.id,
	p_owner_id: user.id
});
ok('webhook confirm sukses', !webhookErr && webhookRes?.ok === true, webhookErr?.message ?? '');
const { data: stockAfter3 } = await client.from('ingredients').select('stock_quantity').eq('id', ing.id).single();
ok('stok terpotong 1×10g = 470', Number(stockAfter3?.stock_quantity) === 470, `stok ${stockAfter3?.stock_quantity}`);

console.log('\n[5] RLS otp_codes (klien TIDAK boleh akses)');
const { data: otpRead, error: otpReadErr } = await client.from('otp_codes').select('*');
ok('klien anon TIDAK bisa baca otp_codes (RLS kosongkan baris)', !otpReadErr && (otpRead ?? []).length === 0, `baris ${otpRead?.length ?? 0}`);
const { data: otpWrite, error: otpWriteErr } = await client.from('otp_codes').insert({ email: 'x@y.id', purpose: 'register', code_hash: 'abc', expires_at: new Date().toISOString() });
ok('klien TIDAK bisa menulis otp_codes', !!otpWriteErr || !otpWrite);

await cleanup(user);

console.log(`\n================ HASIL: ${pass} lulus, ${fail} gagal ================`);
process.exit(fail > 0 ? 1 : 0);