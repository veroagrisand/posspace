// ============================================================
// Agen cetak struk posspace — untuk printer jaringan (TCP 9100)
// atau printer USB yang terpasang di PC kasir (mode 'printer').
//
// Cara pakai:
//   node agent.js                     # mendengarkan di 127.0.0.1:9123
//   PRINTER_HOST=192.168.1.50 PRINTER_PORT=9100 node agent.js
//
// Aplikasi kasir mengirim: POST http://127.0.0.1:9123/print
//   { "lines": ["..."], "paperWidth": "80" }
// ============================================================

const http = require('http');
const net = require('net');

const PORT = Number(process.env.AGENT_PORT || 9123);
const PRINTER_HOST = process.env.PRINTER_HOST || '127.0.0.1';
const PRINTER_PORT = Number(process.env.PRINTER_PORT || 9100);
const COLUMNS = { 58: 32, 80: 42 };

function escPosBytes(lines, width) {
	const out = [];
	out.push(0x1b, 0x40); // init printer
	out.push(0x1b, 0x61, 0x00); // align left
	for (const line of lines) {
		const text = String(line ?? '').slice(0, COLUMNS[width] || 42);
		for (const ch of text) {
			const code = ch.charCodeAt(0);
			out.push(code > 0x7f ? 0x20 : code);
		}
		out.push(0x0a);
	}
	out.push(0x1b, 0x64, 0x03); // feed 3 lines
	out.push(0x1d, 0x56, 0x42, 0x00); // partial cut
	return Buffer.from(out);
}

function printToNetwork(lines, width) {
	return new Promise((resolve, reject) => {
		const socket = net.connect(PRINTER_PORT, PRINTER_HOST, () => {
			socket.write(escPosBytes(lines, width), (err) => {
				if (err) {
					socket.destroy();
					return reject(err);
				}
				socket.end();
				setTimeout(resolve, 200);
			});
		});
		socket.on('error', (err) => reject(err));
	});
}

function readBody(req) {
	return new Promise((resolve) => {
		let data = '';
		req.on('data', (c) => (data += c));
		req.on('end', () => {
			try {
				resolve(JSON.parse(data));
			} catch {
				resolve({});
			}
		});
	});
}

const server = http.createServer(async (req, res) => {
	if (req.method === 'OPTIONS') {
		res.writeHead(204, {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type'
		});
		return res.end();
	}

	if (req.method !== 'POST' || req.url !== '/print') {
		res.writeHead(404, { 'Content-Type': 'text/plain' });
		return res.end('not found');
	}

	const body = await readBody(req);
	const lines = Array.isArray(body.lines) ? body.lines : [];
	const width = body.paperWidth === '58' ? '58' : '80';

	try {
		await printToNetwork(lines, width);
		res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
		res.end(JSON.stringify({ ok: true, printer: `${PRINTER_HOST}:${PRINTER_PORT}` }));
	} catch (err) {
		res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
		res.end(JSON.stringify({ ok: false, error: String(err.message || err) }));
	}
});

server.listen(PORT, '127.0.0.1', () => {
	console.log(`[posspace print-agent] siap di http://127.0.0.1:${PORT} → printer ${PRINTER_HOST}:${PRINTER_PORT}`);
});