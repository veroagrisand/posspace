<script lang="ts">
	let {
		items = [
			{ href: '#fitur', label: 'Fitur' },
			{ href: '#harga', label: 'Harga' },
			{ href: '#faq', label: 'FAQ' }
		],
		ctaLabel = 'Coba gratis',
		ctaHref = '/register',
		secondaryLabel = 'Masuk',
		secondaryHref = '/login',
		note = ''
	}: {
		items?: { href: string; label: string }[];
		ctaLabel?: string;
		ctaHref?: string;
		secondaryLabel?: string;
		secondaryHref?: string;
		note?: string;
	} = $props();

	let menuOpen = $state(false);
</script>

<div class="pub-nav-wrap">
	<nav class="pub-nav" aria-label="Navigasi utama">
		<div class="pub-nav-left">
			<a class="pub-nav-logo" href="/" aria-label="posspace beranda">
				<span class="mark">ps</span>
				<span class="word">posspace</span>
			</a>
			<div class="pub-nav-links">
				{#each items as item}
					<a href={item.href}>{item.label}</a>
				{/each}
			</div>
		</div>
		<div class="pub-nav-right">
			{#if note}
				<span class="pub-nav-note">{note}</span>
			{/if}
			<a class="btn-pill btn-pill--ghost btn-pill--sm" href={secondaryHref}>{secondaryLabel}</a>
			<a class="btn-pill btn-pill--dark btn-pill--sm" href={ctaHref}>
				<span class="roll"><span class="roll-inner"><span class="roll-line">{ctaLabel}</span><span class="roll-line">{ctaLabel}</span></span></span>
				<span class="btn-arrow">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
				</span>
			</a>
		</div>
		<button class="pub-nav-burger" type="button" aria-label="Buka menu" aria-expanded={menuOpen} onclick={() => (menuOpen = true)}>
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
		</button>
	</nav>
</div>

{#if menuOpen}
	<div class="pub-mobile-menu" role="dialog" aria-modal="true" aria-label="Menu navigasi">
		<div class="pub-mobile-sheet">
			<nav>
				{#each items as item}
					<a href={item.href} onclick={() => (menuOpen = false)}>{item.label}</a>
				{/each}
			</nav>
			<div class="row">
				<a class="btn-pill btn-pill--ghost" href={secondaryHref} onclick={() => (menuOpen = false)}>{secondaryLabel}</a>
				<a class="btn-pill btn-pill--orange" href={ctaHref} onclick={() => (menuOpen = false)}>
					<span>{ctaLabel}</span>
					<span class="btn-arrow">
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
					</span>
				</a>
			</div>
		</div>
	</div>
{/if}