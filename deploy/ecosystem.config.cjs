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

const root = path.resolve(__dirname, '..');
const webInstances = Number(process.env.WEB_INSTANCES || 2);

module.exports = {
	apps: [
		{
			name: 'posspace-web',
			cwd: root,
			script: 'build/index.js',
			env: { NODE_ENV: 'production', PORT: 3000, API_UPSTREAM: 'http://127.0.0.1:3001' },
			instances: webInstances, // cluster — default 2 (naikkan jika RAM VPS besar)
			exec_mode: 'cluster',
			max_memory_restart: '512M',
			kill_timeout: 15_000, // biarkan in-flight SSR selesai sebelum stop
			listen_timeout: 5_000, // waktu worker baru untuk mulai listen saat reload
			restart_delay: 3_000,
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
			max_memory_restart: '400M',
			kill_timeout: 10_000,
			restart_delay: 3_000,
			time: true,
			merge_logs: true,
			out_file: '/var/log/posspace/api-out.log',
			error_file: '/var/log/posspace/api-err.log'
		}
	]
};