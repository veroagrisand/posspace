/**
 * PM2 ecosystem — posspace microservices di VPS Hostinger.
 * Dua proses: web (frontend SvelteKit) + api (gateway microservices).
 * Jalankan: pm2 start ecosystem.config.cjs && pm2 save
 */
const path = require('path');

const root = path.resolve(__dirname, '..');

module.exports = {
	apps: [
		{
			name: 'posspace-web',
			cwd: root,
			script: 'build/index.js',
			env: { NODE_ENV: 'production', PORT: 3000, HOST: '127.0.0.1', API_UPSTREAM: 'http://127.0.0.1:3001' },
			instances: 2, // cluster — naikkan sesuai RAM VPS
			exec_mode: 'cluster',
			max_memory_restart: '400M',
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
			max_memory_restart: '300M',
			time: true,
			merge_logs: true,
			out_file: '/var/log/posspace/api-out.log',
			error_file: '/var/log/posspace/api-err.log'
		}
	]
};