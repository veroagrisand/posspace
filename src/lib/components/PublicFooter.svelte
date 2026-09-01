<script lang="ts">
	import { businessContact, businessPhoneHref } from '$lib/site';
	import { isSupabaseConfigured } from '$lib/supabase';
	import Toast from './Toast.svelte';

	let notice = $state('');

	function showNotice(message: string) {
		notice = message;
	}
</script>

<footer class="pub-footer">
	<div class="footer-top">
		<div class="wrap">
			<h2>Siap membuat stok kopi<br class="hidden-sm" /> Anda selalu benar?</h2>
			<div class="actions">
				<a class="btn-pill btn-pill--orange" href="/register">
					<span class="roll"><span class="roll-inner"><span class="roll-line">Mulai 14 hari gratis</span><span class="roll-line">Mulai 14 hari gratis</span></span></span>
					<span class="btn-arrow">
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
					</span>
				</a>
				<a class="mail-link" href={`mailto:${businessContact.email}`}>{businessContact.email}</a>
			</div>
		</div>
	</div>

	<div class="wrap">
		<div class="footer-cols">
			<div class="footer-brand">
				<a class="pub-nav-logo" href="/" aria-label="posspace beranda">
					<span class="mark mark--light">ps</span>
					<span class="word" style="color:#fff">posspace</span>
				</a>
				<p>POS kasir kopi sederhana namun kuat dengan stok gudang terintegrasi real-time untuk UMKM coffee shop Indonesia.</p>
				<div class="contact">
					<a href={`mailto:${businessContact.email}`}>{businessContact.email}</a>
					<a href={businessPhoneHref}>{businessContact.phone}</a>
					<address>{businessContact.address}</address>
				</div>
				<span class="badge-pill badge-pill--dark" style="margin-top:16px">
					<span class="badge-dot"></span>
					{isSupabaseConfigured ? 'Terhubung ke Supabase' : 'Mode demo aktif — isi .env untuk Supabase'}
				</span>
			</div>
			<nav class="footer-col" aria-label="Tautan produk">
				<h5>Produk</h5>
				<ul>
					<li><a href="/#fitur">Fitur<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10v10" /><path d="M7 17 17 7" /></svg></a></li>
					<li><a href="/#harga">Harga<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10v10" /><path d="M7 17 17 7" /></svg></a></li>
					<li><a href="/register">Daftar<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10v10" /><path d="M7 17 17 7" /></svg></a></li>
					<li><a href="/login">Masuk<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10v10" /><path d="M7 17 17 7" /></svg></a></li>
				</ul>
			</nav>
			<nav class="footer-col" aria-label="Tautan perusahaan">
				<h5>Perusahaan</h5>
				<ul>
					<li><a href="/#testimoni">Testimoni<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10v10" /><path d="M7 17 17 7" /></svg></a></li>
					<li><a href="/#cara-kerja">Cara kerja<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10v10" /><path d="M7 17 17 7" /></svg></a></li>
					<li><a href="/faq">FAQ<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10v10" /><path d="M7 17 17 7" /></svg></a></li>
					<li><a href="/kontak">Kontak<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10v10" /><path d="M7 17 17 7" /></svg></a></li>
				</ul>
			</nav>
			<nav class="footer-col" aria-label="Tautan verifikasi">
				<h5>Verifikasi Aplikasi</h5>
				<ul>
					<li><a href="/faq">FAQ<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10v10" /><path d="M7 17 17 7" /></svg></a></li>
					<li><a href="/refund-policy">Refund Policy<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10v10" /><path d="M7 17 17 7" /></svg></a></li>
					<li><a href="/terms-and-conditions">Syarat &amp; Ketentuan<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10v10" /><path d="M7 17 17 7" /></svg></a></li>
					<li><button type="button" onclick={() => showNotice('Semua sistem berjalan normal')}>Status Sistem</button></li>
				</ul>
			</nav>
		</div>
	</div>

	<div class="wrap">
		<p class="watermark">posspace</p>
	</div>

	<div class="wrap">
		<div class="footer-bottom">
			<p>© 2026 posspace.id — Dibangun dengan SvelteKit &amp; Supabase.</p>
			<div class="legal">
				<a href="/terms-and-conditions">Syarat &amp; Ketentuan</a>
				<a href="/refund-policy">Kebijakan Refund</a>
				<a href="/kontak">Kontak</a>
			</div>
		</div>
	</div>
</footer>

<Toast message={notice} />

<style>
	.hidden-sm {
		display: none;
	}
	@media (min-width: 640px) {
		.hidden-sm {
			display: inline;
		}
	}
</style>