<script lang="ts">
	import PublicNav from '$lib/components/PublicNav.svelte';
	import PublicFooter from '$lib/components/PublicFooter.svelte';
	import { getBrowserClient } from '$lib/supabase';
	import { isDemoMode } from '$lib/demo';

	// Token recovery diambil dari URL hash SEBELUM klien Supabase membersihkannya.
	const hashParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.hash.slice(1)) : null;
	const hashAccessToken = hashParams?.get('access_token') ?? '';
	const hashRefreshToken = hashParams?.get('refresh_token') ?? '';
	const hasRecovery = Boolean(hashAccessToken) && hashParams?.get('type') === 'recovery';

	type Step = 'checking' | 'form' | 'done';

	let step = $state<Step>(hasRecovery ? 'form' : 'checking');
	let password = $state('');
	let confirmPassword = $state('');
	let error = $state('');
	let submitting = $state(false);

	$effect(() => {
		if (step !== 'checking') return;
		(async () => {
			const supabase = getBrowserClient();
			if (!supabase) {
				error = 'Reset kata sandi hanya tersedia saat autentikasi aktif.';
				step = 'checking';
				return;
			}
			if (hasRecovery) {
				step = 'form';
				return;
			}
			const { data } = await supabase.auth.getSession();
			const isRecovery = (data.session as { token_type?: string } | null)?.token_type === 'recovery';
			if (isRecovery) {
				step = 'form';
			} else {
				error = 'Tautan tidak valid atau sudah kedaluwarsa. Minta tautan baru untuk melanjutkan.';
			}
		})();
	});

	async function handleSubmit() {
		error = '';
		if (password.length < 8) {
			error = 'Kata sandi minimal 8 karakter.';
			return;
		}
		if (password !== confirmPassword) {
			error = 'Konfirmasi kata sandi tidak cocok.';
			return;
		}
		submitting = true;
		try {
			const supabase = getBrowserClient();
			if (!supabase) {
				error = 'Reset kata sandi hanya tersedia saat autentikasi aktif.';
				return;
			}
			// Pastikan sesi recovery ada (tokens dari link email), lalu tetapkan kata sandi baru.
			if (hashAccessToken && hashRefreshToken) {
				await supabase.auth.setSession({ access_token: hashAccessToken, refresh_token: hashRefreshToken });
			}
			const { data: { session } } = await supabase.auth.getSession();
			if (!session) {
				error = 'Sesi reset tidak ditemukan. Buka lagi tautan dari email.';
				return;
			}
			const { error: updateError } = await supabase.auth.updateUser({ password });
			if (updateError) {
				error = updateError.message.includes('same password')
					? 'Kata sandi baru tidak boleh sama dengan yang lama.'
					: 'Gagal mengatur ulang kata sandi. Coba lagi.';
				return;
			}
			step = 'done';
			window.setTimeout(() => (window.location.href = '/login'), 1200);
		} catch {
			error = 'Terjadi kesalahan jaringan. Coba lagi.';
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head><title>Atur ulang kata sandi — posspace</title></svelte:head>

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
			<h1>Atur ulang kata sandi</h1>

			{#if isDemoMode()}
				<div class="auth-note" style="margin-top:18px">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5c0 4.6-2.9 8-7 10-4.1-2-7-5.4-7-10V6l7-3Z" /><path d="M12 9v4M12 16h.01" /></svg>
					<span>Mode demo belum mendukung reset kata sandi. Konfigurasi Supabase dulu untuk autentikasi penuh.</span>
				</div>
			{:else if step === 'checking'}
				<p style="color:var(--brand-muted);font-size:13px;line-height:1.6">Memeriksa tautan Anda...</p>
				{#if error}
					<div class="auth-note" style="margin-top:16px">
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5c0 4.6-2.9 8-7 10-4.1-2-7-5.4-7-10V6l7-3Z" /><path d="M12 9v4M12 16h.01" /></svg>
						<span>{error} <a href="/lupa-password" style="color:var(--brand-orange);font-weight:700">Minta tautan baru</a></span>
					</div>
				{/if}
			{:else if step === 'form'}
				<p>Buat kata sandi baru untuk akun Anda.</p>
				<form class="auth-form" onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
					<div class="field">
						<label for="password">Kata sandi baru</label>
						<div class="field-input">
							<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
							<input id="password" type="password" bind:value={password} placeholder="Minimal 8 karakter" autocomplete="new-password" required />
						</div>
					</div>
					<div class="field">
						<label for="confirm-password">Ulangi kata sandi</label>
						<div class="field-input">
							<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
							<input id="confirm-password" type="password" bind:value={confirmPassword} placeholder="Ulangi kata sandi" autocomplete="new-password" required />
						</div>
					</div>

					{#if error}
						<p class="auth-error">{error}</p>
					{/if}

					<button class="auth-submit" type="submit" disabled={submitting}>
						{submitting ? 'Menyimpan...' : 'Simpan kata sandi baru'}
					</button>
				</form>
			{:else}
				<div class="auth-notice" style="margin-top:16px">
					Kata sandi berhasil diperbarui. Mengarahkan ke halaman masuk...
				</div>
			{/if}

			<p class="auth-switch">Sudah ingat kata sandi? <a href="/login">Masuk</a></p>
		</div>
	</main>

	<PublicFooter />
</div>