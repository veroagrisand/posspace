/**
 * Rate limiter in-memory (sliding window).
 * Berlaku per instance — cukup untuk VPS single-node.
 * Key umum: `email:${email}`, `ip:${ip}`.
 */

const buckets = new Map<string, number[]>();

const WINDOW_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 10_000;

/** true jika masih dalam batas; false jika harus ditolak. */
export function rateLimit(key: string, limit: number, windowMs: number = WINDOW_MS): boolean {
	const now = Date.now();
	const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
	if (arr.length >= limit) {
		buckets.set(key, arr);
		return false;
	}
	arr.push(now);
	buckets.set(key, arr);

	// cegah kebocoran memori: bersihkan saat terlalu besar
	if (buckets.size > MAX_ENTRIES) {
		for (const [k, times] of buckets) {
			if (times.length === 0 || now - times[times.length - 1] > WINDOW_MS) buckets.delete(k);
		}
	}
	return true;
}

/** Ambil IP klien (hanya untuk rate limiting — bukan otorisasi). */
export function clientIp(headers: Headers): string {
	const fwd = headers.get('x-forwarded-for');
	if (fwd) return fwd.split(',')[0].trim();
	return headers.get('x-real-ip') ?? 'unknown';
}