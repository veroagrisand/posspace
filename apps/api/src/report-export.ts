import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

/** Format angka Rupiah ringkas untuk PDF. */
export function fmtIDR(n: number): string {
	return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Math.max(0, Math.round(n)));
}

export interface ExportTx {
	receipt_no: string;
	paid_at: string;
	total_amount: number;
	payment_method: string;
	payment_channel: string | null;
	payment_gateway_ref: string | null;
	transaction_items: { product_name: string; quantity: number; unit_price: number; line_total: number; unit_cost?: number | null; variant_id?: string | null }[];
}

export interface ExportSummary {
	shopName: string;
	from: string;
	to: string;
	omzet: number;
	txCount: number;
	hpp: number;
	profit: number;
	expenses: number;
	netProfit: number;
}

export interface ExportData {
	summary: ExportSummary;
	transactions: ExportTx[];
	perMenu: { name: string; qty: number; revenue: number; hpp: number; profit: number }[];
	daily: { date: string; omzet: number; count: number }[];
}

/** Buat workbook Excel dengan beberapa sheet laporan. */
export async function buildExcelReport(data: ExportData): Promise<Buffer> {
	const wb = new ExcelJS.Workbook();
	wb.creator = 'posspace';
	wb.created = new Date();

	const s = wb.addWorksheet('Ringkasan');
	s.columns = [{ width: 30 }, { width: 18 }];
	s.mergeCells('A1:B1');
	s.getCell('A1').value = `Laporan ${data.summary.shopName}`;
	s.getCell('A1').font = { bold: true, size: 14 };
	s.mergeCells('A2:B2');
	s.getCell('A2').value = `Periode: ${data.summary.from} s/d ${data.summary.to}`;
	s.getCell('A2').font = { size: 11, color: { argb: 'FF718078' } };
	const rows: [string, string | number][] = [
		['Omzet', data.summary.omzet],
		['Jumlah transaksi', data.summary.txCount],
		['HPP (bahan)', data.summary.hpp],
		['Laba kotor', data.summary.profit],
		['Beban operasional', data.summary.expenses],
		['Laba BERSIH', data.summary.netProfit]
	];
	rows.forEach(([label, val], i) => {
		const r = s.getRow(i + 4);
		r.getCell(1).value = label;
		r.getCell(1).font = { bold: true };
		r.getCell(2).value = val;
		r.getCell(2).numFmt = '#,##0';
		if (label === 'Laba BERSIH') {
			r.getCell(2).font = { bold: true, color: { argb: data.summary.netProfit >= 0 ? 'FF1E7B34' : 'FFB0453A' } };
		}
	});

	const t = wb.addWorksheet('Transaksi');
	t.columns = [
		{ header: 'No. Struk', key: 'receipt_no', width: 22 },
		{ header: 'Waktu', key: 'paid_at', width: 20 },
		{ header: 'Item', key: 'items', width: 60 },
		{ header: 'Metode', key: 'method', width: 14 },
		{ header: 'Ref ID', key: 'ref', width: 24 },
		{ header: 'Total', key: 'total', width: 16 }
	];
	t.getRow(1).font = { bold: true };
	for (const x of data.transactions) {
		t.addRow({
			receipt_no: x.receipt_no ?? '',
			paid_at: new Date(x.paid_at).toLocaleString('id-ID'),
			items: (x.transaction_items ?? []).map((i) => `${i.quantity}x ${i.product_name}`).join('; '),
			method: x.payment_method ?? '',
			ref: x.payment_gateway_ref ?? '',
			total: Number(x.total_amount ?? 0)
		});
	}
	t.getColumn('total').numFmt = '#,##0';

	const m = wb.addWorksheet('Per Menu');
	m.columns = [
		{ header: 'Menu', key: 'name', width: 40 },
		{ header: 'Terjual', key: 'qty', width: 10 },
		{ header: 'Pendapatan', key: 'revenue', width: 16 },
		{ header: 'HPP', key: 'hpp', width: 16 },
		{ header: 'Laba', key: 'profit', width: 16 }
	];
	m.getRow(1).font = { bold: true };
	for (const x of data.perMenu) {
		m.addRow({ name: x.name, qty: x.qty, revenue: x.revenue, hpp: x.hpp, profit: x.profit });
	}
	['revenue', 'hpp', 'profit'].forEach((k) => (m.getColumn(k).numFmt = '#,##0'));

	const d = wb.addWorksheet('Per Hari');
	d.columns = [
		{ header: 'Tanggal', key: 'date', width: 14 },
		{ header: 'Transaksi', key: 'count', width: 12 },
		{ header: 'Omzet', key: 'omzet', width: 16 }
	];
	d.getRow(1).font = { bold: true };
	for (const x of data.daily) {
		d.addRow({ date: x.date, count: x.count, omzet: x.omzet });
	}
	d.getColumn('omzet').numFmt = '#,##0';

	return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Buat dokumen PDF laporan. */
export function buildPdfReport(data: ExportData): Promise<Buffer> {
	return new Promise((resolve) => {
		const doc = new PDFDocument({ size: 'A4', margin: 36 });
		const chunks: Buffer[] = [];
		doc.on('data', (c: Buffer) => chunks.push(c));
		doc.on('end', () => resolve(Buffer.concat(chunks)));

		doc.fontSize(16).fillColor('#1c2721').text(`Laporan ${data.summary.shopName}`, { align: 'center' });
		doc.fontSize(9).fillColor('#718078').text(`Periode: ${data.summary.from} s/d ${data.summary.to}`, { align: 'center' });
		doc.moveDown();

		const summary: [string, string][] = [
			['Omzet', fmtIDR(data.summary.omzet)],
			['Jumlah transaksi', String(data.summary.txCount)],
			['HPP (bahan)', fmtIDR(data.summary.hpp)],
			['Laba kotor', fmtIDR(data.summary.profit)],
			['Beban operasional', fmtIDR(data.summary.expenses)],
			['Laba BERSIH', fmtIDR(data.summary.netProfit)]
		];
		doc.fontSize(10).fillColor('#1c2721');
		for (const [label, val] of summary) {
			doc.text(`${label.padEnd(20)} ${val}`);
		}
		doc.moveDown().moveDown();

		doc.fontSize(11).fillColor('#1c2721').text('Transaksi', { underline: true });
		doc.moveDown(0.3);
		doc.fontSize(7.5).fillColor('#4f5e55');
		for (const x of data.transactions.slice(0, 40)) {
			const items = (x.transaction_items ?? []).map((i) => `${i.quantity}x ${i.product_name}`).join(', ');
			doc.text(`${x.receipt_no ?? ''}  ${new Date(x.paid_at).toLocaleString('id-ID')}  ${items.slice(0, 90)}  ${fmtIDR(Number(x.total_amount ?? 0))}`);
		}
		if ((data.transactions ?? []).length > 40) {
			doc.text(`... dan ${data.transactions.length - 40} transaksi lainnya`);
		}

		doc.moveDown().moveDown();
		doc.fontSize(11).fillColor('#1c2721').text('Per Menu', { underline: true });
		doc.moveDown(0.3);
		doc.fontSize(8).fillColor('#4f5e55');
		for (const x of data.perMenu.slice(0, 30)) {
			doc.text(`${x.name}  (${x.qty} terjual)  revenue ${fmtIDR(x.revenue)}  HPP ${fmtIDR(x.hpp)}  laba ${fmtIDR(x.profit)}`);
		}

		doc.end();
	});
}

/** Periode → rentang tanggal. */
export function periodRange(period: string): { from: string; to: string } {
	const now = new Date();
	const to = now.toISOString().slice(0, 10);
	const iso = (d: Date) => d.toISOString().slice(0, 10);
	switch (period) {
		case 'weekly': {
			const day = (now.getDay() + 6) % 7; // Senin=0
			const monday = new Date(now);
			monday.setDate(now.getDate() - day);
			return { from: iso(monday), to };
		}
		case 'monthly': {
			const first = new Date(now.getFullYear(), now.getMonth(), 1);
			return { from: iso(first), to };
		}
		case 'yearly': {
			const first = new Date(now.getFullYear(), 0, 1);
			return { from: iso(first), to };
		}
		default: {
			return { from: '2000-01-01', to };
		}
	}
}