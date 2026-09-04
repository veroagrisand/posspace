<script lang="ts">
	import PublicNav from '$lib/components/PublicNav.svelte';
	import PublicFooter from '$lib/components/PublicFooter.svelte';

	let annual = $state(false);
	let openFaq = $state<number | null>(0);
	let cms = $state<{ content: Record<string, any>; plans?: any[] } | null>(null);

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
				'Pembayaran QRIS/VA/e-wallet (Midtrans)',
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
			a: 'Tunai, QRIS, kartu debit, virtual account, dan e-wallet melalui integrasi Midtrans. Pembayaran digital dibuat sebagai invoice dan diverifikasi otomatis lewat webhook.'
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

	const testimonials = $derived.by((): { name: string; role: string; quote: string; avatar: string; tone: string }[] => {
		const list = content.testimonials;
		const defs = [
			{ name: 'Rina', role: 'Kasir / Barista — 24 th', quote: '“Dulu setiap malam stock opname lama sekali. Sekarang stok sudah otomatis, tinggal cek selisih sebentar. Lebih tenang saat shift selesai.”' },
			{ name: 'Budi', role: 'Pemilik / Manajer Toko — 28 th', quote: '“Laporan HPP dan laba per menu langsung keluar. Saya jadi tahu menu mana yang benar-benar untung dan bahan mana yang sering menipis.”' },
			{ name: 'Sari', role: 'Admin Gudang — 30 th', quote: '“Terima pembelian, catat stok masuk, opname, semua satu tempat. Data fisik sama persis dengan sistem dan setiap selisih ada alasannya.”' }
		];
		const tones = ['#111111', '#f26522', '#3e9b5f'];
		if (!Array.isArray(list) || list.length === 0) {
			return defs.map((d, i) => ({ ...d, avatar: d.name.slice(0, 2).toUpperCase(), tone: tones[i] ?? tones[0] }));
		}
		return list.map((t: any, i: number) => ({
			name: t.name ?? '',
			role: t.role ?? '',
			quote: t.quote ?? '',
			avatar: ((defs[i]?.name ?? t.name ?? 'PS') as string).slice(0, 2).toUpperCase(),
			tone: tones[i] ?? tones[0]
		}));
	});

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

	const features = [
		{
			title: 'Kasir Cepat',
			icon: 'M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13ZM7.5 8h9M7.5 12h2M12 12h2M16.5 12h.01M7.5 16h2M12 16h2M16.5 16h.01',
			desc: 'Catat pesanan dalam beberapa klik, pilih varian reguler/besar, dan total langsung muncul real-time.',
			list: ['Metode tunai, QRIS, kartu debit', 'Hitung kembalian otomatis', 'Buka-tutup shift dengan rekap kas']
		},
		{
			title: 'Menu & Resep (BOM)',
			icon: 'M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13ZM8 8h8M8 12h8M8 16h4',
			desc: 'Atur menu, harga, dan resep tiap porsi. 1 Es Kopi Susu = 15g kopi + 150ml susu + 20ml sirup + 1 cup.',
			list: ['Varian ukuran dengan harga beda', 'Kelola bahan baku & satuannya', 'HPP terhitung otomatis dari resep']
		},
		{
			title: 'Stok Real-time',
			icon: 'm4 8 8-4 8 4-8 4-8-4Zm4 4 8 4-8 4-8-4M4 16l8 4 8-4',
			desc: 'Setiap penjualan langsung mengurangi bahan baku sesuai resep dan sinkron ke semua perangkat.',
			list: ['Potong stok otomatis & atomik', 'Peringatan low stock sebelum habis', 'Riwayat pergerakan lengkap dengan alasan']
		},
		{
			title: 'Laporan & Keuangan',
			icon: 'M6 3.5h9L19 7v13.5H6V3.5ZM14 3.5V8h5M9 12h7M9 15.5h7',
			desc: 'Omzet, transaksi, menu terlaris, hingga laba kotor per menu terlihat jelas tanpa spreadsheet.',
			list: ['Dashboard ringkasan penjualan', 'HPP & laba otomatis dari resep', 'Ekspor laporan Excel/PDF']
		},
		{
			title: 'Stok Masuk & Opname',
			icon: 'M4 8h14v12H4zM7 8V6a3 3 0 0 1 6 0v2M8 13h6',
			desc: 'Catat pembelian dari pemasok dan samakan stok fisik dengan sistem dalam hitungan menit.',
			list: ['Pembelian dengan harga & tanggal', 'Hitung fisik vs sistem', 'Koreksi selisih dengan alasan & persetujuan']
		},
		{
			title: 'Aman & Selalu Sinkron',
			icon: 'M12 3 19 6v5c0 4.6-2.9 8-7 10-4.1-2-7-5.4-7-10V6l7-3Zm-3 9 2 2 4-4',
			desc: 'Login dengan peran (kasir, admin gudang, pemilik) dan data diamankan di level database (RLS).',
			list: ['Hak akses berdasarkan peran', 'Offline mode + sinkron tanpa dobel potong', 'Jejak audit semua perubahan stok']
		}
	];

	const steps = [
		{
			title: 'Daftar & atur toko',
			desc: 'Buat akun, isi nama toko, dan tambahkan menu beserta resepnya.'
		},
		{
			title: 'Buka shift & layani',
			desc: 'Kasir membuka shift dengan saldo awal, lalu mencatat pesanan pelanggan.'
		},
		{
			title: 'Stok terpotong otomatis',
			desc: 'Setelah pembayaran, stok berkurang sesuai BOM dan laporan HPP terbarui.'
		}
	];

	const bomRows = [
		{ name: 'Biji kopi house blend', unit: 'satuan gram', qty: '-15 g' },
		{ name: 'Susu segar', unit: 'satuan ml', qty: '-150 ml' },
		{ name: 'Sirup aren', unit: 'satuan ml', qty: '-20 ml' },
		{ name: 'Set cup (gelas + tutup)', unit: 'satuan pcs', qty: '-1 set' }
	];

	function formatPrice(value: number) {
		return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(value);
	}

	function planPrice(plan: (typeof plans)[number]) {
		return annual ? plan.annual : plan.monthly;
	}
</script>

<svelte:head><title>posspace — POS kasir kopi dengan stok real-time</title></svelte:head>

<div style="min-height:100vh">
	<header class="section" style="padding-top:8px;padding-bottom:64px">
		<div class="wrap">
			<PublicNav
				items={[
					{ href: '#fitur', label: 'Fitur' },
					{ href: '#cara-kerja', label: 'Cara kerja' },
					{ href: '#harga', label: 'Harga' },
					{ href: '#testimoni', label: 'Testimoni' },
					{ href: '#faq', label: 'FAQ' }
				]}
				note="POS kasir untuk coffee shop UMKM"
			/>
		</div>
	</header>

	<section style="padding-bottom:64px">
		<div class="wrap">
			<span class="sec-kicker" style="margin-bottom:22px">
				<span class="badge-pill"><span class="badge-dot"></span>{content.hero?.badge ?? 'POS kasir untuk coffee shop UMKM'}</span>
			</span>
			<h1 class="h-display" style="max-width:1080px">
				{content.hero?.title ?? 'Stok gudang selalu benar, '}<em style="font-style:normal;color:var(--brand-orange)">{content.hero?.titleEm ?? 'tanpa hitung manual.'}</em>
			</h1>
			<p style="margin-top:24px;max-width:640px;color:var(--brand-ink-soft);font-size:17px;line-height:1.65">
				{content.hero?.subtitle ?? 'posspace mencatat pesanan dalam beberapa klik dan otomatis memotong bahan baku sesuai resep setiap transaksi. Pemilik selalu tahu sisa stok, HPP, dan laba — kapan saja, dari mana saja.'}
			</p>
			<div style="display:flex;flex-direction:column;align-items:flex-start;gap:14px;margin-top:36px" class="hero-actions">
				<a class="btn-pill btn-pill--orange" href="/register">
					<span class="roll"><span class="roll-inner"><span class="roll-line">{content.hero?.ctaPrimary ?? 'Mulai 14 hari gratis'}</span><span class="roll-line">{content.hero?.ctaPrimary ?? 'Mulai 14 hari gratis'}</span></span></span>
					<span class="btn-arrow"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg></span>
				</a>
				<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
					<a class="btn-pill btn-pill--dark" href="/register?plan=demo">{content.hero?.ctaSecondary ?? 'Lihat demo kasir'}</a>
					<span class="badge-pill">{content.hero?.note ?? 'Tanpa kartu kredit · Setup < 30 menit · Akurasi stok ≥ 98%'}</span>
				</div>
			</div>
		</div>
	</section>

	<section class="section" id="fitur">
		<div class="wrap">
			<div class="sec-head">
				<div class="sec-kicker">
					<span class="num-tag">1</span>
					<span class="badge-pill">Mengenal posspace</span>
				</div>
				<h2 class="h-section">{sec.fitur.title}</h2>
				<p>{sec.fitur.desc}</p>
			</div>
			<div class="feature-grid">
				{#each features as f}
					<article class="feature-card">
						<span class="feature-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d={f.icon} /></svg></span>
						<h3>{f.title}</h3>
						<p>{f.desc}</p>
						<ul>
							{#each f.list as item}
								<li>{item}</li>
							{/each}
						</ul>
					</article>
				{/each}
			</div>
		</div>
	</section>

	<section class="section section--alt" id="cara-kerja">
		<div class="wrap">
			<div class="sec-head">
				<div class="sec-kicker">
					<span class="num-tag">2</span>
					<span class="badge-pill">{sec.caraKerja.kicker}</span>
				</div>
				<h2 class="h-section">{sec.caraKerja.title}</h2>
				{#if sec.caraKerja.desc}<p>{sec.caraKerja.desc}</p>{/if}
			</div>
			<div class="steps-grid">
				{#each steps as step, i}
					<div class="step-card">
						<span class="num-tag">{i + 1}</span>
						<h3>{step.title}</h3>
						<p>{step.desc}</p>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<section class="section" id="hpp">
		<div class="wrap">
			<div class="sec-head">
				<div class="sec-kicker">
					<span class="num-tag">3</span>
					<span class="badge-pill">{sec.benefit.kicker}</span>
				</div>
			</div>
			<div class="split">
				<div class="split-copy">
					<h2 class="h-section">{sec.benefit.title}</h2>
					<p>{sec.benefit.desc}</p>
					<div class="check-list">
						<div><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>HPP dan laba kotor per menu tanpa spreadsheet</div>
						<div><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>Laporan penjualan dihasilkan satu klik</div>
						<div><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>Deteksi kejanggalan dari riwayat pergerakan stok</div>
					</div>
				</div>
				<div class="bom-card">
					<h4>Contoh BOM — 1 porsi Es Kopi Susu Reguler</h4>
					{#each bomRows as row}
						<div class="bom-row">
							<div><strong>{row.name}</strong><small>{row.unit}</small></div>
							<b>{row.qty}</b>
						</div>
					{/each}
					<div class="bom-foot">HPP 1 porsi: Rp 9.400 · Harga jual Rp 22.000 · Laba kotor Rp 12.600</div>
				</div>
			</div>
		</div>
	</section>

	<section class="section section--paper" id="harga">
		<div class="wrap">
			<div class="sec-head" style="margin-bottom:26px">
				<div class="sec-kicker">
					<span class="num-tag">4</span>
					<span class="badge-pill">{sec.harga.kicker}</span>
				</div>
				<h2 class="h-section">{sec.harga.title}</h2>
				<p>{sec.harga.desc}</p>
			</div>
			<div style="text-align:center">
				<div class="toggle" role="group" aria-label="Periode penagihan">
					<button type="button" class:active={!annual} onclick={() => (annual = false)}>Bulanan</button>
					<button type="button" class:active={annual} onclick={() => (annual = true)}>Tahunan <small>-20%</small></button>
				</div>
			</div>
			<div class="plans-grid">
				{#each plans as plan}
					<article class="plan-card" class:plan-card--featured={plan.featured}>
						{#if plan.featured}
							<span class="plan-flag">Paling Populer</span>
						{/if}
						<h3 class="plan-name">{plan.name}</h3>
						<p class="plan-desc">{plan.desc}</p>
						<div class="plan-price">
							<b>Rp {formatPrice(planPrice(plan))}</b>
							<span>/bulan</span>
						</div>
						<a class="plan-cta {plan.featured ? 'plan-cta--light' : 'plan-cta--dark'}" href="/register?plan={plan.id}">{plan.cta}</a>
						<ul class="plan-features">
							{#each plan.features as feature}
								<li>{feature}</li>
							{/each}
						</ul>
					</article>
				{/each}
			</div>
		</div>
	</section>

	<section class="section" id="testimoni">
		<div class="wrap">
			<div class="sec-head">
				<div class="sec-kicker">
					<span class="num-tag">5</span>
					<span class="badge-pill">{sec.testimoni.kicker}</span>
				</div>
				<h2 class="h-section">{sec.testimoni.title}</h2>
				{#if sec.testimoni.desc}<p>{sec.testimoni.desc}</p>{/if}
			</div>
			<div class="testi-grid">
				{#each testimonials as t}
					<figure class="testi-card">
						<blockquote>{t.quote}</blockquote>
						<figcaption>
							<span class="testi-avatar" style="background:{t.tone}">{t.avatar}</span>
							<div>
								<strong>{t.name}</strong>
								<small>{t.role}</small>
							</div>
						</figcaption>
					</figure>
				{/each}
			</div>
		</div>
	</section>

	<section class="section section--alt" id="faq">
		<div class="wrap">
			<div class="sec-head">
				<div class="sec-kicker">
					<span class="num-tag">6</span>
					<span class="badge-pill">{sec.faq.kicker}</span>
				</div>
				<h2 class="h-section">{sec.faq.title}</h2>
				{#if sec.faq.desc}<p>{sec.faq.desc}</p>{/if}
			</div>
			<div class="faq-list">
				{#each faqs as faq, i}
					<div class="faq-row" class:open={openFaq === i}>
						<button class="faq-q" type="button" onclick={() => (openFaq = openFaq === i ? null : i)} aria-expanded={openFaq === i}>
							<span>{faq.q}</span>
							<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
						</button>
						<div class="faq-a"><p>{faq.a}</p></div>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<div class="wrap" style="padding-top:24px">
		<section class="cta-band">
			<div>
				<h2>{content.ctaBand?.title ?? 'Siap membuat stok kopi Anda selalu benar?'}</h2>
				<p>{content.ctaBand?.subtitle ?? 'Mulai uji coba 14 hari gratis. Tanpa kartu kredit, tanpa komitmen.'}</p>
			</div>
			<div class="actions">
				<a class="btn-pill btn-pill--orange" href="/register">
					<span class="roll"><span class="roll-inner"><span class="roll-line">{content.ctaBand?.button ?? 'Daftar sekarang'}</span><span class="roll-line">{content.ctaBand?.button ?? 'Daftar sekarang'}</span></span></span>
					<span class="btn-arrow"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg></span>
				</a>
			</div>
		</section>
	</div>

	<PublicFooter />
</div>

<style>
	@media (min-width: 640px) {
		.hero-actions {
			flex-direction: row;
			align-items: center;
		}
	}
</style>