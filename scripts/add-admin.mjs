// ============================================================
// Daftarkan akun sebagai Platform Admin (owner SaaS).
// Penggunaan: node scripts/add-admin.mjs <email> [password]
//   - Jika user belum ada, user dibuat (password default: Admin1234!)
//   - Jika sudah ada, cukup ditambahkan ke tabel platform_admins
// ============================================================
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
	readFileSync('.env', 'utf8')
		.split('\n')
		.filter((l) => l && !l.startsWith('#') && l.includes('='))
		.map((l) => [l.split('=')[0].trim(), l.split('=').slice(1).join('=').trim()])
);

const email = process.argv[2]?.trim().toLowerCase();
const password = process.argv[3] ?? 'Admin1234!';

if (!email) {
	console.error('Gunakan: node scripts/add-admin.mjs <email> [password]');
	process.exit(1);
}

const SERVICE = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
	auth: { persistSession: false }
});

let userId = null;

const { data: page } = await SERVICE.auth.admin.listUsers({ page: 1, perPage: 1000 });
const existing = (page?.users ?? []).find((u) => u.email?.toLowerCase() === email);
if (existing) {
	userId = existing.id;
	console.log(`✓ User sudah ada: ${email}`);
} else {
	const { data: created, error: createErr } = await SERVICE.auth.admin.createUser({
		email,
		password,
		email_confirm: true
	});
	if (createErr) {
		console.error(`✗ Gagal membuat user: ${createErr.message}`);
		process.exit(1);
	}
	userId = created.user.id;
	console.log(`✓ User dibuat: ${email} (password: ${password})`);
}

const { error } = await SERVICE.from('platform_admins').insert({ user_id: userId });
if (error) {
	console.error(`✗ Gagal menambahkan admin: ${error.message}`);
	process.exit(1);
}

console.log('✓ Ditambahkan ke platform_admins');
console.log(`Sekarang login di /login lalu otomatis diarahkan ke dashboard /admin.`);