<script lang="ts">
	import '../../lib/css/landing.css';
	import BrandLogo from '$lib/components/BrandLogo.svelte';
	import { getBrowserClient, isSupabaseConfigured } from '$lib/supabase';
	import { createDemoUser, isDemoMode } from '$lib/demo';

	const url = typeof window !== 'undefined' ? new URL(window.location.href) : null;
	const presetPlan = url?.searchParams.get('plan') ?? 'pro';
	const allowedPlans = ['starter', 'pro', 'tumbuh'];

	type Step = 'email' | 'otp' | 'form';

	let step = $state<Step>('email');
	let email = $state('');
	let code = $state('');
	let name = $state('');
	let shopName = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let plan = $state(allowedPlans.includes(presetPlan) ? presetPlan : 'pro');
	let error = $state('');
	let notice = $state('');
	let submitting = $state(false);
	let success = $state(false);
	let resendCooldown = $state(0);

	const plans = [
		{ id: 'starter', label: 'Starter', note: 'Rp 149rb/bulan · 1 toko & 1 kasir' },
		{ id: 'pro', label: 'Pro', note: 'Rp 349rb/bulan · hingga 3 kasir + laporan HPP' },
		{ id: 'tumbuh', label: 'Tumbuh', note: 'Rp 649rb/bulan · multi-cabang & tanpa batas kasir' }
	];

	function isEmailValid() {
		return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
	}

	async function sendOtp() {
		error = '';
		if (!isEmailValid()) {
			error = 'Format email tidak valid.';
			return;
		}
		submitting = true;
		notice = '';
		try {
			const res = await fetch('/api/auth/otp/request', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email })
			});
			const json = await res.json().catch(() => ({}));
			if (!res.ok) {
				if (res.status === 409) {
					error = 'Email sudah terdaftar. Silakan masuk.';
				} else if (res.status === 429) {
					error = 'Kode sudah dikirim sebelumnya. Tunggu 1 menit sebelum mengirim ulang.';
				} else if (res.status === 503) {
					error = 'Pengiriman email belum dikonfigurasi. Hubungi admin posspace.';
				} else {
					error = json.message ?? 'Gagal mengirim kode. Coba lagi.';
				}
				return;
			}
			step = 'otp';
			notice = json.debugCode
				? `Mode uji coba: kode OTP Anda adalah ${json.debugCode}`
				: `Kode verifikasi 6 digit telah dikirim ke ${email}. Berlaku 10 menit.`;
			startCooldown();
		} catch {
			error = 'Terjadi kesalahan jaringan. Coba lagi.';
		} finally {
			submitting = false;
		}
	}

	function startCooldown() {
		resendCooldown = 60;
		const t = window.setInterval(() => {
			resendCooldown -= 1;
			if (resendCooldown <= 0) window.clearInterval(t);
		}, 1000);
	}

	async function verifyOtpAndContinue(code: string) {
		error = '';
		if (!/^\d{6}$/.test(code)) {
			error = 'Kode harus 6 digit.';
			return;
		}
		submitting = true;
		try {
			const res = await fetch('/api/auth/otp/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, code })
			});
			if (!res.ok) {
				error = res.status === 429 ? 'Terlalu banyak percobaan. Kirim kode baru.' : 'Kode salah atau kedaluwarsa.';
				return;
			}
			step = 'form';
			notice = 'Email terverifikasi. Lengkapi data toko Anda.';
		} catch {
			error = 'Terjadi kesalahan jaringan. Coba lagi.';
		} finally {
			submitting = false;
		}
	}

	async function handleSubmit() {
		error = '';
		if (!name.trim()) {
			error = 'Nama lengkap wajib diisi.';
			return;
		}
		if (!shopName.trim()) {
			error = 'Nama toko wajib diisi.';
			return;
		}
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
			if (supabase) {
				const res = await fetch('/api/auth/register', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						email: email.trim(),
						password,
						confirmPassword,
						fullName: name.trim(),
						shopName: shopName.trim(),
						planId: plan,
						billingPeriod: 'monthly'
					})
				});
				const json = await res.json().catch(() => ({}));
				if (!res.ok) {
					if (res.status === 409) {
						error =
							json.message === 'SHOP_ALREADY_EXISTS'
								? 'Toko sudah pernah dibuat untuk akun ini. Silakan masuk.'
								: 'Email sudah terdaftar. Silakan masuk.';
					} else if (json.message === 'PASSWORD_MISMATCH') {
						error = 'Konfirmasi kata sandi tidak cocok.';
					} else if (res.status === 400) {
						// Sesi OTP habis saat mengisi form → minta verifikasi ulang
						error = 'Sesi verifikasi email sudah kedaluwarsa. Kirim kode baru dan verifikasi ulang.';
						code = '';
						step = 'otp';
					} else error = json.message ?? 'Pendaftaran gagal. Coba lagi.';
					return;
				}
				// login otomatis dengan akun baru
				await supabase.auth.signInWithPassword({ email: email.trim(), password });
			} else {
				createDemoUser({ name: name.trim(), shopName: shopName.trim(), email: email.trim(), password }, plan);
			}
			success = true;
			window.setTimeout(() => {
				window.location.href = '/subscribe?new=1';
			}, 900);
		} catch {
			error = 'Terjadi kesalahan. Silakan coba lagi.';
		} finally {
			submitting = false;
		}
	}

</script>

<svelte:head><title>Daftar — posspace</title></svelte:head>

<div class="au-page">
	<aside class="au-visual">
		<div>
			<BrandLogo variant="dark" />
			<h2>Buat toko Anda selalu punya stok yang benar.</h2>
			<p>Daftar sekali dengan verifikasi email, langsung atur menu dan resep, lalu buka shift kasir pertama Anda.</p>
		</div>
		<figure class="au-quote">
			<p>“Setup-nya cepat, menu dan resep masuk dalam 30 menit. Langsung dipakai berjualan.”</p>
			<figcaption><strong>Budi</strong><small>Pemilik / Manajer Toko</small></figcaption>
		</figure>
	</aside>

	<main class="au-form-wrap">
		<a class="au-back" href="/">
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
			Kembali ke beranda
		</a>
		<h1>Buat akun baru</h1>
		<p>Mulai uji coba 14 hari gratis. Tanpa kartu kredit.</p>

		<div class="au-steps" role="list" aria-label="Langkah pendaftaran">
			<span class:active={step === 'email'} class:done={step !== 'email'}>1 · Email</span>
			<span class:active={step === 'otp'} class:done={step === 'form'}>2 · Kode OTP</span>
			<span class:active={step === 'form'}>3 · Data toko</span>
		</div>

		{#if step === 'email'}
			<form onsubmit={(e) => { e.preventDefault(); sendOtp(); }}>
				<div class="au-field">
					<label for="email">Alamat email</label>
					<div class="au-input">
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v12H4z" /><path d="m4 7 8 6 8-6" /></svg>
						<input id="email" type="email" bind:value={email} placeholder="nama@posspace.id" autocomplete="email" required />
					</div>
				</div>
				{#if error}
					<p class="au-error">{error}</p>
				{/if}
				<button class="au-submit" type="submit" disabled={submitting}>
					{submitting ? 'Mengirim kode...' : 'Kirim kode verifikasi'}
				</button>
			</form>
		{:else if step === 'otp'}
			<form onsubmit={(e) => { e.preventDefault(); verifyOtpAndContinue(code); }}>
				<p style="margin:4px 0 14px;color:#718078;font-size:12px;line-height:1.55">
					Masukkan 6 digit kode yang dikirim ke <strong>{email}</strong>.
				</p>
				<div class="au-field">
					<label for="otp">Kode OTP</label>
					<div class="au-input">
						<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
						<input id="otp" type="text" inputmode="numeric" maxlength="6" bind:value={code} placeholder="••••••" autocomplete="one-time-code" required />
					</div>
				</div>
				{#if notice}
					<p style="margin:0 0 10px;color:var(--forest-800);font-size:12px;font-weight:600">{notice}</p>
				{/if}
				{#if error}
					<p class="au-error">{error}</p>
				{/if}
				<button class="au-submit" type="submit" disabled={submitting}>
					{submitting ? 'Memeriksa...' : 'Verifikasi & lanjutkan'}
				</button>
				<button
					class="au-submit"
					style="background:transparent;color:var(--forest-700);box-shadow:none;margin-top:8px"
					type="button"
					disabled={resendCooldown > 0 || submitting}
					onclick={sendOtp}
				>
					{resendCooldown > 0 ? `Kirim ulang dalam ${resendCooldown}s` : 'Kirim ulang kode'}
				</button>
				<button class="au-submit" style="background:transparent;color:#849088;box-shadow:none;margin-top:6px" type="button" onclick={() => { step = 'email'; error = ''; notice = ''; }}>
					Ganti email
				</button>
			</form>
		{:else}
			<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
				{#if notice}
					<p style="margin:0 0 12px;color:var(--green);font-size:12px;font-weight:700">✓ {notice}</p>
				{/if}
				<div class="au-field">
					<label for="name">Nama lengkap</label>
					<div class="au-input">
						<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>
						<input id="name" type="text" bind:value={name} placeholder="Rina Anjani" autocomplete="name" required />
					</div>
				</div>
				<div class="au-field">
					<label for="shop">Nama toko</label>
					<div class="au-input">
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11 6 5h12l2 6M4 11v8h16v-8M4 11h16M9 11v4h6v-4" /></svg>
						<input id="shop" type="text" bind:value={shopName} placeholder="Kopi Senja" required />
					</div>
				</div>
				<div class="au-field">
					<label for="password">Kata sandi</label>
					<div class="au-input">
						<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
						<input id="password" type="password" bind:value={password} placeholder="Minimal 8 karakter" autocomplete="new-password" required />
					</div>
				</div>
				<div class="au-field">
					<label for="confirm-password">Ulangi kata sandi</label>
					<div class="au-input">
						<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
						<input id="confirm-password" type="password" bind:value={confirmPassword} placeholder="Ulangi kata sandi" autocomplete="new-password" required />
					</div>
				</div>
				<div class="au-field">
					<label for="plan">Paket berlangganan</label>
					<div class="au-input">
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h9L19 7v13.5H6V3.5Z" /><path d="M14 3.5V8h5" /></svg>
						<select id="plan" bind:value={plan}>
							{#each plans as p}
								<option value={p.id}>{p.label} — {p.note}</option>
							{/each}
						</select>
					</div>
				</div>

				{#if error}
					<p class="au-error">{error}</p>
				{/if}

				<button class="au-submit" type="submit" disabled={submitting}>
					{submitting ? 'Membuat akun...' : success ? 'Akun dibuat ✓' : 'Daftar & buka aplikasi'}
				</button>
			</form>
		{/if}

		<p class="au-switch">Sudah punya akun? <a href="/login">Masuk</a></p>
		<p class="au-terms">
			Dengan mendaftar Anda menyetujui Syarat &amp; Ketentuan, Kebijakan Privasi, dan Kebijakan Cookie posspace.
			Pembayaran digital menggunakan iPaymu (QRIS/VA/e-wallet).
		</p>
	</main>
</div>

<style>
	.au-steps {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin: 16px 0 18px;
	}

	.au-steps span {
		padding: 5px 11px;
		color: #849088;
		border: 1px solid var(--line-strong);
		border-radius: 999px;
		font-size: 11px;
		font-weight: 600;
	}

	.au-steps span.active {
		color: #fff;
		border-color: var(--forest-700);
		background: var(--forest-700);
	}

	.au-steps span.done {
		color: var(--green);
		border-color: var(--green);
		background: var(--green-soft);
	}
</style>
