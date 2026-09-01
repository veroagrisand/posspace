<script lang="ts">
	import PublicNav from '$lib/components/PublicNav.svelte';
	import PublicFooter from '$lib/components/PublicFooter.svelte';
</script>

<svelte:head><title>Setup — posspace</title></svelte:head>

<div class="auth-page">
	<div class="wrap" style="padding-top:8px">
		<PublicNav items={[{ href: '/', label: 'Beranda' }]} ctaLabel="Masuk" ctaHref="/login" secondaryLabel="Harga" secondaryHref="/#harga" />
	</div>

	<main class="auth-main">
		<div class="auth-card">
			<h1>Aplikasi belum dikonfigurasi</h1>
			<p>
				Backend Supabase belum dikonfigurasi di file <code>.env</code>. Isi <code>SUPABASE_URL</code>,
				<code>SUPABASE_ANON_KEY</code>, dan <code>SUPABASE_SERVICE_ROLE_KEY</code> lalu jalankan migration di
				<code>supabase/migrations/0001_init.sql</code>.
			</p>
			<pre style="background:#18181b;color:#d4d4d8;padding:14px;border-radius:12px;font-size:12px;line-height:1.6;overflow:auto;margin-top:16px">supabase db push
# atau tempel SQL di Supabase SQL Editor</pre>
			<a class="btn-pill btn-pill--orange btn-pill--block" style="margin-top:18px" href="/">
				Kembali ke beranda
				<span class="btn-arrow"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg></span>
			</a>
		</div>
	</main>

	<PublicFooter />
</div>