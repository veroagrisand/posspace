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
// Aturan: 1 worker hanya bila RAM sangat kecil (<1.5GB); di atasnya 2 worker
// agar restart salah satu worker TIDAK memutus layanan. Limit memori dibuat
// lebih rendah pada mesin kecil agar tidak menekan OS.
const totalMemMB = Math.floor(os.totalmem() / 1024 / 1024);
const small = totalMemMB < 1536;
const webInstances = Number(process.env.WEB_INSTANCES || 0) || (small ? 1 : 2);
const webMem = small ? '300M' : '512M';
const apiMem = small ? '250M' : '400M';

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
			listen_timeout: 5_000, // waktu worker baru untuk mulai listen saat reload
			restart_delay: 1_000,
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
			restart_delay: 1_000,
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
