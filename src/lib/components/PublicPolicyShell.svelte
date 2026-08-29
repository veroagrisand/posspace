<script lang="ts">
	import '../css/landing.css';
	import BrandLogo from './BrandLogo.svelte';
	import type { Snippet } from 'svelte';
	import { businessContact, businessPhoneHref } from '$lib/site';

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

<div class="public-policy-page">
	<header class="public-policy-nav">
		<a href="/" aria-label="posspace beranda"><BrandLogo variant="light" /></a>
		<nav aria-label="Navigasi informasi">
			<a href="/">Beranda</a>
			<a href="/faq">FAQ</a>
			<a href="/refund-policy">Refund Policy</a>
			<a href="/terms-and-conditions">Syarat &amp; Ketentuan</a>
			<a class="public-policy-nav-contact" href="/kontak">Kontak</a>
		</nav>
	</header>

	<main class="public-policy-main">
		<a class="public-policy-back" href="/">&larr; Kembali ke posspace</a>
		<header class="public-policy-hero">
			<span class="public-policy-eyebrow">{eyebrow}</span>
			<h1>{title}</h1>
			<p>{intro}</p>
		</header>

		<article class="public-policy-card">
			{@render children()}
		</article>
	</main>

	<footer class="public-policy-footer">
		<div>
			<strong>{businessContact.name}</strong>
			<span>POS kasir dan stok untuk coffee shop Indonesia.</span>
		</div>
		<div class="public-policy-footer-contact">
			<a href={`mailto:${businessContact.email}`}>{businessContact.email}</a>
			<a href={businessPhoneHref}>{businessContact.phone}</a>
			<span>{businessContact.address}</span>
		</div>
	</footer>
</div>

<style>
	.public-policy-page {
		min-height: 100vh;
		background: var(--paper);
	}

	.public-policy-nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24px;
		min-height: 72px;
		padding: 0 max(22px, calc((100% - 1120px) / 2));
		background: var(--forest-900);
	}

	.public-policy-nav nav {
		display: flex;
		align-items: center;
		gap: clamp(12px, 2vw, 26px);
		color: #c8d7cb;
		font-size: 12px;
	}

	.public-policy-nav nav a:hover {
		color: #fff;
	}

	.public-policy-nav-contact {
		padding: 9px 14px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 999px;
		color: #fff;
	}

	.public-policy-main {
		max-width: 860px;
		margin: 0 auto;
		padding: 42px 22px 72px;
	}

	.public-policy-back {
		display: inline-block;
		margin-bottom: 34px;
		color: var(--muted);
		font-size: 12px;
		font-weight: 600;
	}

	.public-policy-back:hover {
		color: var(--forest-700);
	}

	.public-policy-hero {
		max-width: 720px;
		margin-bottom: 28px;
	}

	.public-policy-eyebrow {
		color: var(--orange-dark);
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 0.14em;
	}

	.public-policy-hero h1 {
		margin: 10px 0 0;
		font-family: var(--font-display);
		font-size: clamp(32px, 5vw, 52px);
		letter-spacing: -0.06em;
		line-height: 1.02;
	}

	.public-policy-hero p {
		max-width: 650px;
		margin: 16px 0 0;
		color: var(--ink-soft);
		font-size: 15px;
		line-height: 1.75;
	}

	.public-policy-card {
		padding: clamp(24px, 5vw, 46px);
		border: 1px solid var(--line);
		border-radius: 20px;
		background: var(--surface);
		box-shadow: var(--shadow);
	}

	.public-policy-card :global(h2) {
		margin: 30px 0 10px;
		font-family: var(--font-display);
		font-size: 21px;
		letter-spacing: -0.04em;
	}

	.public-policy-card :global(h2:first-child) {
		margin-top: 0;
	}

	.public-policy-card :global(h3) {
		margin: 22px 0 7px;
		font-size: 15px;
	}

	.public-policy-card :global(p),
	.public-policy-card :global(li) {
		color: var(--ink-soft);
		font-size: 13px;
		line-height: 1.75;
	}

	.public-policy-card :global(p) {
		margin: 0 0 14px;
	}

	.public-policy-card :global(ul),
	.public-policy-card :global(ol) {
		margin: 8px 0 18px;
		padding-left: 22px;
	}

	.public-policy-card :global(a) {
		color: var(--forest-700);
		font-weight: 700;
	}

	.public-policy-card :global(a:hover) {
		color: var(--orange-dark);
	}

	.public-policy-card :global(details) {
		padding: 16px 0;
		border-bottom: 1px solid var(--line);
	}

	.public-policy-card :global(details:first-child) {
		padding-top: 0;
	}

	.public-policy-card :global(details:last-child) {
		border-bottom: 0;
	}

	.public-policy-card :global(summary) {
		cursor: pointer;
		font-size: 14px;
		font-weight: 700;
		list-style: none;
	}

	.public-policy-card :global(summary::-webkit-details-marker) {
		display: none;
	}

	.public-policy-card :global(summary::after) {
		float: right;
		color: var(--orange-dark);
		content: '+';
		font-size: 18px;
	}

	.public-policy-card :global(details[open] summary::after) {
		content: '\2212';
	}

	.public-policy-card :global(details p) {
		margin: 10px 28px 0 0;
	}

	.public-policy-footer {
		display: flex;
		justify-content: space-between;
		gap: 28px;
		padding: 30px max(22px, calc((100% - 1120px) / 2));
		border-top: 1px solid rgba(32, 55, 43, 0.08);
		background: #f2f0ea;
		color: var(--muted);
		font-size: 11px;
		line-height: 1.6;
	}

	.public-policy-footer strong,
	.public-policy-footer span,
	.public-policy-footer a {
		display: block;
	}

	.public-policy-footer strong {
		margin-bottom: 4px;
		color: var(--ink);
		font-family: var(--font-display);
		font-size: 16px;
	}

	.public-policy-footer-contact {
		max-width: 420px;
		text-align: right;
	}

	.public-policy-footer-contact a {
		color: var(--forest-700);
		font-weight: 700;
	}

	@media (max-width: 680px) {
		.public-policy-nav {
			align-items: flex-start;
			flex-direction: column;
			padding-top: 18px;
			padding-bottom: 18px;
		}

		.public-policy-nav nav {
			flex-wrap: wrap;
			gap: 11px 16px;
		}

		.public-policy-main {
			padding-top: 28px;
		}

		.public-policy-footer {
			flex-direction: column;
		}

		.public-policy-footer-contact {
			text-align: left;
		}
	}
</style>
