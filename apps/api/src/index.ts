import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { env } from './env.js';
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

app.get('/health', (c) => c.json({ ok: true, service: 'posspace-api', ts: Date.now() }));

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
});