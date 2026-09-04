<script lang="ts">
	import { page } from '$app/state';

	const status = $derived(page.status || 500);
	const isAccessError = $derived(status === 401 || status === 403);
	const title = $derived.by(() => {
		if (status === 404) return 'Halaman tidak ditemukan';
		if (status === 401) return 'Akses memerlukan login';
		if (status === 403) return 'Akses tidak diizinkan';
		if (status >= 500) return 'Terjadi gangguan';
		return 'Permintaan tidak dapat diproses';
	});
	const description = $derived.by(() => {
		if (status === 404) return 'Direktori atau alamat yang Anda buka tidak tersedia, sudah dipindahkan, atau tidak lagi aktif.';
		if (status === 401) return 'Masuk dengan akun posspace untuk melanjutkan ke halaman ini.';
		if (status === 403) return 'Akun Anda belum memiliki izin untuk membuka halaman ini. Gunakan akun yang sesuai atau hubungi admin.';
		if (status >= 500) return 'Layanan sedang mengalami kendala. Coba lagi beberapa saat lagi.';
		return 'Permintaan Anda tidak bisa diselesaikan. Periksa alamat halaman lalu coba lagi.';
	});

	function retry() {
		window.location.reload();
	}
</script>

<svelte:head>
	<title>{status} - {title} - posspace</title>
	<meta name="description" content={description} />
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="error-page" aria-labelledby="error-title">
	<div class="error-frame">
		<a class="error-brand" href="/" aria-label="posspace beranda">
			<span class="error-brand-mark" aria-hidden="true">ps</span>
			<span>posspace</span>
		</a>

		<div class="error-content">
			<p class="error-kicker"><span aria-hidden="true"></span> POSSPACE / ERROR</p>
			<p class="error-status" aria-label={`Kode error ${status}`}>{status}</p>
			<h1 id="error-title">{title}</h1>
			<p class="error-description">{description}</p>

			<div class="error-actions">
				<a class="error-action error-action--primary" href="/">
					Kembali ke beranda
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
				</a>
				{#if isAccessError}
					<a class="error-action error-action--secondary" href="/login">Masuk atau ganti akun</a>
				{:else if status >= 500}
					<button class="error-action error-action--secondary" type="button" onclick={retry}>Coba lagi</button>
				{/if}
			</div>
		</div>

		<p class="error-path">Alamat yang diminta: <code>{page.url.pathname}</code></p>
	</div>
</main>

<style>
	.error-page {
		display: grid;
		place-items: center;
		min-height: 100svh;
		padding: 32px 20px;
		background:
			radial-gradient(circle at 12% 18%, rgba(242, 101, 34, 0.1), transparent 30%),
			var(--brand-bg);
	}

	.error-frame {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		width: min(100%, 920px);
		min-height: min(640px, calc(100svh - 64px));
		padding: clamp(24px, 5vw, 52px);
		border: 1px solid var(--brand-line);
		border-radius: 28px;
		background: var(--brand-paper);
		box-shadow: var(--brand-shadow-hover);
		overflow: hidden;
	}

	.error-brand {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		width: fit-content;
		font-size: 15px;
		font-weight: 600;
		letter-spacing: -0.02em;
	}

	.error-brand-mark {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		border-radius: 999px;
		background: var(--brand-dark);
		color: #fff;
		font-size: 13px;
	}

	.error-content {
		max-width: 660px;
		margin-block: 72px;
	}

	.error-kicker {
		display: flex;
		align-items: center;
		gap: 9px;
		color: var(--brand-orange);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.14em;
	}

	.error-kicker span {
		width: 8px;
		height: 8px;
		border-radius: 999px;
		background: currentColor;
	}

	.error-status {
		margin-top: 20px;
		color: var(--brand-dark);
		font-size: clamp(6.5rem, 20vw, 12rem);
		font-weight: 500;
		line-height: 0.8;
		letter-spacing: -0.09em;
	}

	.error-content h1 {
		margin-top: 28px;
		font-size: clamp(1.8rem, 4vw, 3.2rem);
		font-weight: 500;
		letter-spacing: -0.04em;
		line-height: 1.08;
	}

	.error-description {
		max-width: 540px;
		margin-top: 14px;
		color: var(--brand-ink-soft);
		font-size: 15px;
		line-height: 1.7;
	}

	.error-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin-top: 28px;
	}

	.error-action {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		min-height: 44px;
		padding: 0 18px;
		border: 1px solid transparent;
		border-radius: 999px;
		font-size: 13px;
		font-weight: 600;
	}

	.error-action svg {
		width: 15px;
		height: 15px;
	}

	.error-action--primary {
		background: var(--brand-orange);
		color: #fff;
	}

	.error-action--primary:hover {
		background: var(--brand-orange-hover);
	}

	.error-action--secondary {
		border-color: var(--brand-line-strong);
		background: transparent;
		color: var(--brand-ink);
	}

	.error-action--secondary:hover {
		border-color: var(--brand-ink);
	}

	.error-path {
		padding-top: 18px;
		border-top: 1px solid var(--brand-line);
		color: var(--brand-muted);
		font-size: 11px;
		line-height: 1.5;
	}

	.error-path code {
		color: var(--brand-ink-soft);
		word-break: break-all;
	}

	@media (max-width: 600px) {
		.error-page {
			padding: 12px;
		}

		.error-frame {
			min-height: calc(100svh - 24px);
			border-radius: 20px;
		}

		.error-content {
			margin-block: 56px;
		}

		.error-actions,
		.error-action {
			width: 100%;
		}
	}
</style>
