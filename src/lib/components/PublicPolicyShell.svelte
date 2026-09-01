<script lang="ts">
	import PublicNav from './PublicNav.svelte';
	import PublicFooter from './PublicFooter.svelte';
	import type { Snippet } from 'svelte';

	let {
		title,
		intro,
		eyebrow = 'VERIFIKASI APLIKASI',
		children
	}: {
		title: string;
		intro: string;
		eyebrow?: string;
		children: Snippet;
	} = $props();
</script>

<svelte:head><title>{title} — posspace</title></svelte:head>

<div class="auth-page">
	<div class="wrap" style="padding-top:8px">
		<PublicNav
			items={[
				{ href: '/', label: 'Beranda' },
				{ href: '/faq', label: 'FAQ' },
				{ href: '/refund-policy', label: 'Refund Policy' },
				{ href: '/terms-and-conditions', label: 'Syarat & Ketentuan' }
			]}
			ctaLabel="Kontak"
			ctaHref="/kontak"
			secondaryLabel="Harga"
			secondaryHref="/#harga"
		/>
	</div>

	<main class="policy-main">
		<div class="policy-card">
			<a class="auth-back" href="/">← Kembali ke posspace</a>
			<span class="eyebrow">{eyebrow}</span>
			<h1>{title}</h1>
			<p>{intro}</p>

			<div class="policy-body">
				{@render children()}
			</div>
		</div>
	</main>

	<PublicFooter />
</div>