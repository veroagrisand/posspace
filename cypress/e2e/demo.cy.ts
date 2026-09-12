describe('Demo kasir interaktif (/demo)', () => {
	beforeEach(() => {
		cy.visit('/demo');
		cy.contains('h1', 'Kasir cepat, stok tetap tepat.').should('be.visible');
	});

	it('menyiapkan data contoh dan menampilkan banner demo', () => {
		cy.get('.demo-notice').within(() => {
			cy.contains('strong', 'Demo interaktif').should('be.visible');
			cy.contains('span', 'Data contoh lokal').should('be.visible');
			cy.contains('strong', 'Berakhir dalam').should('be.visible');
		});
		cy.get('[aria-label="Navigasi utama"]').contains('Kopi Senja (demo)').should('be.visible');
		cy.contains('Mode demo').should('be.visible');
	});

	it('sidebar demo hanya menampilkan modul kasir', () => {
		cy.get('[aria-label="Navigasi utama"] .nav-item').should('have.length', 1);
		cy.get('[aria-label="Navigasi utama"] .nav-item').should('contain', 'Kasir');
	});

	it('tautan modul berlangganan diblokir dengan toast', () => {
		cy.contains('a', 'Stok & bahan').click();
		cy.assertToast('Modul ini hanya tersedia di akun berlangganan, tidak di demo');
		cy.url().should('include', '/demo');
	});

	it('keluar dari demo kembali ke beranda', () => {
		cy.get('button[aria-label="Keluar dari aplikasi"]').first().click();
		cy.url().should('eq', Cypress.config().baseUrl + '/');
	});
});