<script lang="ts">
	import { store, printer, backend } from '$lib/store.svelte';
	import { showToast } from '$lib/toast.svelte';
	import { printReceipt } from '$lib/printing';

	let {
		open = $bindable(false),
		receiptNo = '',
		items = [],
		subtotal = 0,
		tax = 0,
		total = 0,
		paymentMethod = 'cash',
		channel = '',
		gatewayRef = '',
		cashReceived = 0,
		changeAmount = 0,
	}: {
		open?: boolean;
		receiptNo?: string;
		items?: { productName: string; variant: string; qty: number; unitPrice: number; lineTotal: number }[];
		subtotal?: number;
		tax?: number;
		total?: number;
		paymentMethod?: string;
		channel?: string;
		gatewayRef?: string;
		cashReceived?: number;
		changeAmount?: number;
	} = $props();

	const methodLabels: Record<string, string> = { cash: 'Tunai', qris: 'QRIS', debit: 'Kartu Debit' };

	let printing = $state(false);

	async function print() {
		if (printing) return;
		printing = true;
		try {
			const cashier = store.profiles.find((p) => p.role === 'kasir')?.name ?? '';
			const message = await printReceipt(
				{
					shop: { name: store.shop.name, address: store.shop.address, phone: store.shop.phone },
					receiptNo,
					dateLabel,
					timeLabel,
					cashier,
					items,
					subtotal,
					tax,
					total,
					paymentMethod,
					channel,
					gatewayRef,
					cashReceived,
					changeAmount
				},
				backend.enabled ? { printerType: printer.printerType, paperWidth: printer.paperWidth, agentUrl: printer.agentUrl } : null
			);
			if (message !== 'Menggunakan dialog cetak browser') showToast(message);
		} catch (err) {
			showToast(err instanceof Error ? err.message : 'Gagal mencetak struk.');
		} finally {
			printing = false;
		}
	}

	function send() {
		showToast('Struk dikirim ke WhatsApp pelanggan (simulasi)');
	}

	const dateLabel = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
	const timeLabel = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
</script>

{#if open}
	<div class="modal-overlay" role="presentation" onclick={(e) => {
		if (e.target === e.currentTarget) open = false;
	}}>
		<div class="modal-card receipt-modal" role="dialog" aria-modal="true" aria-label="Struk pesanan">
			<div class="modal-head no-print">
				<h3>Rincian &amp; struk</h3>
				<button class="icon-button" type="button" onclick={() => (open = false)} aria-label="Tutup dialog">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
				</button>
			</div>
			<div class="modal-body">
				<div class="receipt" id="receipt-area">
					<div class="receipt-shop">
						<strong>{store.shop.name}</strong>
						<span>{store.shop.address}</span>
						<span>{store.shop.phone}</span>
					</div>
					<div class="receipt-meta">
						<span>No. {receiptNo}</span>
						<span>{dateLabel} · {timeLabel}</span>
						<span>Kasir: {store.profiles.find((p) => p.role === 'kasir')?.name ?? 'Rina'}</span>
					</div>
					<hr />
					<div class="receipt-items">
						{#each items as item}
							<div class="receipt-item">
								<strong>{item.productName} ({item.variant})</strong>
								<span>{item.qty} × {item.unitPrice.toLocaleString('id-ID')}</span>
								<b>{item.lineTotal.toLocaleString('id-ID')}</b>
							</div>
						{/each}
					</div>
					<hr />
					<div class="receipt-totals">
						<div><span>Subtotal</span><span>{subtotal.toLocaleString('id-ID')}</span></div>
						<div><span>Pajak &amp; layanan 10%</span><span>{tax.toLocaleString('id-ID')}</span></div>
						<div class="receipt-grand"><span>Total</span><strong>{total.toLocaleString('id-ID')}</strong></div>
					</div>
					<div class="receipt-pay">
						<div><span>{methodLabels[paymentMethod] ?? paymentMethod}{channel ? ` · ${channel}` : ''}</span><span>{total.toLocaleString('id-ID')}</span></div>
						{#if paymentMethod === 'cash'}
							<div><span>Uang diterima</span><span>{cashReceived.toLocaleString('id-ID')}</span></div>
							<div><span>Kembalian</span><span>{changeAmount.toLocaleString('id-ID')}</span></div>
						{:else if gatewayRef}
							<div><span>Ref ID</span><span>{gatewayRef}</span></div>
						{/if}
					</div>
					<hr />
					<p class="receipt-footer">Terima kasih! Stok bahan sudah dipotong otomatis sesuai resep.</p>
				</div>
				<div class="no-print modal-actions">
					<button class="button button-secondary" type="button" onclick={send}>
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v16H4z" /><path d="m8 16 4-4-4-4M16 8l-4 4 4 4" /></svg>
						Kirim struk
					</button>
					<button class="button button-primary" type="button" onclick={print} disabled={printing}>
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8V4h10v4M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M7 14h10v6H7z" /></svg>
						{printing ? 'Mencetak…' : 'Cetak struk'}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
