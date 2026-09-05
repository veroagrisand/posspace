<script lang="ts">
	import PublicNav from '$lib/components/PublicNav.svelte';
	import PublicFooter from '$lib/components/PublicFooter.svelte';
	import { getBrowserClient } from '$lib/supabase';
	import { isDemoMode } from '$lib/demo';

	let email = $state('');
	let error = $state('');
	let notice = $state('');
	let submitting = $state(false);

	function isEmailValid() {
		return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
	}

	async function handleSubmit() {
		error = '';
		notice = '';
		if (!isEmailValid()) {
			error = 'Format email tidak valid.';
			return;
		}
		submitting = true;
		try {
			const supabase = getBrowserClient();
			if (!supabase) {
				error = 'Reset kata sandi hanya tersedia saat autentikasi aktif.';
				return;
			}
			const redirectTo = `${window.location.origin}/reset-password`;
			const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
			if (resetError) {
				error = resetError.message === 'Email rate limit exceeded'
					? 'Terlalu banyak permintaan. Tunggu beberapa saat lalu coba lagi.'
					: 'Gagal mengirim tautan reset. Periksa kembali email Anda.';
				return;
			}
			// Jangan ungkap apakah email terdaftar — tampilkan pesan umum.
			notice = `Jika email ${email.trim()} terdaftar, kami telah mengirimkan tautan untuk mengatur ulang kata sandi. Periksa kotak masuk (termasuk folder spam).`;
			email = '';
		} catch {
			error = 'Terjadi kesalahan jaringan. Coba lagi.';
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head><title>Lupa kata sandi — posspace</title></svelte:head>

<div class="auth-page">
	<div class="wrap" style="padding-top:8px">
		<PublicNav items={[{ href: '/', label: 'Beranda' }]} ctaLabel="Masuk" ctaHref="/login" secondaryLabel="Harga" secondaryHref="/#harga" />
	</div>

	<main class="auth-main">
		<div class="auth-card">
			<a class="auth-back" href="/login">
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
				Kembali ke halaman masuk
			</a>
			<h1>Lupa kata sandi?</h1>
			<p>Masukkan email akun Anda. Kami akan mengirimkan tautan untuk mengatur ulang kata sandi.</p>

			{#if isDemoMode()}
				<div class="auth-note" style="margin-top:18px">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5c0 4.6-2.9 8-7 10-4.1-2-7-5.4-7-10V6l7-3Z" /><path d="M12 9v4M12 16h.01" /></svg>
					<span>Mode demo belum mendukung reset kata sandi. Konfigurasi Supabase dulu untuk autentikasi penuh.</span>
				</div>
			{/if}

			{#if notice}
				<div class="auth-notice" style="margin-top:16px">{notice}</div>
			{:else}
				<form class="auth-form" onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
					<div class="field">
						<label for="email">Email</label>
						<div class="field-input">
							<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v12H4z" /><path d="m4 7 8 6 8-6" /></svg>
							<input id="email" type="email" bind:value={email} placeholder="nama@posspace.id" autocomplete="email" required />
						</div>
					</div>

					{#if error}
						<p class="auth-error">{error}</p>
					{/if}

					<button class="auth-submit" type="submit" disabled={submitting}>
						{submitting ? 'Mengirim tautan...' : 'Kirim tautan reset'}
					</button>
				</form>
			{/if}

			<p class="auth-switch">Sudah ingat kata sandi? <a href="/login">Masuk</a></p>
		</div>
	</main>

	<PublicFooter />
</div>