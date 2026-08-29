<script lang="ts">
	import '../lib/css/landing.css';
	import BrandLogo from '$lib/components/BrandLogo.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import { isSupabaseConfigured } from '$lib/supabase';
	import { businessContact, businessPhoneHref } from '$lib/site';

	let annual = $state(false);
	let openFaq = $state<number | null>(0);
	let notice = $state('');
	let menuOpen = $state(false);
	let cms = $state<{ content: Record<string, any>; plans?: any[] } | null>(null);

	function showNotice(message: string) {
		notice = message;
	}

	$effect(() => {
		if (cms) return;
		fetch('/api/cms/landing')
			.then((r) => r.json().catch(() => ({})))
			.then((d) => (cms = d))
			.catch(() => (cms = { content: {} }));
	});

	const content = $derived(cms?.content ?? {});

	const defaultPlans = [
		{
			id: 'starter',
			name: 'Starter',
			desc: 'Untuk warung kopi yang baru mulai berjualan.',
			monthly: 149000,
			annual: 119000,
			cta: 'Mulai uji coba',
			features: ['1 toko & 1 kasir', 'Kasir cepat + struk', 'Resep & BOM dasar', 'Stok real-time 1 arah', 'Dukungan email'],
			featured: false
		},
		{
			id: 'pro',
			name: 'Pro',
			desc: 'Paling populer untuk coffee shop yang ramai.',
			monthly: 349000,
			annual: 279000,
			cta: 'Mulai 14 hari gratis',
			features: [
				'Semua fitur Starter',
				'3 kasir & shift bergilir',
				'Potong stok otomatis per resep',
				'Pembayaran QRIS/VA/e-wallet (iPaymu)',
				'Laporan HPP & laba kotor',
				'Laporan ekspor Excel/PDF'
			],
			featured: true
		},
		{
			id: 'tumbuh',
			name: 'Tumbuh',
			desc: 'Untuk jaringan 2+ cabang yang butuh kendali penuh.',
			monthly: 649000,
			annual: 519000,
			cta: 'Hubungi kami',
			features: [
				'Semua fitur Pro',
				'Tanpa batas kasir',
				'Multi-cabang & multi-gudang',
				'API & integrasi khusus',
				'Onboarding + pelatihan tim',
				'Dukungan prioritas 24/7'
			],
			featured: false
		}
	];

	// Gabungkan harga/features dari DB (bisa diubah admin) dengan teks default.
	const plans = $derived.by(() => {
		const db = cms?.plans ?? [];
		if (!db.length) return defaultPlans;
		return defaultPlans.map((dp) => {
			const row = db.find((b: any) => b.id === dp.id);
			if (!row) return dp;
			return {
				...dp,
				name: row.name ?? dp.name,
				monthly: Number(row.monthly_price ?? dp.monthly),
				annual: Number(row.annual_price ?? dp.annual),
				features: Array.isArray(row.features) && row.features.length ? row.features : dp.features
			};
		});
	});

	const defaultFaqs = [
		{
			q: 'Apakah stok benar-benar berkurang otomatis?',
			a: 'Ya. Setiap transaksi yang selesai langsung memotong bahan baku sesuai resep (BOM). Misalnya 1 Es Kopi Susu otomatis mengurangi 15g biji kopi, 150ml susu, dan 20ml sirup aren. Tanpa hitung manual.'
		},
		{
			q: 'Bisakah dipakai saat internet bermasalah?',
			a: 'Bisa. Transaksi tetap tercatat di perangkat kasir (offline mode) dan tersinkron otomatis saat koneksi pulih. Setiap transaksi punya identitas unik sehingga stok tidak pernah terpotong dua kali.'
		},
		{
			q: 'Metode pembayaran apa saja yang didukung?',
			a: 'Tunai, QRIS, kartu debit, virtual account, dan e-wallet melalui integrasi iPaymu API. Pembayaran digital dibuat sebagai invoice dan diverifikasi otomatis lewat webhook.'
		},
		{
			q: 'Berapa lama proses setup?',
			a: 'Kurang dari 30 menit. Daftar, masukkan nama toko, tambahkan menu dan resep, lalu langsung bisa buka shift dan melayani pesanan.'
		},
		{
			q: 'Apakah ada uji coba gratis?',
			a: 'Ya, paket Pro bisa dicoba gratis 14 hari tanpa kartu kredit. Setelah masa uji coba, pilih paket berlangganan yang sesuai.'
		}
	];

	const faqs = $derived.by(() => {
		const list = content.faqs;
		if (!Array.isArray(list) || list.length === 0) return defaultFaqs;
		return list.map((f: any) => ({ q: f.q ?? '', a: f.a ?? '' }));
	});

	const testimonials = $derived.by((): { name: string; role: string; quote: string; avatar: string }[] => {
		const list = content.testimonials;
		const defs = [
			{ name: 'Rina', role: 'Kasir / Barista — 24 th', quote: '“Dulu setiap malam stock opname lama sekali. Sekarang stok sudah otomatis, tinggal cek selisih sebentar. Lebih tenang saat shift selesai.”' },
			{ name: 'Budi', role: 'Pemilik / Manajer Toko — 28 th', quote: '“Laporan HPP dan laba per menu langsung keluar. Saya jadi tahu menu mana yang benar-benar untung dan bahan mana yang sering menipis.”' },
			{ name: 'Sari', role: 'Admin Gudang — 30 th', quote: '“Terima pembelian, catat stok masuk, opname, semua satu tempat. Data fisik sama persis dengan sistem dan setiap selisih ada alasannya.”' }
		];
		if (!Array.isArray(list) || list.length === 0) {
			return defs.map((d) => ({ ...d, avatar: d.name.slice(0, 2).toUpperCase() }));
		}
		return list.map((t: any, i: number) => ({
			name: t.name ?? '',
			role: t.role ?? '',
			quote: t.quote ?? '',
			avatar: ((defs[i]?.name ?? t.name ?? 'PS') as string).slice(0, 2).toUpperCase()
		}));
	});

	const trustIcons = ['M6 20V10M12 20V4M18 20v-7', 'm4 8 8-4 8 4-8 4-8-4Z', 'M12 4 21 20H3L12 4Z', 'M4 17.5 9.5 12l3.5 3.5L20 8.5M15 8.5h5v5'];

	// Copywriter default untuk semua judul bagian — bisa diubah lewat CMS admin.
	const sec = $derived({
		fitur: {
			kicker: content.sections?.fitur?.kicker ?? 'FITUR LENGKAP',
			title: content.sections?.fitur?.title ?? 'Semua yang kasir, gudang, dan pemilik butuhkan',
			desc: content.sections?.fitur?.desc ?? 'Dari mencatat pesanan sampai laporan HPP — disatukan dalam satu aplikasi yang ringan dan cepat.'
		},
		caraKerja: {
			kicker: content.sections?.caraKerja?.kicker ?? 'CARA KERJA',
			title: content.sections?.caraKerja?.title ?? 'Mulai berjualan dalam tiga langkah',
			desc: content.sections?.caraKerja?.desc ?? ''
		},
		benefit: {
			kicker: content.sections?.benefit?.kicker ?? 'HPP & LABA',
			title: content.sections?.benefit?.title ?? 'Tahu persis berapa modal tiap cangkir yang terjual',
			desc:
				content.sections?.benefit?.desc ??
				'Karena stok dipotong otomatis dari resep, Harga Pokok Penjualan (HPP) dihitung otomatis juga. Pemilik bisa melihat menu mana yang paling menguntungkan dan mendeteksi kehilangan lebih cepat.'
		},
		harga: {
			kicker: content.sections?.harga?.kicker ?? 'HARGA BERLANGGANAN',
			title: content.sections?.harga?.title ?? 'Harga sederhana, berlangganan per toko',
			desc: content.sections?.harga?.desc ?? 'Semua paket sudah termasuk Supabase, pembaruan, dan dukungan. Bisa mulai uji coba gratis.'
		},
		testimoni: {
			kicker: content.sections?.testimoni?.kicker ?? 'KATA MEREKA',
			title: content.sections?.testimoni?.title ?? 'Dipercaya kasir, gudang, dan pemilik',
			desc: content.sections?.testimoni?.desc ?? ''
		},
		faq: {
			kicker: content.sections?.faq?.kicker ?? 'TANYA JAWAB',
			title: content.sections?.faq?.title ?? 'Pertanyaan yang sering diajukan',
			desc: content.sections?.faq?.desc ?? ''
		}
	});

	const trustItems = $derived.by((): { value: string; label: string; icon: string }[] => {
		const list = content.trust;
		const defs = [
			{ value: '120+', label: 'coffee shop aktif' },
			{ value: '≥ 98%', label: 'akurasi stok fisik' },
			{ value: '-50%', label: 'kehabisan stok di jam sibuk' },
			{ value: '< 15 mnt', label: 'stock opname harian' }
		];
		if (!Array.isArray(list) || list.length === 0) {
			return defs.map((d, i) => ({ ...d, icon: trustIcons[i] ?? trustIcons[0] }));
		}
		return list.map((t: any, i: number) => ({ value: t.value ?? '', label: t.label ?? '', icon: trustIcons[i] ?? trustIcons[0] }));
	});

	function formatPrice(value: number) {
		return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(value);
	}

	function planPrice(plan: (typeof plans)[number]) {
		return annual ? plan.annual : plan.monthly;
	}
</script>

<div class="lp-page">
	<nav class="lp-nav" aria-label="Navigasi">
		<BrandLogo variant="light" />
		<div class="lp-nav-links">
			<a href="#fitur">Fitur</a>
			<a href="#cara-kerja">Cara kerja</a>
			<a href="#harga">Harga</a>
			<a href="#testimoni">Testimoni</a>
			<a href="#faq">FAQ</a>
		</div>
		<div class="lp-nav-cta">
			<a class="lp-cta lp-cta-ghost" href="/login">Masuk</a>
			<a class="lp-cta lp-cta-primary" href="/register">Coba gratis</a>
			<button class="lp-burger" type="button" aria-label="Menu" aria-expanded={menuOpen} onclick={() => (menuOpen = !menuOpen)}>
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
			</button>
		</div>
	</nav>

	{#if menuOpen}
		<div class="lp-mobile-menu" role="menu" aria-label="Menu navigasi">
			<a href="#fitur" onclick={() => (menuOpen = false)}>Fitur</a>
			<a href="#cara-kerja" onclick={() => (menuOpen = false)}>Cara kerja</a>
			<a href="#harga" onclick={() => (menuOpen = false)}>Harga</a>
			<a href="#testimoni" onclick={() => (menuOpen = false)}>Testimoni</a>
			<a href="#faq" onclick={() => (menuOpen = false)}>FAQ</a>
			<div class="lp-mobile-menu-cta">
				<a class="lp-cta lp-cta-ghost" href="/login" onclick={() => (menuOpen = false)}>Masuk</a>
				<a class="lp-cta lp-cta-primary" href="/register" onclick={() => (menuOpen = false)}>Coba gratis</a>
			</div>
		</div>
	{/if}

	<header class="lp-hero">
		<div class="lp-hero-inner">
			<div>
				<span class="lp-hero-badge"><i></i> {content.hero?.badge ?? 'POS kasir untuk coffee shop UMKM'}</span>
				<h1>{content.hero?.title ?? 'Stok gudang selalu benar, '}<em>{content.hero?.titleEm ?? 'tanpa hitung manual.'}</em></h1>
				<p class="lp-hero-sub">
				{content.hero?.subtitle ?? 'posspace mencatat pesanan dalam beberapa klik dan otomatis memotong bahan baku sesuai resep setiap transaksi. Pemilik selalu tahu sisa stok, HPP, dan laba — kapan saja, dari mana saja.'}
				</p>
				<div class="lp-hero-actions">
					<a class="lp-cta lp-cta-primary" href="/register">
						{content.hero?.ctaPrimary ?? 'Mulai 14 hari gratis'}
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
					</a>
					<a class="lp-cta lp-cta-ghost" href="/register?plan=demo">{content.hero?.ctaSecondary ?? 'Lihat demo kasir'}</a>
				</div>
				<p class="lp-hero-note">
					{#if content.hero?.note}
						{content.hero.note}
					{:else}
						Tanpa kartu kredit · Setup &lt; 30 menit · <strong>Akurasi stok ≥ 98%</strong>
					{/if}
				</p>
			</div>

			<div class="lp-mock" aria-hidden="true">
				<div class="lp-mock-badges">
					<div class="lp-mock-badge"><b>Live</b><span>stok sinkron<br />&lt; 2 detik</span></div>
					<div class="lp-mock-badge alert"><b>Low stock</b><span>biji kopi<br />tinggal 360 g</span></div>
				</div>
				<div class="lp-mock-window">
					<div class="lp-mock-bar"><i></i><i></i><i></i></div>
					<div class="lp-mock-body">
						<div class="lp-mock-order">
							<h4>Pesanan #248</h4>
							<div class="lp-mock-item">
								<span class="mini-art art-coffee-milk"></span>
								<span><strong>Es Kopi Susu</strong><small>Reguler · 22.000</small></span>
								<b>×1</b>
							</div>
							<div class="lp-mock-item">
								<span class="mini-art art-croffle-mini"></span>
								<span><strong>Croffle Butter</strong><small>Original · 18.000</small></span>
								<b>×1</b>
							</div>
							<div class="lp-mock-total"><span>Total</span><b>Rp 44.000</b></div>
						</div>
						<div class="lp-mock-menu">
							<h4>Menu</h4>
							<div class="lp-mock-tiles">
								<div class="lp-mock-tile">
									<div class="product-art art-coffee-milk"><span class="art-cup"></span><span class="art-steam"></span></div>
									<strong>Es Kopi Susu</strong><small>Rp 22.000</small>
								</div>
								<div class="lp-mock-tile">
									<div class="product-art art-matcha"><span class="art-cup"></span><span class="art-steam"></span></div>
									<strong>Matcha Cloud</strong><small>Rp 25.000</small>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</header>

	<section class="lp-trust" aria-label="Angka kunci">
		<div class="lp-trust-inner">
			{#each trustItems as item}
				<div class="lp-trust-item">
					<span class="metric-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d={item.icon} /></svg></span>
					<div><strong>{item.value}</strong><small>{item.label}</small></div>
				</div>
			{/each}
		</div>
	</section>

	<section class="lp-section" id="fitur">
		<div class="lp-section-head">
			<span class="lp-kicker">{sec.fitur.kicker}</span>
			<h2>{sec.fitur.title}</h2>
			<p>{sec.fitur.desc}</p>
		</div>
		<div class="lp-features">
			<article class="lp-feature">
				<span class="lp-feature-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13Z" /><path d="M7.5 8h9M7.5 12h2M12 12h2M16.5 12h.01M7.5 16h2M12 16h2M16.5 16h.01" /></svg></span>
				<h3>Kasir Cepat</h3>
				<p>Catat pesanan dalam beberapa klik, pilih varian reguler/besar, dan total langsung muncul real-time.</p>
				<ul>
					<li>Metode tunai, QRIS, kartu debit</li>
					<li>Hitung kembalian otomatis</li>
					<li>Buka-tutup shift dengan rekap kas</li>
				</ul>
			</article>
			<article class="lp-feature">
				<span class="lp-feature-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13Z" /><path d="M8 8h8M8 12h8M8 16h4" /></svg></span>
				<h3>Menu &amp; Resep (BOM)</h3>
				<p>Atur menu, harga, dan resep tiap porsi. 1 Es Kopi Susu = 15g kopi + 150ml susu + 20ml sirup + 1 cup.</p>
				<ul>
					<li>Varian ukuran dengan harga beda</li>
					<li>Kelola bahan baku &amp; satuannya</li>
					<li>HPP terhitung otomatis dari resep</li>
				</ul>
			</article>
			<article class="lp-feature">
				<span class="lp-feature-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 8 8-4 8 4-8 4-8-4Z" /><path d="m4 12 8 4 8-4M4 16l8 4 8-4" /></svg></span>
				<h3>Stok Real-time</h3>
				<p>Setiap penjualan langsung mengurangi bahan baku sesuai resep dan sinkron ke semua perangkat.</p>
				<ul>
					<li>Potong stok otomatis &amp; atomik</li>
					<li>Peringatan low stock sebelum habis</li>
					<li>Riwayat pergerakan lengkap dengan alasan</li>
				</ul>
			</article>
			<article class="lp-feature">
				<span class="lp-feature-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h9L19 7v13.5H6V3.5Z" /><path d="M14 3.5V8h5M9 12h7M9 15.5h7" /></svg></span>
				<h3>Laporan &amp; Keuangan</h3>
				<p>Omzet, transaksi, menu terlaris, hingga laba kotor per menu terlihat jelas tanpa spreadsheet.</p>
				<ul>
					<li>Dashboard ringkasan penjualan</li>
					<li>HPP &amp; laba otomatis dari resep</li>
					<li>Ekspor laporan Excel/PDF</li>
				</ul>
			</article>
			<article class="lp-feature">
				<span class="lp-feature-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h14v12H4zM7 8V6a3 3 0 0 1 6 0v2M8 13h6" /></svg></span>
				<h3>Stok Masuk &amp; Opname</h3>
				<p>Catat pembelian dari pemasok dan samakan stok fisik dengan sistem dalam hitungan menit.</p>
				<ul>
					<li>Pembelian dengan harga &amp; tanggal</li>
					<li>Hitung fisik vs sistem</li>
					<li>Koreksi selisih dengan alasan &amp; persetujuan</li>
				</ul>
			</article>
			<article class="lp-feature">
				<span class="lp-feature-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5c0 4.6-2.9 8-7 10-4.1-2-7-5.4-7-10V6l7-3Z" /><path d="m9 12 2 2 4-4" /></svg></span>
				<h3>Aman &amp; Selalu Sinkron</h3>
				<p>Login dengan peran (kasir, admin gudang, pemilik) dan data diamankan di level database (RLS).</p>
				<ul>
					<li>Hak akses berdasarkan peran</li>
					<li>Offline mode + sinkron tanpa dobel potong</li>
					<li>Jejak audit semua perubahan stok</li>
				</ul>
			</article>
		</div>
	</section>

	<section class="lp-section" id="cara-kerja">
		<div class="lp-section-head">
			<span class="lp-kicker">{sec.caraKerja.kicker}</span>
			<h2>{sec.caraKerja.title}</h2>
			{#if sec.caraKerja.desc}<p>{sec.caraKerja.desc}</p>{/if}
		</div>
		<div class="lp-steps">
			<div class="lp-step">
				<span class="lp-step-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14v12H5zM8 8V6a4 4 0 0 1 8 0v2M9 12h6" /></svg></span>
				<h3>Daftar &amp; atur toko</h3>
				<p>Buat akun, isi nama toko, dan tambahkan menu beserta resepnya.</p>
			</div>
			<div class="lp-step">
				<span class="lp-step-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 20V10M12 20V4M18 20v-7" /></svg></span>
				<h3>Buka shift &amp; layani</h3>
				<p>Kasir membuka shift dengan saldo awal, lalu mencatat pesanan pelanggan.</p>
			</div>
			<div class="lp-step">
				<span class="lp-step-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 12l6-7 6 7" /></svg></span>
				<h3>Stok terpotong otomatis</h3>
				<p>Setelah pembayaran, stok berkurang sesuai BOM dan laporan HPP terbarui.</p>
			</div>
		</div>
	</section>

	<section class="lp-benefit" aria-label="Manfaat HPP">
		<div class="lp-benefit-copy">
			<span class="lp-kicker">{sec.benefit.kicker}</span>
			<h2>{sec.benefit.title}</h2>
			<p>{sec.benefit.desc}</p>
			<div class="lp-benefit-list">
				<div class="lp-benefit-row">
					<span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg></span>
					HPP dan laba kotor per menu tanpa spreadsheet
				</div>
				<div class="lp-benefit-row">
					<span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg></span>
					Laporan penjualan dihasilkan satu klik
				</div>
				<div class="lp-benefit-row">
					<span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg></span>
					Deteksi kejanggalan dari riwayat pergerakan stok
				</div>
			</div>
		</div>
		<div class="lp-bom">
			<h4>Contoh BOM — 1 porsi Es Kopi Susu Reguler</h4>
			<div class="lp-bom-row">
				<span class="mini-art art-coffee-milk"></span>
				<div><strong>Biji kopi house blend</strong><br /><small>satuan gram</small></div>
				<b>-15 g</b>
			</div>
			<div class="lp-bom-row">
				<span class="mini-art art-coffee-milk"></span>
				<div><strong>Susu segar</strong><br /><small>satuan ml</small></div>
				<b>-150 ml</b>
			</div>
			<div class="lp-bom-row">
				<span class="mini-art art-coffee-milk"></span>
				<div><strong>Sirup aren</strong><br /><small>satuan ml</small></div>
				<b>-20 ml</b>
			</div>
			<div class="lp-bom-row">
				<span class="mini-art art-croffle-mini"></span>
				<div><strong>Set cup (gelas + tutup)</strong><br /><small>satuan pcs</small></div>
				<b>-1 set</b>
			</div>
			<div class="lp-bom-foot">HPP 1 porsi: Rp 9.400 · Harga jual Rp 22.000 · Laba kotor Rp 12.600</div>
		</div>
	</section>

	<section class="lp-section lp-pricing" id="harga">
		<div class="lp-section-head">
			<span class="lp-kicker">{sec.harga.kicker}</span>
			<h2>{sec.harga.title}</h2>
			<p>{sec.harga.desc}</p>
		</div>
		<div style="text-align:center">
			<div class="lp-toggle" role="group" aria-label="Periode penagihan">
				<button type="button" class:active={!annual} onclick={() => (annual = false)}>Bulanan</button>
				<button type="button" class:active={annual} onclick={() => (annual = true)}>Tahunan <small>-20%</small></button>
			</div>
		</div>
		<div class="lp-plans">
			{#each plans as plan}
				<article class="lp-plan" class:featured={plan.featured}>
					{#if plan.featured}
						<span class="lp-plan-flag">PALING POPULER</span>
					{/if}
					<h3 class="lp-plan-name">{plan.name}</h3>
					<p class="lp-plan-desc">{plan.desc}</p>
					<div class="lp-plan-price">
						<b>Rp {formatPrice(planPrice(plan))}</b>
						<span>/bulan</span>
					</div>
					<a class="lp-plan-cta {plan.featured ? 'light' : 'dark'}" href="/register?plan={plan.id}">{plan.cta}</a>
					<ul class="lp-plan-features">
						{#each plan.features as feature}
							<li>{feature}</li>
						{/each}
					</ul>
				</article>
			{/each}
		</div>
	</section>

	<section class="lp-section" id="testimoni">
		<div class="lp-section-head">
			<span class="lp-kicker">{sec.testimoni.kicker}</span>
			<h2>{sec.testimoni.title}</h2>
			{#if sec.testimoni.desc}<p>{sec.testimoni.desc}</p>{/if}
		</div>
		<div class="lp-testimonials">
			{#each testimonials as t, i}
				<figure class="lp-testimonial">
					<span class="avatar {['avatar-rina', 'avatar-budi', 'avatar-sari'][i] ?? 'avatar-rina'}">{t.avatar}</span>
					<blockquote>{t.quote}</blockquote>
					<figcaption><strong>{t.name}</strong><small>{t.role}</small></figcaption>
				</figure>
			{/each}
		</div>
	</section>

	<section class="lp-section" id="faq">
		<div class="lp-section-head">
			<span class="lp-kicker">{sec.faq.kicker}</span>
			<h2>{sec.faq.title}</h2>
			{#if sec.faq.desc}<p>{sec.faq.desc}</p>{/if}
		</div>
		<div class="lp-faq">
			{#each faqs as faq, i}
				<div class="lp-faq-item" class:open={openFaq === i}>
					<button class="lp-faq-q" type="button" onclick={() => (openFaq = openFaq === i ? null : i)} aria-expanded={openFaq === i}>
						<span>{faq.q}</span>
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
					</button>
					<div class="lp-faq-a"><p>{faq.a}</p></div>
				</div>
			{/each}
		</div>
	</section>

	<div class="lp-cta-band">
		<h2>{content.ctaBand?.title ?? 'Siap membuat stok kopi Anda selalu benar?'}</h2>
		<p>{content.ctaBand?.subtitle ?? 'Mulai uji coba 14 hari gratis. Tanpa kartu kredit, tanpa komitmen.'}</p>
		<a class="lp-cta lp-cta-primary" href="/register">
			{content.ctaBand?.button ?? 'Daftar sekarang'}
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
		</a>
	</div>

	<footer class="lp-footer">
		<div class="lp-footer-grid">
			<div class="lp-footer-brand">
				<BrandLogo variant="light" />
				<p>POS kasir kopi sederhana namun kuat dengan stok gudang terintegrasi real-time untuk UMKM coffee shop. Resmi di <a href="https://posspace.id" target="_blank" rel="noopener" style="color:var(--forest-800);font-weight:700">posspace.id</a>.</p>
				<div class="lp-footer-contact">
					<a href={`mailto:${businessContact.email}`}>{businessContact.email}</a>
					<a href={businessPhoneHref}>{businessContact.phone}</a>
					<address>{businessContact.address}</address>
				</div>
				<span class="lp-footer-demo">
					<i></i>
					{#if isSupabaseConfigured}
						Terhubung ke Supabase
					{:else}
						Mode demo aktif — isi .env untuk Supabase
					{/if}
				</span>
			</div>
			<div>
				<h5>Produk</h5>
				<div class="lp-footer-col">
					<a href="#fitur">Fitur</a>
					<a href="#harga">Harga</a>
					<a href="/register">Daftar</a>
					<a href="/login">Masuk</a>
				</div>
			</div>
			<div>
				<h5>Perusahaan</h5>
				<div class="lp-footer-col">
					<a href="#testimoni">Testimoni</a>
					<a href="#cara-kerja">Cara kerja</a>
					<a href="/faq">FAQ</a>
					<a href="/kontak">Kontak</a>
				</div>
			</div>
			<div>
				<h5>Verifikasi Aplikasi</h5>
				<div class="lp-footer-col">
					<a href="/faq">FAQ</a>
					<a href="/refund-policy">Refund Policy</a>
					<a href="/terms-and-conditions">Syarat &amp; Ketentuan</a>
					<a href="/kontak">Kontak</a>
					<button type="button" class="lp-linklike" onclick={() => showNotice('Semua sistem berjalan normal')}>Status Sistem</button>
				</div>
			</div>
		</div>
		<div class="lp-footer-bottom">
			<span>© 2026 posspace.id — Dibangun dengan SvelteKit &amp; Supabase.</span>
			<span>POS kasir untuk UMKM coffee shop Indonesia ☕</span>
		</div>
	</footer>
</div>

<Toast message={notice} />

<style>
	.lp-footer-contact {
		display: grid;
		gap: 5px;
		margin-top: 15px;
		max-width: 280px;
		font-size: 11px;
		line-height: 1.5;
	}

	.lp-footer-contact a {
		color: var(--forest-700);
		font-weight: 700;
	}

	.lp-footer-contact address {
		color: #7d8a80;
		font-style: normal;
	}
</style>
