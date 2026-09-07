<script lang="ts">
	import { onMount } from 'svelte';
	import AppLayout from '../app/+layout.svelte';
	import CashierPage from '../app/+page.svelte';
	import { clearDemoStore, seedDemoStore } from '$lib/demo-data';

	const DEMO_TTL = 10 * 60 * 1000;
	const EXPIRY_KEY = 'posspace.demo.expiresAt';

	let ready = $state(false);
	let expired = $state(false);
	let remaining = $state(0);

	function formatRemaining(seconds: number) {
		const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
		const rest = (seconds % 60).toString().padStart(2, '0');
		return `${minutes}:${rest}`;
	}

	onMount(() => {
		let storedExpiry = 0;
		try {
			storedExpiry = Number(sessionStorage.getItem(EXPIRY_KEY));
		} catch {
			storedExpiry = 0;
		}
		const expiresAt = Number.isFinite(storedExpiry) && storedExpiry > 0 ? storedExpiry : Date.now() + DEMO_TTL;
		try {
			sessionStorage.setItem(EXPIRY_KEY, String(expiresAt));
		} catch {
			// Timer tetap berlaku selama tab ini terbuka jika storage diblokir.
		}

		const update = () => {
			const seconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
			remaining = seconds;
			if (seconds === 0) {
				expired = true;
				clearDemoStore();
			}
		};

		update();
		if (remaining === 0) {
			ready = true;
			return;
		}

		seedDemoStore();
		ready = true;
		const timer = window.setInterval(update, 1000);
		return () => window.clearInterval(timer);
	});
</script>

<svelte:head><title>Demo kasir interaktif - posspace</title></svelte:head>

{#if !ready}
	<div class="demo-state">
		<strong>Menyiapkan demo kasir</strong>
		<span>Data contoh sedang dimuat di browser ini.</span>
	</div>
{:else if expired}
	<div class="demo-state">
		<strong>Demo sudah berakhir</strong>
		<span>Data contoh telah dihapus dari memori browser setelah 10 menit.</span>
		<a class="btn-pill btn-pill--orange" href="/register">Langganan sekarang</a>
	</div>
{:else}
	<div class="demo-route">
		<div class="demo-notice" role="status">
			<div>
				<strong>Demo interaktif</strong>
				<span>Data contoh lokal. Tidak ada transaksi yang dikirim ke database.</span>
			</div>
			<strong class="demo-timer">Berakhir dalam {formatRemaining(remaining)}</strong>
		</div>

		<AppLayout data={{ demo: true }}>
			{#snippet children()}
				<CashierPage />
			{/snippet}
		</AppLayout>
	</div>
{/if}

<style>
	.demo-route {
		min-height: 100vh;
		background: var(--paper, #f8fafc);
	}

	.demo-notice {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		min-height: 48px;
		padding: 8px clamp(16px, 3vw, 40px);
		border-bottom: 1px solid var(--line, #e2e8f0);
		background: var(--surface, #fff);
		color: var(--ink, #0f172a);
		font-size: 12px;
	}

	.demo-notice > div {
		display: grid;
		gap: 2px;
	}

	.demo-notice span {
		color: var(--ink-soft, #475569);
		font-size: 11px;
	}

	.demo-timer {
		flex: 0 0 auto;
		color: var(--orange, #2563eb);
		font-variant-numeric: tabular-nums;
	}

	.demo-state {
		display: grid;
		justify-items: center;
		gap: 10px;
		min-height: 100vh;
		padding: 28vh 24px 80px;
		background: var(--brand-bg, #efefef);
		color: var(--brand-ink, #111);
		text-align: center;
	}

	.demo-state strong {
		font-size: 22px;
	}

	.demo-state span {
		max-width: 440px;
		color: var(--brand-ink-soft, #52525b);
		font-size: 14px;
		line-height: 1.6;
	}

	.demo-state .btn-pill {
		margin-top: 8px;
	}

	@media (max-width: 640px) {
		.demo-notice {
			align-items: flex-start;
			flex-direction: column;
			gap: 3px;
			padding-block: 10px;
		}

		.demo-timer {
			font-size: 11px;
		}
	}
</style>
