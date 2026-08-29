<script lang="ts">
	import PublicPolicyShell from '$lib/components/PublicPolicyShell.svelte';
</script>

<PublicPolicyShell
	title="Refund Policy"
	eyebrow="KEBIJAKAN PENGEMBALIAN DANA"
	intro="Kebijakan pengembalian dana untuk layanan berlangganan posspace dan pembayaran melalui iPaymu."
>
	<h2>1. Ruang lingkup</h2>
	<p>Kebijakan ini berlaku untuk pembayaran paket berlangganan posspace yang dilakukan melalui halaman pembayaran iPaymu. Pembayaran kepada pihak lain atau transaksi yang tidak tercatat sebagai invoice posspace tidak termasuk dalam kebijakan ini.</p>

	<h2>2. Masa uji coba</h2>
	<p>Apabila masa uji coba ditawarkan pada paket yang dipilih, pengguna tidak dikenakan biaya untuk periode uji coba tersebut. Pengguna tetap bertanggung jawab atas informasi akun dan dapat menghentikan penggunaan sebelum pembayaran berikutnya dilakukan.</p>

	<h2>3. Kondisi yang dapat dipertimbangkan untuk refund</h2>
	<p>Permintaan pengembalian dana dapat dipertimbangkan apabila:</p>
	<ul>
		<li>terjadi pembayaran ganda untuk invoice yang sama;</li>
		<li>terjadi kesalahan teknis yang terbukti menyebabkan pembayaran berhasil tetapi layanan tidak dapat diaktifkan; atau</li>
		<li>terdapat kondisi lain yang diwajibkan oleh peraturan yang berlaku.</li>
	</ul>

	<h2>4. Kondisi yang tidak termasuk refund</h2>
	<ul>
		<li>perubahan keputusan setelah layanan berhasil diaktifkan dan sudah digunakan;</li>
		<li>periode langganan yang sudah berjalan sebagian, kecuali disetujui secara tertulis oleh posspace; atau</li>
		<li>kegagalan pembayaran yang disebabkan oleh data pembayaran, rekening, atau layanan bank/e-wallet pengguna.</li>
	</ul>

	<h2>5. Cara mengajukan permintaan</h2>
	<p>Kirim permintaan melalui <a href="/kontak">Kontak</a> menggunakan email akun posspace. Cantumkan nama pemilik akun, nama toko, nomor invoice, tanggal pembayaran, jumlah pembayaran, dan alasan permintaan. Kami dapat meminta bukti pembayaran untuk proses pemeriksaan.</p>

	<h2>6. Proses dan waktu penyelesaian</h2>
	<p>Setiap permintaan diperiksa secara kasus per kasus. Jika disetujui, pengembalian dana diproses ke metode pembayaran asal atau sesuai prosedur iPaymu. Waktu dana masuk dapat berbeda berdasarkan bank, e-wallet, dan channel pembayaran yang digunakan.</p>

	<h2>7. Pembatalan langganan</h2>
	<p>Pengguna dapat menghubungi posspace untuk menghentikan perpanjangan langganan. Pembatalan tidak otomatis menghapus kewajiban atas invoice yang sudah dibuat atau pembayaran yang sudah berhasil.</p>

	<p>Dengan melakukan pembayaran, pengguna menyatakan telah membaca dan memahami kebijakan ini.</p>
</PublicPolicyShell>
