import { json } from '@sveltejs/kit';

/** Liveness web: tidak menjalankan SSR, auth, atau query database. */
export function GET() {
	return json(
		{ ok: true, service: 'posspace-web', ts: Date.now() },
		{ headers: { 'cache-control': 'no-store' } }
	);
}
