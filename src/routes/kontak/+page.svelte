<script lang="ts">
	import PublicPolicyShell from '$lib/components/PublicPolicyShell.svelte';
	import { businessContact, businessMapUrl, businessPhoneHref } from '$lib/site';
</script>

<PublicPolicyShell
	title="Kontak"
	eyebrow="HUBUNGI KAMI"
	intro="Kami siap membantu pertanyaan tentang akun, toko, pembayaran, dan penggunaan posspace."
>
	<h2>Informasi usaha</h2>
	<div class="contact-grid">
		<a class="contact-card" href={`mailto:${businessContact.email}`}>
			<span class="contact-label">EMAIL</span>
			<strong>{businessContact.email}</strong>
			<small>Kirim pertanyaan atau permintaan bantuan</small>
		</a>
		<a class="contact-card" href={businessPhoneHref}>
			<span class="contact-label">TELEPON</span>
			<strong>{businessContact.phone}</strong>
			<small>Hubungi pada jam dukungan</small>
		</a>
		<div class="contact-card">
			<span class="contact-label">JAM DUKUNGAN</span>
			<strong>Senin - Jumat</strong>
			<small>09.00 - 17.00 WIB</small>
		</div>
	</div>

	<h2>Alamat usaha</h2>
	<address>{businessContact.address}</address>
	<a class="contact-map-link" href={businessMapUrl} target="_blank" rel="noopener">Buka alamat di Google Maps &rarr;</a>

	<h2>Informasi saat menghubungi kami</h2>
	<p>Agar kami dapat membantu lebih cepat, sertakan email akun posspace, nama toko, nomor invoice atau transaksi jika terkait pembayaran, serta waktu dan detail masalah yang Anda alami.</p>

	<p>Untuk pertanyaan umum, baca juga halaman <a href="/faq">FAQ</a>. Untuk pembayaran, lihat <a href="/refund-policy">Refund Policy</a> dan <a href="/terms-and-conditions">Syarat &amp; Ketentuan</a>.</p>
</PublicPolicyShell>

<style>
	.contact-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 12px;
		margin: 18px 0 32px;
	}

	.contact-card {
		display: flex;
		flex-direction: column;
		min-height: 126px;
		padding: 16px;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: #fbfcf9;
	}

	.contact-card:hover {
		border-color: #a9c4ad;
		background: var(--green-soft);
	}

	.contact-label {
		margin-bottom: 12px;
		color: var(--orange-dark);
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 0.12em;
	}

	.contact-card strong {
		font-family: var(--font-display);
		font-size: 14px;
	}

	.contact-card small {
		margin-top: 6px;
		color: var(--muted);
		font-size: 11px;
		line-height: 1.5;
	}

	address {
		max-width: 560px;
		margin: 12px 0;
		padding: 16px 18px;
		border-left: 3px solid var(--orange);
		color: var(--ink-soft);
		font-size: 14px;
		font-style: normal;
		line-height: 1.7;
	}

	.contact-map-link {
		display: inline-block;
		margin-bottom: 12px;
		font-size: 12px;
	}

	@media (max-width: 680px) {
		.contact-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
