import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { isSupabaseConfigured } from '$lib/server/supabase';
import { env } from '$env/dynamic/private';

/**
 * Proxy /api/* → API Gateway (apps/api).
 *
 * Frontend TIDAK lagi berisi logika bisnis — semua operasi diteruskan ke
 * backend microservices. Header Authorization (JWT sesi) ditambahkan di sini
 * dari session cookie SSR; gateway memverifikasi & mengotorisasi.
 * Latensi: keep-alive undici + gateway cache JWT membuat hop ini murah.
 */
const API_UPSTREAM = (env.API_UPSTREAM ?? 'http://127.0.0.1:3001').replace(/\/+$/, '');

async function proxy(event: RequestEvent) {
	if (!isSupabaseConfigured) {
		// Mode demo (tanpa backend): API tidak tersedia — halaman demo memakai store lokal.
		return json({ message: 'API_NOT_CONFIGURED' }, { status: 503 });
	}

	// Token dari sesi SSR (sudah dimuat eager oleh hooks.server.ts).
	const token = event.locals.accessToken;

	// Gateway memakai prefix /api yang sama — teruskan path apa adanya.
	const target = new URL(`${event.url.pathname}${event.url.search}`, API_UPSTREAM);

	const headers = new Headers();
	const contentType = event.request.headers.get('content-type');
	if (contentType) headers.set('content-type', contentType);
	headers.set('x-forwarded-host', event.url.host);
	const forwardedProto = event.request.headers.get('x-forwarded-proto');
	if (forwardedProto) headers.set('x-forwarded-proto', forwardedProto);
	// Prioritas: Authorization eksplisit (klien API/mobile) → token sesi SSR (browser).
	const explicitAuth = event.request.headers.get('authorization');
	if (explicitAuth) headers.set('authorization', explicitAuth);
	else if (token) headers.set('authorization', `Bearer ${token}`);

	const hasBody = event.request.method !== 'GET' && event.request.method !== 'HEAD';
	const body = hasBody ? await event.request.arrayBuffer() : undefined;

	let upstream: Response;
	try {
		upstream = await fetch(target, {
			method: event.request.method,
			headers,
			body,
			redirect: 'manual'
		});
	} catch {
		return json({ message: 'API_UNAVAILABLE' }, { status: 503 });
	}

	const resBody = await upstream.arrayBuffer();
	const resHeaders = new Headers();
	const contentTypeOut = upstream.headers.get('content-type');
	if (contentTypeOut) resHeaders.set('content-type', contentTypeOut);
	const disposition = upstream.headers.get('content-disposition');
	if (disposition) resHeaders.set('content-disposition', disposition);

	return new Response(resBody, { status: upstream.status, headers: resHeaders });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;