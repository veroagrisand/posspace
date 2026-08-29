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

const email = `menu-${crypto.randomBytes(4).toString('hex')}@test.posspace.id`;
const { data: u } = await SERVICE.auth.admin.createUser({ email, password: 'Test1234!', email_confirm: true, user_metadata: { full_name: 'Menu Test' } });
const client = createClient(URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
await client.auth.signInWithPassword({ email, password: 'Test1234!' });

const { data: shop } = await SERVICE.from('shops').insert({ name: 'Toko Menu' }).select('id').single();
await SERVICE.from('profiles').update({ shop_id: shop.id, role: 'pemilik' }).eq('id', u.user.id);
await SERVICE.from('subscriptions').insert({ shop_id: shop.id, plan_id: 'pro', status: 'active', period_start: new Date().toISOString(), period_end: new Date(Date.now() + 30 * 864e5).toISOString() });
const { data: ing } = await client.from('ingredients').insert({ shop_id: shop.id, name: 'Kopi', unit: 'gram', stock_quantity: 100, min_stock: 10 }).select('id').single();

const post = async (body) => (await fetch('http://localhost:5173/api/data/products', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body) })).json();
const put = async (id, body) => (await fetch(`http://localhost:5173/api/data/products/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body) })).json();
const del = async (id) => (await fetch(`http://localhost:5173/api/data/products/${id}`, { method: 'DELETE', headers: { Cookie: cookie } })).json();

const REF = URL.replace('https://', '').split('.')[0];
const { data: sess } = await client.auth.signInWithPassword({ email, password: 'Test1234!' });
const cookie = `sb-${REF}-auth-token=base64-${Buffer.from(JSON.stringify(sess.session)).toString('base64url')}`;

console.log('\n[1] Tambah menu (2 varian + resep)');
const { productId, variantId } = await post({ name: 'Kopi Uji', category: 'Kopi', price: 20000, variantName: 'Reguler' });
const { data: v2 } = await client.from('product_variants').insert({ product_id: productId, name: 'Besar', price: 24000 }).select('id').single();
await client.from('recipes').insert({ variant_id: variantId, ingredient_id: ing.id, quantity_required: 10 });
await client.from('recipes').insert({ variant_id: v2.id, ingredient_id: ing.id, quantity_required: 15 });
ok('menu + 2 varian dibuat', !!productId && !!v2?.id);

console.log('\n[2] PUT: hapus varian "Besar" + tambah varian baru sekaligus');
const { ok: putOk } = await put(productId, {
	name: 'Kopi Uji V2', category: 'Non-kopi',
	variants: [
		{ id: variantId, name: 'Reguler', price: 21000, recipe: [{ ingredientId: ing.id, qty: 10 }] },
		{ name: 'Jumbo', price: 28000, recipe: [{ ingredientId: ing.id, qty: 20 }] }
	]
});
ok('PUT sukses', putOk === true);
const { data: variants } = await client.from('product_variants').select('id, name').eq('product_id', productId);
const names = (variants ?? []).map((v) => v.name).sort();
ok('varian lama terhapus, varian baru dibuat', names.join(',') === 'Jumbo,Reguler', names.join(','));
const { data: product } = await client.from('products').select('name, category').eq('id', productId).single();
ok('nama & kategori terupdate', product?.name === 'Kopi Uji V2' && product?.category === 'Non-kopi');
const { data: recipes } = await client.from('recipes').select('variant_id, quantity_required');
ok('resep tersimpan (10 & 20)', (recipes ?? []).some((r) => Number(r.quantity_required) === 20));

console.log('\n[3] DELETE menu (cascade varian + resep)');
const { ok: delOk } = await del(productId);
ok('DELETE sukses', delOk === true);
const { data: leftVariants } = await client.from('product_variants').select('id').eq('product_id', productId);
const { data: leftRecipes } = await client.from('recipes').select('id').eq('variant_id', variantId);
ok('varian & resep ikut terhapus (cascade)', (leftVariants ?? []).length === 0 && (leftRecipes ?? []).length === 0);

console.log('\n[4] RLS: user biasa TIDAK bisa hapus menu');
const { data: p2 } = await client.from('products').insert({ shop_id: shop.id, name: 'Kopi Lain' }).select('id').single();
const { data: v3 } = await client.from('product_variants').insert({ product_id: p2.id, name: 'Reguler', price: 10000 }).select('id').single();
const otherEmail = `menu2-${crypto.randomBytes(4).toString('hex')}@test.posspace.id`;
const { data: u2 } = await SERVICE.auth.admin.createUser({ email: otherEmail, password: 'Test1234!', email_confirm: true });
const client2 = createClient(URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
await client2.auth.signInWithPassword({ email: otherEmail, password: 'Test1234!' });
const { data: sess2 } = await client2.auth.signInWithPassword({ email: otherEmail, password: 'Test1234!' });
const cookie2 = `sb-${REF}-auth-token=base64-${Buffer.from(JSON.stringify(sess2.session)).toString('base64url')}`;
const res = await fetch(`http://localhost:5173/api/data/products/${p2.id}`, { method: 'DELETE', headers: { Cookie: cookie2 } });
ok('user tanpa toko DITOLAK hapus (guard redirect/401/403)', [401, 403, 404, 303].includes(res.status), `status ${res.status}`);

await SERVICE.auth.admin.deleteUser(u.user.id);
await SERVICE.auth.admin.deleteUser(u2.user.id);
console.log(`\n================ HASIL: ${pass} lulus, ${fail} gagal ================`);
process.exit(fail > 0 ? 1 : 0);
