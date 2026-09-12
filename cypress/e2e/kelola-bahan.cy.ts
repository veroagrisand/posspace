import { testEnv } from '../support/commands';

// Regression test fitur "Kelola bahan": pilih dulu Tambah bahan baru ATAU
// Pilih bahan yang sudah ada (untuk menambah stok). Jalan di mode demo
// (server tanpa Supabase); di mode backend butuh kredensial → di-skip.
describe('Kelola bahan (Menu & resep)', () => {
	before(function () {
		testEnv(['posspaceMode']).then(({ posspaceMode }) => {
			if (posspaceMode === 'backend') this.skip();
		});
	});

	const openMenu = () => {
		cy.seedDemoUser({ name: 'Kasir Demo', email: 'kasir@demo.local', shopName: 'Kopi Senja (demo)', password: 'demo-pass-123' });
		cy.visit('/app/menu');
		cy.contains('h1', 'Menu, resep, dan bahan baku.').should('be.visible');
		cy.get('body').should('contain', 'Kasir Demo');
	};

	const addIngredientViaUi = (name: string, unit: string, stock: string) => {
		cy.get('button').contains('+ Kelola bahan').click();
		cy.contains('.ing-choice', 'Tambah bahan baru').click();
		cy.get('#ingName').type(name);
		cy.get('#ingUnit').select(unit);
		cy.get('#ingMin').type('5');
		cy.get('#ingStock').type(stock);
		cy.get('.modal-actions').contains('Simpan').click();
		cy.assertToast('Bahan baku ditambahkan');
		cy.contains('td', name).should('be.visible');
	};

	beforeEach(openMenu);

	it('menampilkan pilihan awal: bahan baru atau bahan yang sudah ada', () => {
		cy.get('button').contains('+ Kelola bahan').click();
		cy.get('[role="dialog"]').should('contain', 'Kelola bahan baku');
		cy.get('.ing-choice').should('have.length', 2);
		cy.contains('.ing-choice', 'Tambah bahan baru').should('be.visible');
		cy.contains('.ing-choice', 'Pilih bahan yang sudah ada').should('be.visible');
		cy.get('button[aria-label="Tutup dialog"]').click();
		cy.get('[role="dialog"]').should('not.exist');
	});

	it('alur tambah bahan baru + kembali', () => {
		cy.get('button').contains('+ Kelola bahan').click();
		cy.contains('.ing-choice', 'Tambah bahan baru').click();
		cy.get('#ingName').should('be.visible');
		cy.get('#ingStock').should('be.visible');
		cy.get('#ingStockAdd').should('not.exist');
		cy.get('.ing-back').click();
		cy.contains('.ing-choice', 'Tambah bahan baru').should('be.visible');
	});

	it('alur pilih bahan yang sudah ada untuk menambah stok', () => {
		addIngredientViaUi('Gula Kelapa', 'gram', '500');
		cy.get('button').contains('+ Kelola bahan').click();
		cy.contains('.ing-choice', 'Pilih bahan yang sudah ada').click();
		cy.get('#ingPick').should('be.visible');
		cy.get('#ingPick').select(1);
		cy.get('#ingName').should('have.value', 'Gula Kelapa');
		cy.get('.ing-stock-now').should('contain', '500 gram');
		cy.get('#ingStockAdd').should('be.visible').clear().type('100');
		cy.get('.modal-actions').contains('Simpan').click();
		cy.assertToast('Stok Gula Kelapa ditambah 100 gram');
		cy.contains('td', 'Gula Kelapa').closest('tr').should('contain', '600 gram');
	});

	it('tombol Ubah di tabel langsung membuka form edit dengan tambah stok', () => {
		addIngredientViaUi('Cokelat Batang', 'pcs', '20');
		cy.contains('td', 'Cokelat Batang').closest('tr').contains('button', 'Ubah').click();
		cy.get('#ingStockAdd').should('be.visible');
		cy.get('.ing-stock-now').should('contain', '20 pcs');
		cy.contains('.ing-back', 'Pilih bahan lain').should('be.visible');
	});
});