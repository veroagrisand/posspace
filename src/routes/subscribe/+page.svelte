<script lang="ts">
	import PublicNav from '$lib/components/PublicNav.svelte';
	import PublicFooter from '$lib/components/PublicFooter.svelte';
	import QRCode from 'qrcode';

	let { data, form }: { data: any; form?: any } = $props();

	let plan = $state('pro');
	let billing = $state('monthly');
	let polling = $state(false);
	let notice = $state('');
	let qrDataUrl = $state('');
	let voucherCode = $state('');
	let voucherMsg = $state('');
	let voucherErr = $state('');
	let voucherBusy = $state(false);

	const planLabels: Record<string, string> = { starter: 'Starter', pro: 'Pro', tumbuh: 'Tumbuh' };

	function formatPrice(value: number) {
		return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(value ?? 0);
	}

	function selectPlan(id: string) {
		plan = id;
	}

	$effect(() => {
		if (data.pendingInvoice?.qr_string && !qrDataUrl) {
			QRCode.toDataURL(data.pendingInvoice.qr_string, {
				width: 300,
				margin: 2,
				color: { dark: '#111111', light: '#ffffff' }
			})
				.then((url) => (qrDataUrl = url))
				.catch(() => (notice = 'Gagal membuat kode QR.'));
		}
	});

	async function checkStatus() {
		if (!data.pendingInvoice?.merchant_order_id) return;
		polling = true;
		try {
			const res = await fetch(`/api/payments/ipaymu/status?merchantOrderId=${data.pendingInvoice.merchant_order_id}`);
			const json = await res.json();
			if (json.status === 'paid') {
				notice = 'Pembayaran diterima! Mengarahkan ke aplikasi...';
				window.setTimeout(() => (window.location.href = '/app'), 1200);
			} else {
				notice = 'Pembayaran belum terkonfirmasi. Coba lagi nanti.';
			}
		} catch {
			notice = 'Gagal memeriksa status. Coba lagi.';
		}
		polling = false;
	}

	async function simulatePay() {
		polling = true;
		try {
			const res = await fetch('/api/payments/mock', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ merchantOrderId: data.pendingInvoice.merchant_order_id })
			});
			if (res.ok) {
				notice = 'Pembayaran (simulasi) diterima! Mengarahkan ke aplikasi...';
				window.setTimeout(() => (window.location.href = '/app'), 1200);
			} else {
				notice = 'Simulasi gagal.';
			}
		} catch {
			notice = 'Terjadi kesalahan jaringan.';
		}
		polling = false;
	}

	async function applyVoucher() {
		if (!voucherCode.trim()) {
			voucherErr = 'Masukkan kode voucher.';
			return;
		}
		voucherBusy = true;
		voucherErr = '';
		voucherMsg = '';
		try {
			const res = await fetch('/api/subscription/voucher', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code: voucherCode.trim() })
			});
			const json = await res.json().catch(() => ({}));
			if (!res.ok) {
				voucherErr = json.message ?? 'Kode voucher tidak valid.';
				return;
			}
			voucherMsg = `Diskon ${json.discount > 0 ? 'Rp ' + formatPrice(json.discount) : json.voucherCode} diterapkan. Memuat ulang...`;
			window.setTimeout(() => window.location.reload(), 900);
		} catch {
			voucherErr = 'Terjadi kesalahan jaringan.';
		} finally {
			voucherBusy = false;
		}
	}
</script>

<svelte:head><title>Berlangganan — posspace</title></svelte:head>

<div class="auth-page">
	<div class="wrap" style="padding-top:8px">
		<PublicNav items={[{ href: '/', label: 'Beranda' }]} ctaLabel="Masuk" ctaHref="/login" secondaryLabel="Harga" secondaryHref="/#harga" />
	</div>

	<main class="auth-main">
		<div class="auth-card" style="max-width:560px">
			<a class="auth-back" href="/">
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
				Kembali ke beranda
			</a>
			<h1>Berlangganan posspace</h1>
			<p>Setiap toko wajib berlangganan sebelum aplikasi aktif. Pembayaran diproses aman lewat iPaymu (QRIS/VA/e-wallet).</p>

			{#if data.status}
				<div class="auth-note auth-note--alert" style="margin-top:18px">
					<span>Status langganan sebelumnya: <strong>{data.status}</strong>. Pilih paket untuk memperbarui pembayaran.</span>
				</div>
			{/if}

			{#if data.pendingInvoice}
				<div class="auth-note" style="margin-top:18px">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5c0 4.6-2.9 8-7 10-4.1-2-7-5.4-7-10V6l7-3Z" /><path d="M12 9v4M12 16h.01" /></svg>
					<span>
						Invoice <strong>{data.pendingInvoice.merchant_order_id}</strong> sebesar
						<strong>Rp {formatPrice(data.pendingInvoice.amount)}</strong> menunggu pembayaran.
						{#if data.pendingInvoice.discount_amount > 0}
							<br /><small style="color:var(--brand-green)">termasuk diskon voucher Rp {formatPrice(data.pendingInvoice.discount_amount)}</small>
						{/if}
					</span>
				</div>

				{#if data.pendingInvoice.discount_amount === 0}
					<div style="display:flex;gap:8px;margin-top:16px">
						<input
							type="text"
							bind:value={voucherCode}
							placeholder="Punya kode voucher? (mis. HEMAT20)"
							style="flex:1;min-width:0;padding:11px 14px;border:1px solid var(--brand-line-strong);border-radius:12px;font-size:13px;text-transform:uppercase;outline:none"
						/>
						<button class="btn-pill btn-pill--dark btn-pill--sm" type="button" onclick={applyVoucher} disabled={voucherBusy}>
							{voucherBusy ? 'Memeriksa...' : 'Pakai voucher'}
						</button>
					</div>
					{#if voucherErr}
						<p class="auth-error" style="margin-top:8px">{voucherErr}</p>
					{/if}
					{#if voucherMsg}
						<p class="auth-notice" style="margin-top:8px">{voucherMsg}</p>
					{/if}
				{/if}

				{#if qrDataUrl}
					<div style="display:flex;flex-direction:column;align-items:center;gap:12px;margin-top:20px">
						<img src={qrDataUrl} alt="Kode QR pembayaran iPaymu (QRIS)" style="width:220px;height:220px;border-radius:16px;border:1px solid var(--brand-line-strong);box-shadow:var(--brand-shadow)" />
						<p style="color:var(--brand-muted);font-size:12px;line-height:1.6;text-align:center;max-width:320px">
							Pindai kode QR dengan aplikasi e-wallet / m-banking untuk menyelesaikan pembayaran
							<strong>Rp {formatPrice(data.pendingInvoice.amount)}</strong>.
						</p>
					</div>
				{:else if data.pendingInvoice.payment_url}
					<a class="btn-pill btn-pill--orange btn-pill--block" style="margin-top:16px" href={data.pendingInvoice.payment_url} target="_blank" rel="noopener">
						Lanjutkan pembayaran
						<span class="btn-arrow"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg></span>
					</a>
				{/if}

				<button class="btn-pill btn-pill--ghost btn-pill--block" style="margin-top:14px" type="button" onclick={checkStatus} disabled={polling}>
					{polling ? 'Memeriksa...' : 'Saya sudah membayar'}
				</button>
				{#if !data.pendingInvoice.payment_url && !data.pendingInvoice.qr_string}
					<div class="auth-note" style="margin-top:14px">
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5c0 4.6-2.9 8-7 10-4.1-2-7-5.4-7-10V6l7-3Z" /><path d="M12 9v4M12 16h.01" /></svg>
						<span>
							Metode pembayaran belum dikonfigurasi. Langganan Anda akan diaktifkan oleh
							<strong>administrator posspace</strong> — hubungi admin bila perlu.
						</span>
					</div>
				{/if}
				{#if notice}
					<p class="auth-notice" style="margin-top:12px">{notice}</p>
				{/if}
			{:else}
				<p style="margin-top:12px;color:var(--brand-muted);font-size:13px;line-height:1.6">Pilih paket berlangganan untuk toko Anda. Setelah pembayaran terkonfirmasi, aplikasi langsung aktif.</p>

				<div style="text-align:center;margin:22px 0 18px">
					<div class="toggle" role="group" aria-label="Periode penagihan">
						<button type="button" class:active={billing === 'monthly'} onclick={() => (billing = 'monthly')}>Bulanan</button>
						<button type="button" class:active={billing === 'annual'} onclick={() => (billing = 'annual')}>Tahunan <small>-20%</small></button>
					</div>
				</div>

				<form method="POST" action="?/subscribe">
					<input type="hidden" name="billing" value={billing} />
					<div style="display:grid;gap:10px">
						{#each data.plans ?? [] as p}
							<button type="button" class="plan-select" class:active={plan === p.id} onclick={() => selectPlan(p.id)}>
								<span class="copy">
									<strong>{p.name}</strong>
									<small>Rp {formatPrice(billing === 'annual' ? p.annual_price : p.monthly_price)}/bulan{billing === 'annual' ? ' · ditagih tahunan' : ''}</small>
								</span>
								<span class="radio-dot" class:active={plan === p.id}></span>
							</button>
						{/each}
					</div>
					<input type="hidden" name="planId" value={plan} />
					<button class="auth-submit btn-pill--block" type="submit" style="margin-top:18px;display:flex">
						Lanjut ke pembayaran — Rp {formatPrice((data.plans ?? []).find((p: any) => p.id === plan)?.monthly_price ?? 0)}
					</button>
				</form>
				{#if form?.error}
					<p class="auth-error" style="margin-top:12px">{form.error}</p>
				{/if}
				<p class="auth-terms" style="margin-top:16px">
					Pembayaran diproses oleh iPaymu (QRIS / VA / e-wallet). Dengan berlangganan Anda menyetujui
					Syarat &amp; Ketentuan posspace.
				</p>
			{/if}
		</div>
	</main>

	<PublicFooter />
</div>