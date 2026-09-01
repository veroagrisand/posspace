<script lang="ts">
	import PublicNav from '$lib/components/PublicNav.svelte';
	import PublicFooter from '$lib/components/PublicFooter.svelte';

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

<div class="auth-page">
	<div class="wrap" style="padding-top:8px">
		<PublicNav items={[{ href: '/', label: 'Beranda' }]} ctaLabel="Masuk" ctaHref="/login" secondaryLabel="Harga" secondaryHref="/#harga" />
	</div>

	<main class="auth-main">
		<div class="auth-card">
			<a class="auth-back" href="/subscribe">
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
				Kembali ke langganan
			</a>

			{#if status === 'paid'}
				<div class="success-box">
					<span class="success-check">✓</span>
					<h1 style="font-size:24px">Pembayaran diterima!</h1>
					<p style="color:var(--brand-ink-soft);font-size:13px;line-height:1.6">Subscription toko Anda sudah aktif. Aplikasi siap digunakan.</p>
					<a class="btn-pill btn-pill--orange" style="margin-top:8px" href="/app">
						Masuk ke aplikasi
						<span class="btn-arrow"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg></span>
					</a>
				</div>
			{:else}
				<h1 style="font-size:1.6rem">Menunggu pembayaran</h1>
				<p style="margin-top:10px;color:var(--brand-muted);font-size:13px;line-height:1.6">
					Invoice <strong>{data.merchantOrderId}</strong> masih berstatus pending. Webhook iPaymu akan
					mengonfirmasi otomatis saat pembayaran selesai.
				</p>
				{#if data.mock}
					<div class="auth-note" style="margin-top:18px">
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5c0 4.6-2.9 8-7 10-4.1-2-7-5.4-7-10V6l7-3Z" /><path d="M12 9v4M12 16h.01" /></svg>
						<span>Mode simulasi aktif. Gunakan tombol berikut untuk menandai pembayaran sukses.</span>
					</div>
					<button class="auth-submit btn-pill--block" style="margin-top:16px;display:flex" type="button" onclick={simulatePay} disabled={polling}>
						{polling ? 'Memproses...' : 'Simulasi pembayaran sukses (dev)'}
					</button>
				{/if}
				<button class="btn-pill btn-pill--ghost btn-pill--block" style="margin-top:12px" type="button" onclick={check} disabled={polling}>
					{polling ? 'Memeriksa...' : 'Saya sudah membayar — cek status'}
				</button>
				{#if notice}
					<p class="auth-error" style="margin-top:12px">{notice}</p>
				{/if}
			{/if}
		</div>
	</main>

	<PublicFooter />
</div>