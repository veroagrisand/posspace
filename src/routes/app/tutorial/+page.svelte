<script lang="ts">
	import { backend } from '$lib/store.svelte';

	const sections = [
		{
			title: '1. HPP & harga modal — baca dulu',
			subtitle: 'Semua data rumus HPP diisi manual sekali, lalu HPP dihitung otomatis untuk setiap transaksi.',
			steps: [
				[
					'Rumus HPP',
					'HPP 1 porsi = Σ (jumlah bahan di resep × harga modal bahan). Contoh: 14 g biji kopi × Rp 120/g + 1 pcs filter × Rp 500 = HPP Rp 2.180 per porsi. HPP setiap transaksi dibekukan otomatis saat penjualan — mengubah harga modal nanti tidak mengubah laporan lama.'
				],
				[
					'Input harga modal (data 1)',
					'Menu → "+ Kelola bahan" → isi kolom "Harga modal per satuan (Rp)", atau isi "Jumlah" & "Total harga" lalu harga modal terhitung otomatis (rumus: total ÷ jumlah — mis. kopi 200 gram seharga 150.000 → Rp 750/gram; berlaku untuk satuan gram, ml, dan pcs). Bisa juga diklik langsung di kolom "Harga modal" pada halaman Inventaris. Diisi manual oleh pemilik atau anggota admin gudang.'
				],
				[
					'Input resep (data 2)',
					'Menu → "Kelola" pada produk → untuk tiap varian klik "+ Tambah bahan", pilih bahan & jumlah yang dipakai untuk 1 porsi (mis. 14 gram kopi, 200 ml susu, 1 pcs cup).'
				],
				[
					'HPP otomatis',
					'Setelah harga modal & resep lengkap, HPP dan marjin (%) tampil otomatis di kolom tabel Menu (per varian), di kartu HPP dashboard, dan di Laporan. Target sehat: marjin > 35% (HPP < 65% harga jual).'
				],
				[
					'Penting: pembelian tidak mengubah HPP',
					'Catat pembelian di Inventaris hanya menambah stok & riwayat — harga modal TIDAK ikut berubah. Perbarui manual lewat kolom "Harga modal" hanya jika harga beli benar-benar berubah.'
				]
			]
		},
		{
			title: '2. Kasir cepat',
			subtitle: 'Layani pesanan, terima pembayaran, dan stok terpotong otomatis.',
			steps: [
				['Buka shift', 'Klik "Buka shift" di halaman Kasir, masukkan uang awal laci. Shift aktif = transaksi tercatat ke kasir, rekap kas, dan laporan. Tutup shift di akhir jam kerja untuk mencocokkan kas.'],
				['Pilih menu', 'Klik menu pada grid kiri (cari pakai kolom pencarian, filter kategori Kopi/Non-kopi/Makanan). Pilih varian (Reguler/Besar), atur jumlah di keranjang kanan, tambahkan catatan pesanan bila perlu.'],
				['Metode bayar', 'Tunai: masukkan uang diterima, kembalian otomatis. QRIS: pindai QRIS statis toko Anda — transaksi dicatat sebagai QRIS. Debit: dicatat sebagai debit untuk laporan; isi referensi/ID transaksi (opsional) agar mudah direkonsiliasi.'],
				['Bayar & struk', 'Klik "Bayar sekarang". Struk tampil otomatis — cetak (jika printer diatur) atau kirim. Stok bahan langsung terpotong sesuai resep & HPP transaksi dibekukan.'],
				['Ringkasan atas', 'Empat kartu di atas halaman Kasir: Omzet hari ini, jumlah Pesanan, HPP hari ini (modal bahan + % dari omzet, target < 35%), dan jumlah bahan Stok menipis/kritis.']
			]
		},
		{
			title: '3. Menu & resep',
			subtitle: 'Produk, varian, resep (BOM), dan data HPP — diatur di satu tempat.',
			steps: [
				['Tambah menu', 'Menu → "+ Tambah menu": nama, kategori (Kopi/Non-kopi/Makanan), varian awal & harga. Satu produk bisa punya banyak varian (mis. Reguler/Besar) dengan harga berbeda.'],
				['Kelola varian', 'Menu → "Kelola" pada produk: ubah nama/kategori, tambah varian (nama + harga), atur resep tiap varian. Saat mengubah resep, HPP & marjin di kolom tabel langsung diperbarui.'],
				['Kelola bahan baku', 'Menu → "+ Kelola bahan": tambah/ubah nama, satuan (gram/ml/pcs), batas minimum, dan HARGA MODAL per satuan (dasar HPP). Anggota dengan peran admin gudang juga bisa mengisi.'],
				['Aktif/nonaktif menu', 'Gunakan saklar Status di tabel untuk menyembunyikan menu dari kasir tanpa menghapusnya (mis. stok bahan habis).'],
				['Hapus menu', 'Menu → "Kelola" → tombol "Hapus menu" (menghapus varian & resep, tidak bisa dibatalkan). Transaksi lama tetap tersimpan.']
			]
		},
		{
			title: '4. Inventaris (stok)',
			subtitle: 'Pembelian, harga modal, hitung fisik, dan riwayat — semua terkontrol.',
			steps: [
				['Catat pembelian', 'Inventaris → "+ Catat pembelian": pilih bahan, pemasok, jumlah & satuan beli (mis. 1 kg / 2 Liter), total harga. Sistem menghitung harga/satuan sebagai INFO dan menambah stok otomatis. Harga modal tidak berubah (lihat modul 1).'],
				['Ubah harga modal', 'Klik angka pada kolom "Harga modal" untuk mengubahnya manual (mis. saat harga beli berubah). Perubahan langsung mengupdate HPP semua menu yang memakai bahan itu — stok tidak terpengaruh.'],
				['Hitung fisik (opname)', 'Klik "Hitung fisik", pilih bahan, isi jumlah aktual di lapangan → buat draft → setujui selisih dengan alasan. Stok sistem disesuaikan & tercatat di riwayat audit.'],
				['Pantau stok & riwayat', 'Status bahan: Aman / Menipis / Kritis berdasarkan batas minimum. Tab riwayat menampilkan semua pergerakan: terjual, masuk, opname, penyesuaian.']
			]
		},
		{
			title: '5. Laporan & keuangan',
			subtitle: 'Omzet, HPP, laba, dan menu terlaris — tanpa spreadsheet.',
			steps: [
				['Ringkasan otomatis', 'Menu Laporan menampilkan omzet hari ini, HPP, laba kotor, dan menu terlaris beserta marjin per menu. Semua dihitung dari transaksi yang sudah dibayar lunas.'],
				['Periode & ekspor', 'Pilih periode (harian/mingguan/bulanan/tahunan), lalu unduh laporan penjualan (Excel/PDF/CSV) atau stok (CSV) untuk dibagikan ke akuntan.'],
				['Laba bersih bulanan', 'Menu Operasional → pilih bulan: omzet − HPP − beban operasional = laba bersih. Catat tagihan listrik, sewa, gaji, dll agar angka akurat.']
			]
		},
		{
			title: '6. Operasional (beban)',
			subtitle: 'Pengeluaran non-bahan untuk menghitung laba bersih.',
			steps: [
				['Catat beban', 'Operasional → "+ Catat beban": kategori (Listrik, Air, Internet, Sewa, Gas, Kebersihan, Gaji & upah, Lainnya), jumlah, tanggal, keterangan. Anggota bisa mencatat — hanya pemilik yang bisa menghapus.'],
				['Pantau laba bersih', 'Kartu "Laba bersih" = omzet − HPP − beban pada bulan terpilih. Klik kategori untuk melihat rincian per jenis beban dan bandingkan antar bulan.']
			]
		},
		{
			title: '7. Pengaturan',
			subtitle: 'Profil toko, anggota tim, dan printer struk.',
			steps: [
				['Profil toko', 'Ubah nama, alamat, telepon, mata uang — data ini tampil di struk pelanggan.'],
				['Anggota tim', 'Undang kasir / admin gudang: pilih peran, password sementara muncul di dialog untuk disalin. Peran menentukan hak akses: kasir = layani transaksi; admin gudang = tambah stok, isi harga modal, opname; pemilik = semua termasuk hapus data & beban. Anggota wajib verifikasi email sebelum login.'],
				['Printer struk', 'Pilih printer (USB/browser/agen) atau matikan cetak struk. Pengaturan tersimpan — wizard tidak muncul terus-menerus.'],
				['Wizard awal', 'Setelah toko dibuat, wizard memandu: atur profil, printer, dan lengkapi bahan baku beserta harga modalnya.']
			]
		},
		{
			title: '8. Tips keuangan',
			subtitle: 'Agar usaha tetap untung dan angka laporan akurat.',
			steps: [
				['Jaga marjin menu', 'Cek kolom Marjin di Menu & resep. Jika < 35%, naikkan harga atau cari pemasok lebih murah. Pantau juga kartu "Margin per menu" di dashboard.'],
				['Disiplin input harga modal', 'Isi harga modal setiap kali harga beli berubah — inilah satu-satunya sumber HPP. Jangan biarkan bahan baru berharga modal 0 (HPP akan tampak terlalu murah).'],
				['Catat semua beban', 'Listrik, sewa, gaji, internet — catat tiap bulan agar laba bersih akurat.'],
				['Rutin opname', 'Cocokkan stok fisik vs sistem berkala untuk mendeteksi kehilangan/penyusutan lebih dini.'],
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