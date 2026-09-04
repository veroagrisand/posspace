// ===== Pencetakan struk di kasir =====
// Tiga metode:
//  - 'webusb'  : printer thermal ESC/POS via USB (Chrome/Edge, tanpa driver)
//  - 'browser' : printer sistem via dialog cetak browser (CSS struk)
//  - 'agent'   : agen lokal (tools/print-agent) yang meneruskan ke printer
//                jaringan/USB (TCP 9100 atau USB di PC kasir)

export type PrinterType = 'webusb' | 'browser' | 'agent';

export type PrinterSettings = {
	printerType: PrinterType;
	paperWidth: '58' | '80';
	agentUrl: string;
};

export interface ReceiptInput {
	shop: { name: string; address: string; phone: string };
	receiptNo: string;
	dateLabel: string;
	timeLabel: string;
	cashier: string;
	items: { productName: string; variant: string; qty: number; unitPrice: number; lineTotal: number }[];
	subtotal: number;
	tax: number;
	total: number;
	paymentMethod: string;
	channel?: string;
	gatewayRef?: string;
	cashReceived?: number;
	changeAmount?: number;
}

const COLUMNS: Record<'58' | '80', number> = { '58': 32, '80': 42 };
const METHOD_LABELS: Record<string, string> = { cash: 'Tunai', qris: 'QRIS', debit: 'Kartu Debit' };

function rupiah(n: number): string {
	return 'Rp' + Math.round(n).toLocaleString('id-ID');
}

/** Susun baris-baris teks struk sesuai lebar kertas. */
export function buildReceiptLines(input: ReceiptInput, paperWidth: '58' | '80'): string[] {
	const w = COLUMNS[paperWidth];
	const center = (s: string) => {
		const t = s.slice(0, w);
		const pad = Math.max(0, Math.floor((w - t.length) / 2));
		return ' '.repeat(pad) + t;
	};
	const row = (left: string, right: string) => {
		const l = left.slice(0, Math.max(1, w - 2));
		const r = right.slice(0, w - l.length - 1);
		return l + ' '.repeat(Math.max(1, w - l.length - r.length)) + r;
	};
	const sep = '-'.repeat(w);
	const methodLabel = METHOD_LABELS[input.paymentMethod] ?? input.paymentMethod;

	const lines: string[] = [];
	lines.push(center(input.shop.name || 'posspace'));
	if (input.shop.address) lines.push(center(input.shop.address.slice(0, w)));
	if (input.shop.phone) lines.push(center(input.shop.phone.slice(0, w)));
	lines.push(sep);
	lines.push(row('No. ' + input.receiptNo, input.timeLabel));
	lines.push(row(input.dateLabel, 'Kasir: ' + input.cashier));
	lines.push(sep);
	for (const item of input.items) {
		lines.push(item.productName.slice(0, w));
		lines.push(row(`  ${item.qty}x ${rupiah(item.unitPrice)}`, rupiah(item.lineTotal)));
	}
	lines.push(sep);
	lines.push(row('Subtotal', rupiah(input.subtotal)));
	lines.push(row('Pajak & layanan 10%', rupiah(input.tax)));
	lines.push(row('TOTAL', rupiah(input.total)));
	lines.push(sep);
	lines.push(row(methodLabel + (input.channel ? ` (${input.channel})` : ''), rupiah(input.total)));
	if (input.paymentMethod === 'cash') {
		lines.push(row('Uang diterima', rupiah(input.cashReceived ?? 0)));
		lines.push(row('Kembalian', rupiah(input.changeAmount ?? 0)));
	} else if (input.gatewayRef) {
		lines.push('Ref: ' + input.gatewayRef.slice(0, w));
	}
	lines.push(sep);
	lines.push(center('Terima kasih!'));
	lines.push('');
	return lines;
}

// ===== ESC/POS =====
const ESC = 0x1b;
const GS = 0x1d;

function escPosBytes(lines: string[], paperWidth: '58' | '80'): Uint8Array {
	const out: number[] = [];
	out.push(ESC, 0x40); // init
	out.push(ESC, 0x61, 0x00); // align left
	for (const line of lines) {
		const text = line.slice(0, COLUMNS[paperWidth]);
		for (const ch of text) {
			const code = ch.charCodeAt(0);
			out.push(code > 0x7f ? 0x20 : code);
		}
		out.push(0x0a);
	}
	out.push(ESC, 0x64, 0x03); // feed 3 lines
	out.push(GS, 0x56, 0x42, 0x00); // partial cut
	return new Uint8Array(out);
}

// ===== WebUSB (ESC/POS USB, Chrome/Edge) =====
interface UsbEndpoint {
	endpointNumber: number;
	direction: 'in' | 'out';
}
interface UsbAlternate {
	endpointCount: number;
	endpoints: UsbEndpoint[];
}
interface UsbInterface {
	interfaceNumber: number;
	alternate: UsbAlternate;
}
interface UsbDevice {
	open(): Promise<void>;
	selectConfiguration(n: number): Promise<void>;
	claimInterface(n: number): Promise<void>;
	releaseInterface(n: number): Promise<void>;
	close(): Promise<void>;
	transferOut(endpoint: number, data: Uint8Array): Promise<{ status: string }>;
	interfaces: UsbInterface[];
	productName?: string;
}

declare global {
	interface Navigator {
		usb?: {
			requestDevice(options: { filters: { vendorId?: number }[] }): Promise<UsbDevice>;
			getDevices(): Promise<UsbDevice[]>;
		};
	}
}

let rememberedUsbDevice: UsbDevice | null = null;

function findOutEndpoint(device: UsbDevice): number | null {
	for (const iface of device.interfaces) {
		for (const ep of iface.alternate.endpoints) {
			if (ep.direction === 'out') return ep.endpointNumber;
		}
	}
	return null;
}

export async function printWebUsb(lines: string[], paperWidth: '58' | '80'): Promise<void> {
	if (!navigator.usb) throw new Error('WebUSB tidak didukung browser ini. Gunakan Chrome/Edge.');
	const devices = await navigator.usb.getDevices();
	let device = devices.find((d) => d.productName) ?? rememberedUsbDevice ?? null;
	if (!device) {
		device = await navigator.usb.requestDevice({ filters: [] });
	}
	rememberedUsbDevice = device;
	if (!device) throw new Error('Tidak ada printer USB dipilih.');

	await device.open();
	try {
		await device.selectConfiguration(1);
		let claimed = false;
		for (const iface of device.interfaces) {
			if (iface.alternate.endpoints.some((ep) => ep.direction === 'out')) {
				await device.claimInterface(iface.interfaceNumber);
				claimed = true;
				break;
			}
		}
		if (!claimed) throw new Error('Printer tidak memiliki antarmuka keluaran (cek apakah sudah benar printer struk).');
		const endpoint = findOutEndpoint(device);
		if (!endpoint) throw new Error('Endpoint printer tidak ditemukan.');
		await device.transferOut(endpoint, escPosBytes(lines, paperWidth));
	} finally {
		await device.close().catch(() => {});
	}
}

// ===== Agen lokal =====
export async function printAgent(lines: string[], paperWidth: '58' | '80', agentUrl: string): Promise<void> {
	const url = (agentUrl || 'http://127.0.0.1:9123').replace(/\/+$/, '');
	const res = await fetch(`${url}/print`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ lines, paperWidth })
	});
	if (!res.ok) {
		const text = await res.text().catch(() => '');
		throw new Error(`Agen cetak gagal (${res.status}): ${text.slice(0, 120)}`);
	}
}

// ===== Dispatcher =====
export async function printReceipt(input: ReceiptInput, settings: PrinterSettings | null): Promise<string> {
	const paperWidth: '58' | '80' = settings?.paperWidth ?? '80';

	if (!settings || settings.printerType === 'browser') {
		window.print();
		return 'Menggunakan dialog cetak browser';
	}

	const lines = buildReceiptLines(input, paperWidth);

	if (settings.printerType === 'webusb') {
		await printWebUsb(lines, paperWidth);
		return 'Struk tercetak via printer USB';
	}

	if (settings.printerType === 'agent') {
		await printAgent(lines, paperWidth, settings.agentUrl);
		return 'Struk terkirim ke agen cetak';
	}

	window.print();
	return 'Menggunakan dialog cetak browser';
}