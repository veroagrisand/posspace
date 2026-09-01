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

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`  ${cond ? '✅' : '❌'} ${name} ${extra}`); };

const email = `rls-${crypto.randomBytes(4).toString('hex')}@test.posspace.id`;
const { data: u } = await SERVICE.auth.admin.createUser({ email, password: 'Test1234!', email_confirm: true });
const client = createClient(URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
await client.auth.signInWithPassword({ email, password: 'Test1234!' });
const { data: sess } = await client.auth.signInWithPassword({ email, password: 'Test1234!' });
const cookie = `sb-${REF}-auth-token=base64-${Buffer.from(JSON.stringify(sess.session)).toString('base64url')}`;

// user ini TIDAK punya toko → API gateway menolak dengan 403 SHOP_REQUIRED
const res = await fetch('http://localhost:5173/api/data/products/00000000-0000-0000-0000-000000000000', {
	method: 'DELETE',
	headers: { Cookie: cookie },
	redirect: 'manual'
});
ok('user tanpa toko DITOLAK hapus menu (403)', res.status === 403, `status ${res.status} → ${res.headers.get('location') ?? ''}`);
const postRes = await fetch('http://localhost:5173/api/data/products', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json', Cookie: cookie },
	body: JSON.stringify({ name: 'X' }),
	redirect: 'manual'
});
ok('user tanpa toko DITOLAK tambah menu (403)', postRes.status === 403, `status ${postRes.status}`);

await SERVICE.auth.admin.deleteUser(u.user.id);
console.log(`\n================ HASIL: ${pass} lulus, ${fail} gagal ================`);
process.exit(fail > 0 ? 1 : 0);
