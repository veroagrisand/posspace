<script lang="ts">
	import { showToast } from '$lib/toast.svelte';
	import { backend } from '$lib/store.svelte';
	import QRCode from 'qrcode';

	let {
		open = $bindable(false),
		total = 0,
		transactionId = '',
		onPaid = () => {}
	}: {
		open?: boolean;
		total?: number;
		transactionId?: string;
		onPaid?: (result: { channel: string; gatewayRef: string }) => void;
	} = $props();

	const channels = [
		{ id: 'qris', label: 'QRIS Dinamis', icon: 'qris', desc: 'Scan dengan e-wallet / m-banking' }
	];

	let selected = $state('qris');
	let step = $state<'choose' | 'paying' | 'done'>('choose');
	let gatewayRef = $state('');
	let qrDataUrl = $state('');
	let paymentUrl = $state('');
	let pollTimer: number | undefined;
	let errorMsg = $state('');

	function randomRef() {
		return `IPM-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
	}

	function paymentErrorMessage(code: unknown): string {
		const messages: Record<string, string> = {
			MIDTRANS_NOT_CONFIGURED: 'Pembayaran digital belum tersedia. Konfigurasi MIDTRANS_SERVER_KEY dan MIDTRANS_CLIENT_KEY di server terlebih dahulu.',
			MIDTRANS_UNAVAILABLE: 'Server pembayaran tidak tersedia. Coba lagi beberapa saat.',
			MIDTRANS_ORDER_EXISTS: 'Transaksi ini sudah pernah dibuatkan pembayaran. Muat ulang halaman lalu coba lagi.',
			NOT_PENDING: 'Transaksi ini sudah tidak menunggu pembayaran.'
		};
		return messages[String(code ?? '')] ?? 'Gagal membuat invoice pembayaran. Coba lagi.';
	}

	$effect(() => {
		if (open) {
			selected = 'qris';
			step = 'choose';
			gatewayRef = '';
			qrDataUrl = '';
			paymentUrl = '';
			errorMsg = '';
		}
	});

	async function start() {
		errorMsg = '';
		if (backend.enabled) {
			if (!transactionId) {
				showToast('Transaksi belum dibuat. Ulangi dari keranjang.');
				return;
			}
			step = 'paying';
			try {
				const res = await fetch('/api/payments/midtrans/invoice', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ transactionId })
				});
				const json = await res.json().catch(() => ({}));
				if (!res.ok) {
					errorMsg = paymentErrorMessage(json.message);
					step = 'choose';
					showToast(errorMsg);
					return;
				}
				gatewayRef = json.referenceId ?? randomRef();
				if (json.qrContent) {
					// Midtrans QRIS: qrContent sudah berupa data URL PNG — pakai langsung,
					// fallback generate dari string QR bila bukan data URL.
					qrDataUrl = typeof json.qrContent === 'string' && json.qrContent.startsWith('data:')
						? json.qrContent
						: await QRCode.toDataURL(json.qrContent, {
								width: 300,
								margin: 2,
								color: { dark: '#1c2721', light: '#ffffff' }
							});
				} else if (json.paymentUrl) {
					paymentUrl = json.paymentUrl;
					window.open(json.paymentUrl, '_blank');
				}
				startPolling();
			} catch {
				errorMsg = 'Gagal terhubung ke Midtrans. Coba lagi.';
				step = 'choose';
				showToast(errorMsg);
			}
		} else {
			gatewayRef = randomRef();
			step = 'paying';
			qrDataUrl = '';
		}
	}

	function startPolling() {
		window.clearInterval(pollTimer);
		pollTimer = window.setInterval(async () => {
			try {
				const res = await fetch(`/api/payments/midtrans/status?transactionId=${transactionId}`);
				const json = await res.json();
				if (json.status === 'paid') {
					window.clearInterval(pollTimer);
					const confirmRes = await fetch(`/api/transactions/${transactionId}/confirm`, { method: 'POST' });
					if (!confirmRes.ok) {
						const confirmJson = await confirmRes.json().catch(() => ({}));
						errorMsg = paymentErrorMessage(confirmJson.message);
						step = 'choose';
						showToast(errorMsg);
						return;
					}
					step = 'done';
					showToast('Pembayaran terverifikasi — stok dipotong otomatis');
					onPaid({ channel: 'QRIS', gatewayRef });
				}
			} catch {
				/* abaikan — coba lagi di interval berikutnya */
			}
		}, 5000);
	}

	function simulateCallback() {
		window.clearInterval(pollTimer);
		step = 'done';
		showToast('Pembayaran (demo) berhasil');
		onPaid({ channel: 'QRIS', gatewayRef });
	}

	function closeAll() {
		window.clearInterval(pollTimer);
		open = false;
		step = 'choose';
	}
</script>

{#if open}
	<div class="modal-overlay" role="presentation">
		<div class="modal-card modal-wide" role="dialog" aria-modal="true" aria-label="Pembayaran digital">
			<div class="modal-head">
				<h3>Pembayaran digital — Midtrans QRIS</h3>
				<button class="icon-button" type="button" onclick={closeAll} aria-label="Tutup dialog">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
				</button>
			</div>
			<div class="modal-body">
				{#if step === 'choose'}
					<div class="pay-channel">
						{#each channels as channel}
							<button class="channel-card" class:active={selected === channel.id} type="button" onclick={() => (selected = channel.id)}>
								<span class="channel-icon">
									<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2M18 14h2M14 18h2M18 18h2" /></svg>
								</span>
								<span class="channel-copy">
									<strong>{channel.label}</strong>
									<small>{channel.desc}</small>
								</span>
								<span class="radio-dot" class:active={selected === channel.id}></span>
							</button>
						{/each}
					</div>
					<div class="payment-total-strip">
						<span>Total yang harus dibayar</span>
						<strong>{total.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })}</strong>
					</div>
					{#if errorMsg}
						<p style="color:#b0453a;font-size:11px;margin-top:10px">{errorMsg}</p>
					{/if}
					<div class="modal-actions">
						<button class="button button-secondary" type="button" onclick={closeAll}>Batalkan</button>
						<button class="button button-primary" type="button" onclick={start}>Buat invoice &amp; lanjut</button>
					</div>
				{:else if step === 'paying'}
					<div class="paying-box">
						{#if backend.enabled && qrDataUrl}
							<img src={qrDataUrl} alt="Kode QR Midtrans (QRIS)" style="width:220px;height:220px;border-radius:14px;border:1px solid var(--line-strong)" />
							<p>Pindai kode QR ini menggunakan aplikasi e-wallet / m-banking pelanggan.</p>
						{:else if backend.enabled && paymentUrl}
							<div class="paying-redirect">
								<span class="paying-spinner" aria-hidden="true"></span>
								<p>Halaman pembayaran Midtrans dibuka di tab baru.<br />Selesaikan pembayaran lalu tunggu verifikasi otomatis di sini.</p>
								<a class="button button-primary" href={paymentUrl} target="_blank" rel="noopener">Buka lagi halaman pembayaran</a>
							</div>
						{:else if !backend.enabled}
							<div class="fake-qr" aria-hidden="true">
								{#each Array.from({ length: 49 }) as _, i}
									<i class:on={(i * 7 + Math.floor(i / 7) * 3) % 5 !== 0}></i>
								{/each}
							</div>
							<p>Mode demo — QRIS asli aktif setelah kredensial Midtrans diisi di .env.</p>
						{:else}
							<div class="admin-loading">Menghubungkan ke Midtrans...</div>
						{/if}
						<div class="ref-line"><span>Reference ID</span><strong>{gatewayRef}</strong></div>
						<p style="color:#9aa39c;font-size:10px;margin-top:6px">Menunggu pembayaran... Sistem memverifikasi otomatis via webhook &amp; polling.</p>
						<div class="modal-actions">
							<button class="button button-secondary" type="button" onclick={closeAll}>Batalkan</button>
							{#if !backend.enabled}
								<button class="button button-primary" type="button" onclick={simulateCallback}>Simulasi pembayaran sukses</button>
							{/if}
						</div>
					</div>
				{:else}
					<div class="success-box">
						<span class="toast-check">✓</span>
						<strong>Pembayaran terverifikasi</strong>
						<p>Status transaksi {gatewayRef} dikonfirmasi PAID oleh Midtrans. Stok bahan dipotong otomatis.</p>
						<div class="ref-line"><span>Reference ID</span><strong>{gatewayRef}</strong></div>
					</div>
					<div class="modal-actions">
						<button class="button button-primary" type="button" style="flex:1" onclick={closeAll}>Selesai &amp; cetak struk</button>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.paying-redirect {
		display: grid;
		justify-items: center;
		text-align: center;
		gap: 10px;
		padding: 8px 0 4px;
	}

	.paying-spinner {
		width: 34px;
		height: 34px;
		border: 3px solid var(--line-strong);
		border-top-color: var(--forest-700);
		border-radius: 50%;
		animation: ps-spin 0.9s linear infinite;
	}

	.paying-redirect p {
		color: var(--ink-soft);
		font-size: 11.5px;
		line-height: 1.6;
		margin: 0;
	}

	@keyframes ps-spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
