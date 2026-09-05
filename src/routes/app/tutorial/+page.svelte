<script lang="ts">
	import { backend } from '$lib/store.svelte';

	const sections = [
		{
			title: '1. Kasir cepat',
			subtitle: 'Layani pesanan & terima pembayaran setiap hari.',
			steps: [
				['Buka shift', 'Klik "Buka shift" di halaman Kasir, masukkan uang awal laci. Shift aktif = transaksi tercatat ke kasir & laporan.'],
				['Pilih menu', 'Klik menu/minuman pada grid kiri (cari pakai kolom pencarian, filter kategori). Tentukan varian & jumlahnya di keranjang.'],
				['Bayar', 'Pilih metode: Tunai (masukkan uang diterima — kembalian otomatis), QRIS (QRIS statis toko Anda, transaksi dicatat sebagai QRIS), atau Debit. Klik "Bayar sekarang".'],
				['Cetak / kirim struk', 'Setelah bayar, struk tampil otomatis. Pilih "Cetak struk" (jika printer aktif) atau "Kirim struk". Stok bahan langsung terpotong sesuai resep.']
			]
		},
		{
			title: '2. Menu & resep',
			subtitle: 'Kelola produk, varian, dan resep (BOM) — dasar HPP otomatis.',
			steps: [
				['Tambah menu', 'Menu → "+ Menu": nama, kategori (Kopi/Non-kopi/Makanan), harga. Satu produk bisa punya beberapa varian (mis. Reguler/Besar) dengan harga berbeda.'],
				['Atur resep (BOM)', 'Untuk tiap varian, tambahkan bahan + jumlah yang dibutuhkan (mis. 14 gram roast beans, 1 pcs paper filter, 200 ml air).'],
				['Pantau HPP', 'HPP per porsi dihitung otomatis dari resep × harga modal bahan. Kolom HPP & margin (%) muncul di daftar menu — jaga margin sehat (> 35%).']
			]
		},
		{
			title: '3. Inventaris (stok)',
			subtitle: 'Bahan baku selalu terkontrol.',
			steps: [
				['Catat pembelian', 'Inventaris → "+ Catat pembelian". Pilih bahan, masukkan jumlah & satuan beli (mis. 1 kg / 2 Liter), lalu TOTAL harga. Sistem menghitung harga per satuan & stok otomatis.'],
				['Koreksi harga modal', 'Klik harga modal pada kolom tabel untuk memperbaiki HPP bahan secara manual (mis. saat harga beli berubah) — tanpa menambah stok.'],
				['Hitung fisik (opname)', 'Klik "Hitung fisik", isi jumlah aktual, setujui selisih dengan alasan. Stok sistem menyesuaikan & tercatat di riwayat audit.'],
				['Pantau status', 'Stok ditandai Menipis/Kritis saat mendekati batas minimum. Riwayat pergerakan (terjual/masuk/opname) selalu terekam.']
			]
		},
		{
			title: '4. Laporan & keuangan',
			subtitle: 'Lihat omzet, HPP, dan laba tanpa spreadsheet.',
			steps: [
				['Laporan harian', 'Menu Laporan menampilkan omzet hari ini, HPP, laba kotor, dan menu terlaris. Bisa ekspor stok & penjualan (CSV).'],
				['Laba bersih bulanan', 'Menu Operasional → pilih bulan: omzet − HPP − beban operasional = laba bersih. Catat tagihan listrik, sewa, gaji, dll di sini.']
			]
		},
		{
			title: '5. Operasional (beban)',
			subtitle: 'Catat pengeluaran non-bahan untuk laba bersih.',
			steps: [
				['Catat beban', 'Operasional → "+ Catat beban": pilih kategori (Listrik, Air, Internet, Sewa, Gas, Kebersihan, Gaji), jumlah, tanggal, keterangan.'],
				['Pantau laba bersih', 'Kartu Laba BERSIH = omzet − HPP − beban. Klik kategori untuk melihat rincian per jenis beban.']
			]
		},
		{
			title: '6. Pengaturan',
			subtitle: 'Profil toko, tim, dan printer.',
			steps: [
				['Profil toko', 'Ubah nama, alamat, telepon, mata uang — tampil di struk.'],
				['Anggota tim', 'Undang kasir / admin gudang dengan peran. Password sementara muncul di dialog yang bisa disalin. Anggota wajib verifikasi email sebelum login.'],
				['Printer struk', 'Pilih pakai printer (USB/browser/agen) atau tidak. Pilihan tersimpan — tidak muncul terus-menerus.']
			]
		},
		{
			title: '7. Tips keuangan',
			subtitle: 'Agar usaha tetap untung.',
			steps: [
				['Jaga HPP', 'Cek HPP per menu di Menu & resep. Jika margin < 35%, pertimbangkan naikkan harga atau cari pemasok lebih murah.'],
				['Catat semua beban', 'Listrik, sewa, gaji, internet — catat tiap bulan agar laba bersih akurat.'],
				['Rutin opname', 'Cocokkan stok fisik vs sistem secara berkala untuk mendeteksi kehilangan lebih dini.'],
				['Gunakan referensi pembayaran', 'Untuk QRIS/debit, isi referensi transaksi agar mudah direkonsiliasi di laporan.']
			]
		}
	];
</script>

<svelte:head><title>Tutorial penggunaan — posspace</title></svelte:head>

<header class="topbar">
	<div class="breadcrumbs" aria-label="Breadcrumb">
		<span>Bantuan</span>
		<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
		<strong>Tutorial penggunaan</strong>
	</div>
</header>

<div class="page-content">
	{#if backend.role !== 'pemilik'}
		<section class="panel" style="padding:24px">
			<div class="admin-empty">Tutorial ini khusus untuk pemilik toko.</div>
		</section>
	{:else}
		<section class="page-heading">
			<div>
				<div class="eyebrow"><span class="eyebrow-line"></span> PANDUAN PEMILIK</div>
				<h1>Kelola toko Anda langkah demi langkah.</h1>
				<p>Dari kasir harian sampai laba bersih — semua fitur posspace dijelaskan di sini.</p>
			</div>
		</section>

		{#each sections as section}
			<section class="panel" style="padding:24px;margin-top:16px">
				<div class="panel-heading compact-heading" style="margin-bottom:16px">
					<div>
						<div class="section-kicker">MODUL</div>
						<h2>{section.title}</h2>
						<p style="color:#718078;font-size:12px;margin:4px 0 0">{section.subtitle}</p>
					</div>
				</div>
				<div class="tutorial-steps">
					{#each section.steps as [title, desc], i}
						<div class="tutorial-step">
							<span class="tutorial-step-num">{i + 1}</span>
							<div>
								<strong>{title}</strong>
								<p>{desc}</p>
							</div>
						</div>
					{/each}
				</div>
			</section>
		{/each}
	{/if}
</div>

<style>
	.tutorial-steps {
		display: grid;
		gap: 12px;
	}
	.tutorial-step {
		display: flex;
		gap: 12px;
		align-items: flex-start;
	}
	.tutorial-step-num {
		flex: 0 0 24px;
		height: 24px;
		border-radius: 50%;
		background: var(--forest-700);
		color: #fff;
		font-size: 11px;
		font-weight: 700;
		display: grid;
		place-items: center;
		margin-top: 1px;
	}
	.tutorial-step strong {
		font-size: 13px;
		color: var(--forest-800);
	}
	.tutorial-step p {
		margin: 2px 0 0;
		color: #718078;
		font-size: 12px;
		line-height: 1.6;
		max-width: 640px;
	}
</style>