<script lang="ts">
	import '../../lib/css/landing.css';
	import BrandLogo from '$lib/components/BrandLogo.svelte';
</script>

<svelte:head><title>Setup — posspace</title></svelte:head>

<div class="au-page">
	<aside class="au-visual">
		<div>
			<BrandLogo variant="dark" />
			<h2>Konfigurasi backend diperlukan.</h2>
		</div>
	</aside>
	<main class="au-form-wrap">
		<h1>Aplikasi belum dikonfigurasi</h1>
		<p>
			Backend Supabase belum dikonfigurasi di file <code>.env</code>. Isi <code>SUPABASE_URL</code>,
			<code>SUPABASE_ANON_KEY</code>, dan <code>SUPABASE_SERVICE_ROLE_KEY</code> lalu jalankan migration di
			<code>supabase/migrations/0001_init.sql</code>.
		</p>
		<pre style="background:#20372b;color:#dce8dd;padding:14px;border-radius:10px;font-size:11px;line-height:1.6;overflow:auto;margin-top:16px">supabase db push
# atau tempel SQL di Supabase SQL Editor</pre>
		<a class="lp-cta lp-cta-primary" style="margin-top:18px" href="/">Kembali ke beranda</a>
	</main>
</div>