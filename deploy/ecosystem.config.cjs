/**
 * PM2 ecosystem — posspace microservices di VPS Hostinger.
 * Dua proses: web (frontend SvelteKit) + api (gateway microservices).
 * Jalankan: pm2 start ecosystem.config.cjs && pm2 save
 *
 * Catatan stabilitas (mencegah 502 / ERR_CONNECTION_RESET):
 *  - kill_timeout: grace period untuk request yang sedang berjalan saat
 *    reload/restart. Default PM2 hanya 1,6s lalu SIGKILL → koneksi browser
 *    terputus paksa (ERR_CONNECTION_RESET). Nilai besar memberi waktu SSR
 *    selesai sebelum worker mati.
 *  - restart_delay: jeda antar restart saat crash — mencegah crash-loop yang
 *    menebas seluruh koneksi.
 *  - max_memory_restart: batas RSS. Sesuaikan dengan RAM VPS + swap;
 *    terlalu kecil = restart terus-menerus (intermittent error).
 *  - instances web: naikkan jika RAM cukup (≈350-450MB per worker).
 */
const path = require('path');
const os = require('os');

// RAM-aware sizing: VPS kecil mudah OOM (proses dibunuh kernel → 502).
// Aturan: 2 worker web HANYA bila RAM >= 3GB. Pada VPS 1-2GB (umum di
// Hostinger), 1 worker + api sudah ~600MB; 2 worker × 512MB + api 400MB
// = ~1.4GB+ dan kernel OOM-killer bisa menebas KEDUA worker sekaligus,
// yang menghasilkan jendela 502 selama beberapa detik. Satu worker lebih
// aman: restart-nya pendek (1-2 dtk) dan nginx proxy_next_upstream
// menutup sisanya.
const totalMemMB = Math.floor(os.totalmem() / 1024 / 1024);
const small = totalMemMB < 3072;
const webInstances = Number(process.env.WEB_INSTANCES || 0) || (small ? 1 : 2);
// Batas memori dibuat cukup lega: SSR SvelteKit + klien Supabase per request
// nyaman di 350-450MB RSS saat kena burst crawler. Cap terlalu rendah
// (mis. 300MB) membuat PM2 me-restart worker tiap beberapa menit dan
// membuka jendela 502 singkat. Swap 2G dari init-server.sh menyerap lonjakan.
const webMem = small ? '480M' : '600M';
const apiMem = small ? '280M' : '400M';

const root = path.resolve(__dirname, '..');

module.exports = {
	apps: [
		{
			name: 'posspace-web',
			cwd: root,
			script: 'build/index.js',
			env: { NODE_ENV: 'production', PORT: 3000, API_UPSTREAM: 'http://127.0.0.1:3001' },
			instances: webInstances, // cluster — disesuaikan RAM (WEB_INSTANCES override)
			exec_mode: 'cluster',
			max_memory_restart: webMem,
			kill_timeout: 15_000, // biarkan in-flight SSR selesai sebelum stop
			listen_timeout: 10_000, // waktu worker baru untuk mulai listen saat reload (build berat bisa lambat)
			restart_delay: 500,
			min_uptime: '10s',
			max_restarts: 10,
			exp_backoff_restart_delay: 100,
			time: true,
			merge_logs: true,
			out_file: '/var/log/posspace/web-out.log',
			error_file: '/var/log/posspace/web-err.log'
		},
		{
			name: 'posspace-api',
			cwd: path.join(root, 'apps/api'),
			script: 'dist/index.js',
			env: { NODE_ENV: 'production', PORT: 3001, HOST: '127.0.0.1' },
			instances: 1,
			max_memory_restart: apiMem,
			kill_timeout: 10_000,
			restart_delay: 500,
			min_uptime: '10s',
			max_restarts: 10,
			exp_backoff_restart_delay: 100,
			time: true,
			merge_logs: true,
			out_file: '/var/log/posspace/api-out.log',
			error_file: '/var/log/posspace/api-err.log'
		}
	]
};
