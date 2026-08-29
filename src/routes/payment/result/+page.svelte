<script lang="ts">
	import '../../../lib/css/landing.css';
	import BrandLogo from '$lib/components/BrandLogo.svelte';

	let { data }: { data: any } = $props();

	let status = $state<'pending' | 'paid' | 'failed'>('pending');
	let notice = $state('');
	let polling = $state(false);

	async function check() {
		if (!data.merchantOrderId) return;
		polling = true;
		try {
			const res = await fetch(`/api/payments/ipaymu/status?merchantOrderId=${data.merchantOrderId}`);
			const json = await res.json();
			if (json.status === 'paid') {
				status = 'paid';
			} else {
				notice = 'Pembayaran belum terkonfirmasi. Silakan cek lagi setelah menyelesaikan pembayaran.';
			}
		} catch {
			notice = 'Terjadi kesalahan saat memeriksa status.';
		}
		polling = false;
	}

	async function simulatePay() {
		if (!data.merchantOrderId) return;
		polling = true;
		try {
			const res = await fetch('/api/payments/mock', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ merchantOrderId: data.merchantOrderId })
			});
			if (res.ok) {
				status = 'paid';
			} else {
				notice = 'Simulasi pembayaran gagal.';
			}
		} catch {
			notice = 'Terjadi kesalahan jaringan.';
		}
		polling = false;
	}
</script>

<svelte:head><title>Hasil pembayaran — posspace</title></svelte:head>

<div class="au-page">
	<aside class="au-visual">
		<div>
			<BrandLogo variant="dark" />
			<h2>Pembayaran langganan toko Anda.</h2>
			<p>Status pembayaran diperbarui otomatis melalui webhook iPaymu.</p>
		</div>
	</aside>

	<main class="au-form-wrap">
		<a class="au-back" href="/subscribe">
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
			Kembali ke langganan
		</a>

		{#if status === 'paid'}
			<div class="success-box" style="display:grid;justify-items:center;text-align:center;padding:20px">
				<span class="toast-check" style="width:46px;height:46px;font-size:22px">✓</span>
				<h1 style="font-size:24px">Pembayaran diterima!</h1>
				<p>Subscription toko Anda sudah aktif. Aplikasi siap digunakan.</p>
				<a class="lp-cta lp-cta-primary" style="margin-top:16px" href="/app">
					Masuk ke aplikasi
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
				</a>
			</div>
		{:else}
			<h1>Menunggu pembayaran</h1>
			<p style="margin-top:9px;color:#718078;font-size:12px;line-height:1.55">
				Invoice <strong>{data.merchantOrderId}</strong> masih berstatus pending. Webhook iPaymu akan
				mengonfirmasi otomatis saat pembayaran selesai.
			</p>
			{#if data.mock}
				<div class="au-demo-note">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5c0 4.6-2.9 8-7 10-4.1-2-7-5.4-7-10V6l7-3Z" /><path d="M12 9v4M12 16h.01" /></svg>
					<span>Mode simulasi aktif. Gunakan tombol berikut untuk menandai pembayaran sukses.</span>
				</div>
				<button class="au-submit" type="button" onclick={simulatePay} disabled={polling}>
					{polling ? 'Memproses...' : 'Simulasi pembayaran sukses (dev)'}
				</button>
			{/if}
			<button class="button button-secondary" type="button" style="width:100%;margin-top:12px" onclick={check} disabled={polling}>
				{polling ? 'Memeriksa...' : 'Saya sudah membayar — cek status'}
			</button>
			{#if notice}
				<p style="margin-top:12px;color:#8a4438;font-size:12px">{notice}</p>
			{/if}
		{/if}
	</main>
</div>