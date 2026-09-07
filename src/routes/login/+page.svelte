<script lang="ts">
	import PublicNav from '$lib/components/PublicNav.svelte';
	import PublicFooter from '$lib/components/PublicFooter.svelte';
	import { getBrowserClient } from '$lib/supabase';
	import { loginDemo, isDemoMode } from '$lib/demo';

	let step = $state<'login' | 'changePassword'>('login');
	let email = $state('');
	let password = $state('');
	let showPassword = $state(false);
	let newPassword = $state('');
	let confirmPassword = $state('');
	let showNewPassword = $state(false);
	let error = $state('');
	let submitting = $state(false);
	let success = $state(false);
	let dest = '/app';

	async function handleSubmit() {
		error = '';
		if (!email.trim() || !password) {
			error = 'Isi email dan kata sandi Anda.';
			return;
		}
		submitting = true;
		try {
			const supabase = getBrowserClient();
			if (supabase) {
				const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
				if (authError) {
					error = /email not confirmed/i.test(authError.message)
						? 'Email belum diverifikasi. Hubungi pemilik toko Anda.'
						: 'Email atau kata sandi salah.';
					submitting = false;
					return;
				}
				const isAdmin = authData.user
					? !!(await supabase.from('platform_admins').select('user_id').eq('user_id', authData.user.id).maybeSingle()).data
					: false;
				dest = isAdmin ? '/admin' : '/app';
				// Anggota baru (diundang pemilik): akun langsung aktif, tapi wajib
				// mengganti kata sandi sementara pada login pertama — tanpa verifikasi email.
				if (authData.user?.user_metadata?.must_change_password) {
					step = 'changePassword';
					submitting = false;
					return;
				}
			} else {
				const user = loginDemo(email, password);
				if (!user) {
					error = 'Akun belum terdaftar. Coba daftar terlebih dahulu.';
					submitting = false;
					return;
				}
			}
			success = true;
			window.location.href = dest;
		} catch {
			error = 'Terjadi kesalahan. Silakan coba lagi.';
			submitting = false;
		}
	}

	async function handleChangePassword() {
		error = '';
		if (newPassword.length < 8) {
			error = 'Kata sandi baru minimal 8 karakter.';
			return;
		}
		if (newPassword !== confirmPassword) {
			error = 'Konfirmasi kata sandi tidak sama.';
			return;
		}
		submitting = true;
		try {
			const supabase = getBrowserClient();
			if (!supabase) {
				error = 'Mode demo tidak mendukung penggantian kata sandi.';
				submitting = false;
				return;
			}
			const { error: pwError } = await supabase.auth.updateUser({ password: newPassword });
			if (pwError) {
				error = 'Gagal mengganti kata sandi: ' + pwError.message;
				submitting = false;
				return;
			}
			// Hapus tanda "wajib ganti password" dari metadata agar tidak diminta lagi.
			const { data: sessionData } = await supabase.auth.getUser();
			const meta = { ...(sessionData.user?.user_metadata ?? {}) };
			delete meta.must_change_password;
			await supabase.auth.updateUser({ data: meta });
			success = true;
			window.location.href = dest;
		} catch {
			error = 'Terjadi kesalahan. Silakan coba lagi.';
			submitting = false;
		}
	}
</script>

<svelte:head><title>Masuk - posspace</title></svelte:head>

<div class="auth-page">
	<div class="wrap" style="padding-top:8px">
		<PublicNav items={[{ href: '/', label: 'Beranda' }]} ctaLabel="Daftar gratis" ctaHref="/register" secondaryLabel="Harga" secondaryHref="/#harga" />
	</div>

	<main class="auth-main">
		<div class="auth-card">
			<a class="auth-back" href="/">
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
				Kembali ke beranda
			</a>

			{#if step === 'login'}
				<h1>Masuk ke akun Anda</h1>
				<p>
					{isDemoMode()
						? 'Mode demo: data masuk tersimpan di browser ini. Untuk autentikasi penuh, isi kredensial Supabase di file .env.'
						: 'Masuk untuk membuka shift, melayani pesanan, dan memantau stok real-time di semua perangkat.'}
				</p>
			{:else}
				<h1>Aktifkan akun: ganti kata sandi</h1>
				<p>Anda masuk dengan kata sandi sementara dari pemilik toko. Buat kata sandi baru untuk melanjutkan.</p>
			{/if}

			{#if isDemoMode() && step === 'login'}
				<div class="auth-note" style="margin-top:18px">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5c0 4.6-2.9 8-7 10-4.1-2-7-5.4-7-10V6l7-3Z" /><path d="M12 9v4M12 16h.01" /></svg>
					<span>Akun demo belum ada? <a href="/register" style="color:var(--brand-orange);font-weight:700">Daftar dulu di sini</a>, butuh waktu kurang dari 30 detik.</span>
				</div>
			{/if}

			{#if step === 'login'}
				<form class="auth-form" onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
					{#if error}
						<p class="auth-error" id="login-error" role="alert">{error}</p>
					{/if}
					<div class="field">
						<label for="email">Email</label>
						<div class="field-input">
							<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v12H4z" /><path d="m4 7 8 6 8-6" /></svg>
							<input id="email" type="email" bind:value={email} placeholder="nama@posspace.id" autocomplete="email" required aria-invalid={error ? 'true' : undefined} aria-describedby={error ? 'login-error' : undefined} />
						</div>
					</div>
					<div class="field">
						<label for="password">Kata sandi <a href="/lupa-password" style="display:inline;color:var(--brand-orange);font-size:12px;font-weight:600;vertical-align:baseline;margin-left:8px">Lupa kata sandi?</a></label>
						<div class="field-input">
							<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
							<input id="password" type={showPassword ? 'text' : 'password'} bind:value={password} placeholder="••••••••" autocomplete="current-password" required aria-invalid={error ? 'true' : undefined} aria-describedby={error ? 'login-error' : undefined} />
							<button
								class="auth-password-toggle"
								type="button"
								aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
								aria-pressed={showPassword}
								title={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
								onclick={() => (showPassword = !showPassword)}
							>
								{#if showPassword}
									<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12s3.5-5 9-5 9 5 9 5-3.5 5-9 5-9-5-9-5Z" /><circle cx="12" cy="12" r="2.5" /></svg>
								{:else}
									<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18M10.6 6.9A9.8 9.8 0 0 1 12 6.8c5.5 0 9 5.2 9 5.2a16.5 16.5 0 0 1-3.1 3.5M6.2 8.4C4.1 9.8 3 12 3 12s3.5 5.2 9 5.2c1 0 1.9-.2 2.7-.5" /></svg>
								{/if}
							</button>
						</div>
					</div>

					<button class="auth-submit" type="submit" disabled={submitting}>
						{submitting ? 'Memproses...' : 'Masuk'}
					</button>
				</form>
			{:else}
				<form class="auth-form" onsubmit={(e) => { e.preventDefault(); handleChangePassword(); }}>
					{#if error}
						<p class="auth-error" id="pw-error" role="alert">{error}</p>
					{/if}
					<div class="field">
						<label for="newPassword">Kata sandi baru (min. 8 karakter)</label>
						<div class="field-input">
							<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
							<input id="newPassword" type={showNewPassword ? 'text' : 'password'} bind:value={newPassword} placeholder="••••••••" autocomplete="new-password" required aria-invalid={error ? 'true' : undefined} aria-describedby={error ? 'pw-error' : undefined} />
						</div>
					</div>
					<div class="field">
						<label for="confirmPassword">Ulangi kata sandi baru</label>
						<div class="field-input">
							<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /><path d="m9 15 2 2 4-4" /></svg>
							<input id="confirmPassword" type={showNewPassword ? 'text' : 'password'} bind:value={confirmPassword} placeholder="••••••••" autocomplete="new-password" required aria-invalid={error ? 'true' : undefined} aria-describedby={error ? 'pw-error' : undefined} />
							<button
								class="auth-password-toggle"
								type="button"
								aria-label={showNewPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
								aria-pressed={showNewPassword}
								onclick={() => (showNewPassword = !showNewPassword)}
							>
								{#if showNewPassword}
									<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12s3.5-5 9-5 9 5 9 5-3.5 5-9 5-9-5-9-5Z" /><circle cx="12" cy="12" r="2.5" /></svg>
								{:else}
									<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18M10.6 6.9A9.8 9.8 0 0 1 12 6.8c5.5 0 9 5.2 9 5.2a16.5 16.5 0 0 1-3.1 3.5M6.2 8.4C4.1 9.8 3 12 3 12s3.5 5.2 9 5.2c1 0 1.9-.2 2.7-.5" /></svg>
								{/if}
							</button>
						</div>
					</div>

					<button class="auth-submit" type="submit" disabled={submitting}>
						{submitting ? 'Menyimpan...' : 'Simpan kata sandi baru'}
					</button>
				</form>
			{/if}

			{#if success}
				<p class="auth-notice" style="margin-top:14px;text-align:center">Berhasil, mengarahkan ke aplikasi...</p>
			{/if}

			{#if step === 'login'}
				<p class="auth-switch">Belum punya akun? <a href="/register">Daftar gratis</a></p>
			{/if}
			<p class="auth-terms">Dengan masuk, Anda menyetujui Syarat &amp; Ketentuan dan Kebijakan Privasi posspace.</p>
		</div>
	</main>

	<PublicFooter />
</div>