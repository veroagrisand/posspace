<script lang="ts">
	import PublicPolicyShell from '$lib/components/PublicPolicyShell.svelte';
</script>

<PublicPolicyShell
	title="FAQ"
	intro="Jawaban singkat tentang posspace, layanan POS, langganan, dan pembayaran digital."
>
	<h2>Pertanyaan yang sering diajukan</h2>

	<details open>
		<summary>Apa itu posspace?</summary>
		<p>posspace adalah aplikasi kasir dan manajemen stok untuk coffee shop dan usaha minuman. Aplikasi membantu mencatat pesanan, mengelola menu dan resep, memantau bahan baku, serta melihat laporan penjualan.</p>
	</details>

	<details>
		<summary>Apakah posspace bisa digunakan oleh beberapa pengguna?</summary>
		<p>Ya. Pemilik toko dapat mengundang anggota dengan peran kasir, admin gudang, atau pemilik. Hak akses setiap peran dibatasi sesuai kebutuhan operasional toko.</p>
	</details>

	<details>
		<summary>Apakah stok berkurang otomatis saat transaksi selesai?</summary>
		<p>Ya. Jika resep/BOM sudah diatur, sistem memotong bahan baku sesuai jumlah item yang terjual setelah transaksi selesai. Riwayat pergerakan stok juga tersimpan untuk pemeriksaan.</p>
	</details>

	<details>
		<summary>Metode pembayaran apa saja yang didukung?</summary>
		<p>posspace mendukung tunai untuk transaksi kasir dan pembayaran digital melalui Mayar, termasuk QRIS, Virtual Account, dan e-wallet sesuai channel yang tersedia di akun merchant.</p>
	</details>

	<details>
		<summary>Bagaimana pembayaran langganan diproses?</summary>
		<p>Pembayaran langganan dibuat sebagai invoice Mayar. Setelah pembayaran dikonfirmasi melalui callback, status langganan diperbarui secara otomatis. Jangan melakukan pembayaran ulang untuk invoice yang sama.</p>
	</details>

	<details>
		<summary>Apakah ada masa uji coba gratis?</summary>
		<p>Belum ada masa uji coba otomatis. Langganan dimulai saat toko Anda dibuat dan invoice dibuat sebelum aplikasi aktif. Hubungi kami melalui halaman <a href="/kontak">Kontak</a> untuk pertanyaan lain seputar langganan.</p>
	</details>

	<details>
		<summary>Bagaimana cara meminta bantuan?</summary>
		<p>Silakan hubungi kami melalui halaman <a href="/kontak">Kontak</a>. Sertakan alamat email akun, nama toko, waktu kejadian, dan pesan error jika ada agar kami dapat membantu lebih cepat.</p>
	</details>

	<p>Belum menemukan jawaban yang Anda cari? <a href="/kontak">Hubungi tim posspace</a>.</p>
</PublicPolicyShell>
