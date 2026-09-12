describe('Kasir cepat (alur POS via /demo)', () => {
	beforeEach(() => {
		cy.visit('/demo');
		cy.contains('h1', 'Kasir cepat, stok tetap tepat.').should('be.visible');
	});

	it('merender ringkasan, katalog, dan shift tertutup', () => {
		cy.contains('SHIFT DITUTUP').should('be.visible');
		cy.get('button').contains('Buka shift').first().should('be.visible');

		cy.get('[aria-label="Ringkasan hari ini"]').within(() => {
			cy.contains('Omzet hari ini').should('be.visible');
			cy.contains('Pesanan hari ini').should('be.visible');
			cy.contains('HPP hari ini').should('be.visible');
			cy.contains('Stok perlu perhatian').should('be.visible');
		});

		cy.get('.product-card').should('have.length', 6);
		cy.contains('.product-card', 'Es Kopi Susu').should('be.visible');
		cy.contains('.product-card', 'Croffle Cokelat').should('be.visible');
		cy.contains('Keranjang masih kosong').should('be.visible');
	});

	it('buka lalu tutup shift', () => {
		cy.openShift(500000);
		cy.assertToast('Shift dibuka dengan saldo awal');
		cy.contains('SHIFT AKTIF').should('be.visible');
		cy.contains('Shift aktif').should('be.visible');

		cy.closeShift(500000);
		cy.get('button').contains('Buka shift').first().should('be.visible');
	});

	it('tambah produk ke keranjang dengan subtotal + pajak', () => {
		cy.addProduct('Es Kopi Susu', 'Reguler');
		cy.assertToast('Es Kopi Susu (Reguler) ditambahkan');

		cy.contains('h2', 'Keranjang').should('contain', '1 item');
		cy.get('.cart-item').should('have.length', 1);
		cy.get('.cart-item').should('contain', 'Es Kopi Susu').and('contain', 'Reguler');

		cy.get('.order-summary').within(() => {
			cy.contains('Rp 22.000').should('be.visible'); // subtotal
			cy.contains('Rp 2.200').should('be.visible'); // pajak 10%
			cy.contains('Rp 24.200').should('be.visible'); // total
		});
	});

	it('ubah jumlah item di keranjang', () => {
		cy.addProduct('Americano', 'Reguler');
		cy.get('button[aria-label="Tambah Americano"]').click();
		cy.get('button[aria-label="Tambah Americano"]').click();
		cy.contains('h2', 'Keranjang').should('contain', '3 item');
		cy.get('.cart-item .quantity-control span').should('have.text', '3');

		cy.get('button[aria-label="Kurangi Americano"]').click();
		cy.contains('h2', 'Keranjang').should('contain', '2 item');
		cy.get('.cart-item .quantity-control span').should('have.text', '2');
	});

	it('ganti varian produk mengubah harga', () => {
		cy.get('.variant-badges').contains('button', 'Besar').click();
		cy.addProduct('Es Kopi Susu', 'Besar');
		cy.get('.order-summary').contains('Rp 28.600').should('be.visible'); // 26000 + 10%
		cy.get('.cart-item').should('contain', 'Besar');
	});

	it('cari menu dan filter kategori', () => {
		cy.get('input[placeholder="Cari menu..."]').type('matcha');
		cy.get('.product-card').should('have.length', 1);
		cy.contains('.product-card', 'Matcha Latte').should('be.visible');

		cy.get('input[placeholder="Cari menu..."]').clear();
		cy.get('.product-card').should('have.length', 6);

		cy.get('[role="tab"]').contains('Kopi').click();
		cy.get('.product-card').should('have.length', 2);
		cy.contains('.product-card', 'Americano').should('be.visible');
		cy.contains('.product-card', 'Matcha Latte').should('not.exist');

		cy.get('[role="tab"]').contains('Makanan').click();
		cy.get('.product-card').should('have.length', 1);
		cy.contains('.product-card', 'Croffle Cokelat').should('be.visible');

		cy.get('input[placeholder="Cari menu..."]').type('tidak ada');
		cy.contains('Menu tidak ditemukan').should('be.visible');
	});

	it('bayar tunai, verifikasi struk, dan metrik ter-update', () => {
		cy.addProduct('Americano', 'Reguler');
		cy.payCash(50000);

		cy.get('[role="dialog"][aria-label="Struk pesanan"]').within(() => {
			cy.contains('Rincian & struk').should('be.visible');
			cy.get('.receipt-meta').invoke('text').should('match', /No\.\s*PS-\d{8}-\d{4}/);
			cy.get('.receipt-item').should('contain', 'Americano (Reguler)');
			cy.get('.receipt-totals').should('contain', 'Total');
			cy.contains('Uang diterima').should('be.visible');
			cy.contains('Kembalian').should('be.visible');
			cy.get('button').contains('Cetak struk').should('be.visible');
		});

		cy.get('button[aria-label="Tutup dialog"]').click();
		cy.assertToast('Transaksi selesai. Stok bahan dipotong otomatis sesuai resep.');

		cy.get('[aria-label="Ringkasan hari ini"]').within(() => {
			cy.contains('Rp 19.800').should('be.visible'); // omzet hari ini
			cy.contains('strong', '1').should('be.visible'); // pesanan hari ini
		});
		cy.contains('Keranjang masih kosong').should('be.visible');
	});

	it('bayar QRIS dengan referensi', () => {
		cy.addProduct('Matcha Latte', 'Reguler');
		cy.payDigital('QRIS', 'REF-TEST-1');

		cy.get('[role="dialog"][aria-label="Struk pesanan"]').within(() => {
			cy.contains('QRIS').should('be.visible');
			cy.contains('Ref ID').should('be.visible');
			cy.contains('REF-TEST-1').should('be.visible');
		});
	});

	it('bayar debit', () => {
		cy.addProduct('Teh Tarik', 'Reguler');
		cy.payDigital('Debit');

		cy.get('[role="dialog"][aria-label="Struk pesanan"]').within(() => {
			cy.contains('Kartu Debit').should('be.visible');
		});
	});

	it('kunci pembayaran saat stok bahan tidak cukup', () => {
		const addCroffle = () => cy.get('[aria-label="Tambah Croffle Cokelat 1 porsi"]').click();
		const addCokelat = () => cy.get('[aria-label="Tambah Cokelat Panas Reguler"]').click();

		// 40 porsi croffle menghabiskan stok tepung croffle (40 pcs).
		for (let i = 0; i < 40; i++) addCroffle();
		cy.contains('h2', 'Keranjang').should('contain', '40 item');

		// Jumlah tidak bisa ditambah melewati batas stok.
		cy.get('button[aria-label="Tambah Croffle Cokelat"]').click();
		cy.assertToast('Maksimal 40 porsi, stok bahan kurang:');
		cy.contains('h2', 'Keranjang').should('contain', '40 item');

		// 7 cokelat panas (7 × 30g) melewati sisa stok cokelat (200g).
		for (let i = 0; i < 7; i++) addCokelat();
		cy.get('.stock-warning').should('contain', 'Stok bahan tidak cukup, pembayaran dikunci');
		cy.get('.pay-button').should('be.disabled').and('contain', 'Bahan tidak cukup');

		// Kosongkan keranjang membuka kunci pembayaran.
		cy.get('button[aria-label="Kosongkan keranjang"]').click();
		cy.assertToast('Keranjang sudah dikosongkan');
		cy.get('.stock-warning').should('not.exist');
		cy.get('.pay-button').should('not.be.disabled').and('contain', 'Bayar sekarang');
	});

	it('menampilkan panel wawasan operasional', () => {
		cy.get('[aria-label="Ringkasan operasional"]').within(() => {
			cy.contains('Omzet minggu ini').should('be.visible');
			cy.contains('Stok perlu perhatian').should('be.visible');
			cy.contains('Pergerakan stok').should('be.visible');
			cy.contains('Margin per menu').should('be.visible');
		});
	});
});