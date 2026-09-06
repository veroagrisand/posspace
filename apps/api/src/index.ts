import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { env, isSupabaseConfigured } from './env.js';
import { service } from './db.js';
import { auth, accessLog, onError, notFound } from './middleware.js';
import { authService } from './services/auth.js';
import { posDataService, transactionsService, reportsService } from './services/pos.js';
import { paymentService } from './services/payment.js';
import { shopService, subscriptionService } from './services/shop.js';
import { cmsService } from './services/cms.js';
import { adminService } from './services/admin.js';

/**
 * posspace API Gateway — entry backend microservices.
 *
 * Arsitektur:
 *  - Satu proses gateway (Hono, ringan) yang me-mount tiap service sebagai modul
 *    terpisah; setiap service bisa diekstrak menjadi proses/container sendiri
 *    tanpa mengubah kode internalnya (cukup pindah mount-nya).
 *  - Frontend (SvelteKit) hanya memuat halaman + proxy /api → gateway ini.
 *  - Optimasi latensi: klien Supabase di-reuse, JWT di-cache, kompresi gzip/brotli.
 */
const app = new Hono();

app.use('*', compress({ threshold: 1024 }));
app.use('*', auth, accessLog);

// Liveness: tidak menyentuh database, aman dipakai PM2/Nginx.
app.get('/health', (c) => c.json({ ok: true, service: 'posspace-api', ts: Date.now() }));

// Readiness: memastikan gateway masih bisa menjangkau database sebelum
// menerima traffic penuh setelah reload/deploy.
app.get('/ready', async (c) => {
	if (!isSupabaseConfigured) return c.json({ ok: true, service: 'posspace-api', mode: 'demo' });
	const { error } = await service().from('plans').select('id').limit(1);
	if (error) return c.json({ ok: false, service: 'posspace-api', reason: 'database_unavailable' }, 503);
	return c.json({ ok: true, service: 'posspace-api', ts: Date.now() });
});

// ===== Microservices =====
app.route('/api/auth', authService);
app.route('/api/data', posDataService);
app.route('/api/transactions', transactionsService);
app.route('/api/reports', reportsService);
app.route('/api/payments', paymentService);
app.route('/api/shop', shopService);
app.route('/api/subscription', subscriptionService);
app.route('/api/cms', cmsService);
app.route('/api/admin', adminService);

app.notFound(notFound);
app.onError(onError);

const PORT = Number(env.PORT ?? 3001);
const HOST = env.HOST ?? '0.0.0.0';

serve({ fetch: app.fetch, port: PORT, hostname: HOST }, (info) => {
	console.log(`[posspace-api] gateway berjalan di http://${HOST}:${info.port}`);
	if (typeof process.send === 'function') process.send('ready');
});

// ===== Retensi otomatis access_logs =====
// access_logs ditulis 2x per request (web hooks + middleware API) dan tanpa
// retensi otomatis tabel membesar tanpa batas → insert/query DB melambat →
// seluruh situs melambat & kena 502. Scheduler ini memakai fungsi khusus
// service_role (public.purge_access_logs_cron) supaya jalur purge admin
// (is_platform_admin) tidak dilemahkan.
const ACCESS_LOG_RETENTION_DAYS = Number(env.ACCESS_LOG_RETENTION_DAYS ?? 7);
const PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000;

async function purgeAccessLogs(): Promise<void> {
	if (!isSupabaseConfigured || purgeRunning) return;
	purgeRunning = true;
	try {
		const { data, error } = await service().rpc('purge_access_logs_cron', {
			p_days: ACCESS_LOG_RETENTION_DAYS
		});
		if (error) throw error;
		console.log(`[retensi] access_logs dibersihkan (retensi ${ACCESS_LOG_RETENTION_DAYS} hari): ${data ?? 0} baris`);
	} catch (e) {
		console.warn('[retensi] purge access_logs gagal:', e);
	} finally {
		purgeRunning = false;
	}
}

let purgeRunning = false;

// Jalan pertama ~30 detik setelah boot, lalu tiap 6 jam.
setTimeout(() => {
	void purgeAccessLogs();
}, 30_000);
setInterval(() => {
	void purgeAccessLogs();
}, PURGE_INTERVAL_MS);
